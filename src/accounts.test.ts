import type { CalDAVClient } from "ts-caldav";
import { describe, expect, it, vi } from "vitest";
import { Accounts, singleAccount } from "./accounts.js";

function client(baseUrl: string, paths: string[]) {
	return {
		baseUrl,
		getCalendars: vi
			.fn()
			.mockResolvedValue(paths.map((url) => ({ displayName: url, url }))),
	};
}

function twoAccounts() {
	const personal = client("https://cal.example.com/dav", [
		"/dav/calendars/alex/home/",
	]);
	const family = client("https://family.example.org/dav", [
		"/dav/calendars/household/shared/",
	]);
	const accounts = new Accounts([
		{ client: personal as unknown as CalDAVClient, name: "personal" },
		{ client: family as unknown as CalDAVClient, name: "family" },
	]);
	return { accounts, family, personal };
}

describe("Accounts with one account", () => {
	it("lists calendars with absolute URLs and no account name", async () => {
		const only = client("https://cal.example.com/dav", ["/dav/cal/home/"]);
		const accounts = singleAccount(only as unknown as CalDAVClient);

		expect(await accounts.listCalendars()).toEqual({
			calendars: [
				{
					displayName: "/dav/cal/home/",
					url: "https://cal.example.com/dav/cal/home/",
				},
			],
			failures: [],
		});
	});

	it("passes any calendar URL to its client without looking it up", async () => {
		const only = client("https://cal.example.com/dav", []);
		const accounts = singleAccount(only as unknown as CalDAVClient);

		const target = await accounts.forCalendar(
			"https://cal.example.com/dav/cal/unlisted/"
		);

		expect(target.client).toBe(only);
		expect(target.calendarUrl).toBe("/dav/cal/unlisted/");
		expect(only.getCalendars).not.toHaveBeenCalled();
	});
});

describe("Accounts with several accounts", () => {
	it("lists the calendars of every account, tagged with its name", async () => {
		const { accounts } = twoAccounts();

		expect(await accounts.listCalendars()).toEqual({
			calendars: [
				{
					account: "personal",
					displayName: "/dav/calendars/alex/home/",
					url: "https://cal.example.com/dav/calendars/alex/home/",
				},
				{
					account: "family",
					displayName: "/dav/calendars/household/shared/",
					url: "https://family.example.org/dav/calendars/household/shared/",
				},
			],
			failures: [],
		});
	});

	it("lists the accounts that answer and names the one that doesn't", async () => {
		const { accounts, family } = twoAccounts();
		family.getCalendars.mockRejectedValue(new Error("HTTP 503"));

		const { calendars, failures } = await accounts.listCalendars();

		expect(calendars.map((c) => c.account)).toEqual(["personal"]);
		expect(failures).toEqual([
			"Could not list the calendars of account family: HTTP 503",
		]);
	});

	it("fails when no account answers", async () => {
		const { accounts, family, personal } = twoAccounts();
		family.getCalendars.mockRejectedValue(new Error("HTTP 503"));
		personal.getCalendars.mockRejectedValue(new Error("HTTP 401"));

		await expect(accounts.listCalendars()).rejects.toThrow("HTTP 401");
	});

	it("routes to an account while another one is unreachable", async () => {
		const { accounts, family } = twoAccounts();
		family.getCalendars.mockRejectedValue(new Error("HTTP 503"));

		const target = await accounts.forCalendar(
			"https://cal.example.com/dav/calendars/alex/home/"
		);

		expect(target.calendarUrl).toBe("/dav/calendars/alex/home/");
	});

	it("routes a calendar URL to the account that lists it", async () => {
		const { accounts, family } = twoAccounts();

		const target = await accounts.forCalendar(
			"https://family.example.org/dav/calendars/household/shared"
		);

		expect(target.client).toBe(family);
		expect(target.calendarUrl).toBe("/dav/calendars/household/shared");
	});

	it("tells apart two servers that serve the same calendar path", async () => {
		const first = client("https://one.example.com", ["/alex/home/"]);
		const second = client("https://two.example.com", ["/alex/home/"]);
		const accounts = new Accounts([
			{ client: first as unknown as CalDAVClient, name: "one" },
			{ client: second as unknown as CalDAVClient, name: "two" },
		]);

		const target = await accounts.forCalendar(
			"https://two.example.com/alex/home/"
		);

		expect(target.client).toBe(second);
		expect(target.calendarUrl).toBe("/alex/home/");
	});

	it("reuses the calendar lists until a URL is not in them", async () => {
		const { accounts, family, personal } = twoAccounts();
		await accounts.listCalendars();

		await accounts.forCalendar(
			"https://cal.example.com/dav/calendars/alex/home/"
		);
		expect(personal.getCalendars).toHaveBeenCalledTimes(1);

		family.getCalendars.mockResolvedValue([
			{ displayName: "new", url: "/dav/calendars/household/new/" },
		]);
		const target = await accounts.forCalendar(
			"https://family.example.org/dav/calendars/household/new/"
		);
		expect(target.client).toBe(family);
		expect(family.getCalendars).toHaveBeenCalledTimes(2);
	});

	it("rejects a URL that belongs to no account", async () => {
		const { accounts } = twoAccounts();

		await expect(
			accounts.forCalendar("https://other.example.net/dav/cal/")
		).rejects.toThrow(
			"No configured account has a calendar at https://other.example.net/dav/cal/. Call list-calendars and pass a calendar's url unchanged."
		);
	});
});
