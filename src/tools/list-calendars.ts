import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Accounts } from "../accounts.js";

export const listCalendarsDefinition = {
	description:
		"List all calendars returning both name and absolute URL. Pass a calendar's `url` unchanged as `calendarUrl` to the other tools.",
	inputSchema: {},
	name: "list-calendars",
	returns:
		"List of all available calendars. When the server has several CalDAV accounts configured, each calendar also has `account`, the name of the account it belongs to, and an account that could not be reached is named in a second text item",
} as const;

export function registerListCalendars(accounts: Accounts, server: McpServer) {
	server.registerTool(
		listCalendarsDefinition.name,
		{
			description: listCalendarsDefinition.description,
			inputSchema: listCalendarsDefinition.inputSchema,
		},
		async () => {
			// ts-caldav returns server-relative hrefs; Accounts resolves them so
			// agents don't have to guess how to prefix the base URL.
			const { calendars, failures } = await accounts.listCalendars();
			return {
				content: [
					{ text: JSON.stringify(calendars), type: "text" as const },
					...failures.map((text) => ({ text, type: "text" as const })),
				],
			};
		}
	);
}
