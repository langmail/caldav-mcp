import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Accounts } from "./accounts.js";
import { registerCompleteTodo } from "./tools/complete-todo.js";
import { registerCreateEvent } from "./tools/create-event.js";
import { registerCreateTodo } from "./tools/create-todo.js";
import { registerDeleteEvent } from "./tools/delete-event.js";
import { registerDeleteTodo } from "./tools/delete-todo.js";
import { registerListCalendars } from "./tools/list-calendars.js";
import { registerListEvents } from "./tools/list-events.js";
import { registerListTodos } from "./tools/list-todos.js";
import { registerUpdateEvent } from "./tools/update-event.js";
import { registerUpdateTodo } from "./tools/update-todo.js";

/**
 * Builds a fresh MCP server with every tool registered. HTTP mode calls this
 * once per request: an McpServer can only be connected to one transport.
 */
export function createServer(accounts: Accounts): McpServer {
	const server = new McpServer({
		name: "caldav-mcp",
		version: "0.1.0",
	});

	registerCreateEvent(accounts, server);
	registerListEvents(accounts, server);
	registerDeleteEvent(accounts, server);
	registerUpdateEvent(accounts, server);
	registerCreateTodo(accounts, server);
	registerListTodos(accounts, server);
	registerUpdateTodo(accounts, server);
	registerCompleteTodo(accounts, server);
	registerDeleteTodo(accounts, server);
	registerListCalendars(accounts, server);

	return server;
}
