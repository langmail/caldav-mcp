import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Accounts } from "../accounts.js";
import { hrefFor } from "./caldav-href.js";

interface DeleteEventInput {
	calendarUrl: string;
	uid: string;
}

export const deleteEventDefinition = {
	description: "Deletes an event in the calendar specified by its URL",
	inputSchema: {
		calendarUrl: z.string(),
		uid: z
			.string()
			.describe(
				"Unique identifier of the event to delete (obtained from list-events)"
			),
	},
	name: "delete-event",
	returns: "Confirmation message when the event is successfully deleted",
} as const;

export function registerDeleteEvent(accounts: Accounts, server: McpServer) {
	server.registerTool(
		deleteEventDefinition.name,
		{
			description: deleteEventDefinition.description,
			inputSchema: deleteEventDefinition.inputSchema,
		},
		async (args: DeleteEventInput) => {
			const { uid } = args;
			const { calendarUrl, client } = await accounts.forCalendar(
				args.calendarUrl
			);
			const etag = await client.getETag(hrefFor(calendarUrl, uid));
			await client.deleteEvent(calendarUrl, uid, etag);

			return {
				content: [{ text: "Event deleted", type: "text" }],
			};
		}
	);
}
