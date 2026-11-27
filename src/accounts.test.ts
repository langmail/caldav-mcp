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

		expect(await accounts.listCalendars()).toEqual([
			{
				displayName: "/dav/cal/home/",
				url: "https://cal.example.com/dav/cal/home/",
			},
		]);
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

		expect(await accounts.listCalendars()).toEqual([
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
		]);
	});

	it("routes a calendar URL to the account that lists it", async () => {
		const { accounts, family } = twoAccounts();

		const target = await accounts.forCalendar(
			"https://family.example.org/dav/calendars/household/shared"
		);

		expect(target.client).toBe(family);
		expect(target.calendarUrl).toBe("/dav/calendars/household/shared");
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
