// Shared by the agent evals: runs one `claude -p` turn against a caldav-mcp
// server and collects the caldav tool calls it made.
import { execFileSync } from "node:child_process";

const TOOL_PREFIX = "mcp__caldav__";

interface Call {
	input: Record<string, unknown>;
	name: string;
	output?: string;
}

export interface Turn {
	calls: Call[];
	error?: string;
}

function resultText(content: unknown): string {
	return Array.isArray(content)
		? content.map((c: { text?: string }) => c.text ?? "").join("")
		: String(content);
}

/** The caldav tool calls and the error, if any, in `claude -p` stream-json. */
function parseStream(out: string): Turn {
	const calls = new Map<string, Call>();
	let failure: string | undefined;
	for (const line of out.split("\n").filter((l) => l.trim())) {
		const msg = JSON.parse(line);
		if (msg.type === "result" && msg.is_error) {
			failure = String(msg.result);
		}
		for (const part of msg.message?.content ?? []) {
			if (part.type === "tool_use" && part.name.startsWith(TOOL_PREFIX)) {
				calls.set(part.id, {
					input: part.input,
					name: part.name.slice(TOOL_PREFIX.length),
				});
			}
			const call = calls.get(part.tool_use_id);
			if (part.type === "tool_result" && call) {
				const text = resultText(part.content);
				call.output = part.is_error ? `error: ${text}` : text;
			}
		}
	}
	return { calls: [...calls.values()], ...(failure && { error: failure }) };
}

/** One user message; the first of a session passes `fresh`. */
export function ask(
	prompt: string,
	sessionId: string,
	fresh: boolean,
	mcpConfig: string
): Turn {
	try {
		const out = execFileSync(
			"claude",
			[
				"-p",
				prompt,
				fresh ? "--session-id" : "--resume",
				sessionId,
				"--mcp-config",
				mcpConfig,
				"--strict-mcp-config",
				"--allowedTools",
				`${TOOL_PREFIX}*`,
				"--output-format",
				"stream-json",
				"--verbose",
			],
			{
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		return parseStream(out);
	} catch (error) {
		// Keep the calls made before the failure, so cleanup sees their tasks.
		const { status, stderr, stdout } = error as {
			status?: number;
			stderr?: string;
			stdout?: string;
		};
		let partial: Turn = { calls: [] };
		try {
			partial = parseStream(stdout ?? "");
		} catch {
			// A line cut off mid-write; the calls before it are lost.
		}
		return {
			calls: partial.calls,
			error: `exit ${status}: ${stderr ?? ""} ${(stdout ?? "").slice(-1500)}`,
		};
	}
}
