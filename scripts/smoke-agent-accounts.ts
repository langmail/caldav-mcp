#!/usr/bin/env tsx
// Agent eval for several CalDAV accounts: with two accounts configured, asks
// the agent to create an event in the calendar of the second one and list it,
// then checks that the event landed in that account's calendar and that the
// agent's listing showed it.
//
// The first account is the plain CALDAV_* of `.env`, the second one
// SMOKE_SECOND_BASE_URL, SMOKE_SECOND_USERNAME and SMOKE_SECOND_PASSWORD, so
// `.env` itself stays single-account for the other smoke tests. Without the
// second account the eval is skipped. SMOKE_SINGLE=1 configures only the
// second account, through the plain variables: the single-account baseline
// whose calls the two-account run must not exceed, and the way to run it
// against `main`. SMOKE_SERVER picks the server (default `dist/index.js`).
// Prints one `result:` line and deletes every event it saw created.
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ask } from "./agent-eval.js";

const server = process.env.SMOKE_SERVER ?? "dist/index.js";
const single = process.env.SMOKE_SINGLE === "1";

interface ListedCalendar {
	account?: string;
	supportedComponents?: string[];
	url: string;
}

function env(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing env var: ${name}`);
	}
	return value;
}

function serverEnv(): Record<string, string> {
	const second = {
		BASE_URL: env("SMOKE_SECOND_BASE_URL"),
		PASSWORD: env("SMOKE_SECOND_PASSWORD"),
		USERNAME: env("SMOKE_SECOND_USERNAME"),
	};
	const accounts: Record<string, string> = single
		? {
				CALDAV_BASE_URL: second.BASE_URL,
				CALDAV_PASSWORD: second.PASSWORD,
				CALDAV_USERNAME: second.USERNAME,
			}
		: {
				CALDAV_ACCOUNTS: "personal,family",
				CALDAV_FAMILY_BASE_URL: second.BASE_URL,
				CALDAV_FAMILY_PASSWORD: second.PASSWORD,
				CALDAV_FAMILY_USERNAME: second.USERNAME,
				CALDAV_PERSONAL_BASE_URL: env("CALDAV_BASE_URL"),
				CALDAV_PERSONAL_PASSWORD: env("CALDAV_PASSWORD"),
				CALDAV_PERSONAL_USERNAME: env("CALDAV_USERNAME"),
			};
	return {
		...accounts,
		PATH: process.env.PATH ?? "",
		...(process.env.TZ && { TZ: process.env.TZ }),
	};
}

function textOf(result: unknown): string {
	return (
		(result as { content: Array<{ text: string }> }).content[0]?.text ?? ""
	);
}

/** Tomorrow at `hour` o'clock in this process's time zone. */
function tomorrowAt(hour: number): Date {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(hour, 0, 0, 0);
	return d;
}

async function main() {
	if (!process.env.SMOKE_SECOND_BASE_URL) {
		console.log(
			"result: skip SMOKE_SECOND_BASE_URL is not set (see scripts/smoke-agent-accounts.ts)"
		);
		return;
	}
	const childEnv = serverEnv();
	const mcpConfig = JSON.stringify({
		mcpServers: {
			caldav: { args: [server], command: "node", env: childEnv, type: "stdio" },
		},
	});
	const failures: string[] = [];
	const created: Array<{ calendarUrl: string; uid: string }> = [];
	const summary = `caldav-mcp smoke accounts ${randomUUID().slice(0, 8)}`;

	const client = new Client({ name: "smoke-agent-accounts", version: "0" });
	await client.connect(
		new StdioClientTransport({
			args: [server],
			command: "node",
			env: childEnv,
			stderr: "inherit",
		})
	);

	let calls: string[] = [];
	try {
		const calendars = JSON.parse(
			textOf(await client.callTool({ arguments: {}, name: "list-calendars" }))
		) as ListedCalendar[];
		const familyUrls = new Set(
			calendars
				.filter((c) => single || c.account === "family")
				.map((c) => c.url)
		);

		const turn = ask(
			`Put a 30-minute event called "${summary}" on tomorrow at 10:00 in the first calendar of my family account, then list that calendar's events for tomorrow to confirm it is there.`,
			randomUUID(),
			true,
			mcpConfig
		);
		calls = turn.calls.map((c) => c.name);
		if (turn.error) {
			failures.push(`agent error: ${turn.error}`);
		}

		const creates = turn.calls.filter((c) => c.name === "create-event");
		for (const c of creates) {
			if (c.output && !c.output.startsWith("error")) {
				created.push({
					calendarUrl: String(c.input.calendarUrl),
					uid: c.output.trim(),
				});
			}
		}
		const [event] = created;
		if (created.length !== 1 || !event) {
			failures.push(
				`expected one create-event, got ${JSON.stringify(creates.map((c) => c.output))}`
			);
		} else if (familyUrls.has(event.calendarUrl)) {
			const stored = JSON.parse(
				textOf(
					await client.callTool({
						arguments: {
							calendarUrl: event.calendarUrl,
							end: tomorrowAt(23).toISOString(),
							start: tomorrowAt(0).toISOString(),
						},
						name: "list-events",
					})
				)
			) as Array<{ summary: string; uid: string }>;
			if (!stored.some((e) => e.uid === event.uid && e.summary === summary)) {
				failures.push("the created event is not in the family calendar");
			}
			const listing = turn.calls.find(
				(c) =>
					c.name === "list-events" &&
					c.input.calendarUrl === event.calendarUrl &&
					c.output?.includes(summary)
			);
			if (!listing) {
				failures.push("the agent's listing did not show the event");
			}
		} else {
			failures.push(
				`created in ${event.calendarUrl}, not in a family calendar ${JSON.stringify([...familyUrls])}`
			);
		}
	} finally {
		await Promise.allSettled(
			created.map((arguments_) =>
				client.callTool({ arguments: arguments_, name: "delete-event" })
			)
		);
		await client.close();
	}

	for (const f of failures) {
		console.log(`✗ ${f}`);
	}
	console.log(
		`result: ${failures.length ? "fail" : "pass"} server=${server} accounts=${single ? 1 : 2} calls=${JSON.stringify([calls.length])} tools=${JSON.stringify(calls)}`
	);
	process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
	console.log(`result: error ${String(error)}`);
	process.exitCode = 1;
});
