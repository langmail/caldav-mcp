import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Accounts } from "../accounts.js";
import { hrefFor } from "./caldav-href.js";
import { writableAlarms } from "./reminder.js";

interface CompleteTodoInput {
	calendarUrl: string;
	uid: string;
}

export const completeTodoDefinition = {
	description:
		"Marks a task (VTODO) as done. Sets its status to COMPLETED and records the completion time.",
	inputSchema: {
		calendarUrl: z.string(),
		uid: z
			.string()
			.describe("Unique identifier of the todo to complete (from list-todos)"),
	},
	name: "complete-todo",
	returns: "The unique ID of the completed todo",
} as const;

export function registerCompleteTodo(accounts: Accounts, server: McpServer) {
	server.registerTool(
		completeTodoDefinition.name,
		{
			description: completeTodoDefinition.description,
			inputSchema: completeTodoDefinition.inputSchema,
		},
		async (args: CompleteTodoInput) => {
			const { uid } = args;
			const { calendarUrl, client } = await accounts.forCalendar(
				args.calendarUrl
			);
			const href = hrefFor(calendarUrl, uid);
			const [existing] = await client.getTodosByHref(calendarUrl, [href]);
			if (!existing) {
				throw new Error(`Todo not found: ${uid}`);
			}

			// RFC 5545: a COMPLETED VTODO should carry a COMPLETED timestamp.
			const updated = await client.updateTodo(calendarUrl, {
				...existing,
				...(existing.alarms && { alarms: writableAlarms(existing.alarms) }),
				completed: new Date(),
				status: "COMPLETED",
			});

			return {
				content: [{ text: updated.uid, type: "text" }],
			};
		}
	);
}
