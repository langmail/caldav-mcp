import type { CalDAVClient } from "ts-caldav";
import { toAbsoluteUrl, toCalendarPath } from "./tools/caldav-href.js";

interface Account {
	client: CalDAVClient;
	name?: string | undefined;
}

/** The client to use for a calendar, and the calendar path to hand it. */
interface CalendarTarget {
	calendarUrl: string;
	client: CalDAVClient;
}

/** Compares calendar URLs with or without a trailing slash. */
function sameCalendar(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

function absolute(url: string, client: CalDAVClient): string {
	return toAbsoluteUrl(url, client.baseUrl);
}

/**
 * The configured CalDAV accounts. With one account every calendar URL goes to
 * its client as before. With several, a calendar URL goes to the first
 * account whose calendar list contains it, so tools need no account input.
 */
export class Accounts {
	readonly #accounts: readonly Account[];
	readonly #known = new Map<Account, Set<string>>();

	constructor(accounts: readonly Account[]) {
		this.#accounts = accounts;
	}

	/**
	 * Every account's calendars with absolute URLs, tagged with `account` when
	 * there are several, and the accounts that could not be listed. One
	 * unreachable account doesn't hide the others; all of them failing throws.
	 */
	async listCalendars() {
		const results = await Promise.allSettled(
			this.#accounts.map(async (account) => {
				const calendars = (await account.client.getCalendars()).map(
					(calendar) => ({
						...calendar,
						url: absolute(calendar.url, account.client),
					})
				);
				this.#remember(
					account,
					calendars.map((calendar) => calendar.url)
				);
				return this.#accounts.length > 1
					? calendars.map((calendar) => ({
							...calendar,
							account: account.name,
						}))
					: calendars;
			})
		);
		const calendars = results.flatMap((result) =>
			result.status === "fulfilled" ? result.value : []
		);
		const failures = results.flatMap((result, i) =>
			result.status === "rejected"
				? [{ account: this.#accounts[i]?.name, error: result.reason }]
				: []
		);
		const [first] = failures;
		if (first && failures.length === results.length) {
			throw first.error;
		}
		return {
			calendars,
			failures: failures.map(
				({ account, error }) =>
					`Could not list the calendars of account ${account}: ${error instanceof Error ? error.message : String(error)}`
			),
		};
	}

	async forCalendar(calendarUrl: string): Promise<CalendarTarget> {
		const [only] = this.#accounts;
		if (this.#accounts.length === 1 && only) {
			return {
				calendarUrl: toCalendarPath(calendarUrl, only.client.baseUrl),
				client: only.client,
			};
		}
		// A calendar created since the last listing is not known yet.
		const account =
			this.#find(calendarUrl) ??
			(await this.#refresh().then(() => this.#find(calendarUrl)));
		if (!account) {
			throw new Error(
				`No configured account has a calendar at ${calendarUrl}. Call list-calendars and pass a calendar's url unchanged.`
			);
		}
		return {
			calendarUrl: toCalendarPath(calendarUrl, account.client.baseUrl),
			client: account.client,
		};
	}

	#find(calendarUrl: string): Account | undefined {
		return this.#accounts.find((account) =>
			this.#known
				.get(account)
				?.has(sameCalendar(absolute(calendarUrl, account.client)))
		);
	}

	/** Keeps an account's last known calendars when it doesn't answer. */
	async #refresh() {
		await Promise.allSettled(
			this.#accounts.map(async (account) => {
				const calendars = await account.client.getCalendars();
				this.#remember(
					account,
					calendars.map((calendar) => absolute(calendar.url, account.client))
				);
			})
		);
	}

	#remember(account: Account, urls: string[]) {
		this.#known.set(account, new Set(urls.map(sameCalendar)));
	}
}

export function singleAccount(client: CalDAVClient): Accounts {
	return new Accounts([{ client }]);
}
