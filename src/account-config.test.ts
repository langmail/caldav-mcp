import { describe, expect, it } from "vitest";
import { parseAccountsConfig } from "./account-config.js";

const personal = {
	CALDAV_PERSONAL_BASE_URL: "https://cal.example.com/dav",
	CALDAV_PERSONAL_PASSWORD: "secret-1",
	CALDAV_PERSONAL_USERNAME: "alex",
};
const family = {
	CALDAV_FAMILY_BASE_URL: "https://family.example.org/dav",
	CALDAV_FAMILY_PASSWORD: "secret-2",
	CALDAV_FAMILY_USERNAME: "household",
};

describe("parseAccountsConfig", () => {
	it("reads one unnamed account from the plain variables", () => {
		expect(
			parseAccountsConfig({
				CALDAV_BASE_URL: "https://cal.example.com/dav",
				CALDAV_PASSWORD: "secret",
				CALDAV_USERNAME: "alex",
			})
		).toEqual([
			{
				baseUrl: "https://cal.example.com/dav",
				password: "secret",
				username: "alex",
			},
		]);
	});

	it("reads every account named in CALDAV_ACCOUNTS, keeping the names as written", () => {
		expect(
			parseAccountsConfig({
				CALDAV_ACCOUNTS: "personal, Family",
				CALDAV_BASE_URL: "https://ignored.example.com",
				...personal,
				...family,
			})
		).toEqual([
			{
				baseUrl: "https://cal.example.com/dav",
				name: "personal",
				password: "secret-1",
				username: "alex",
			},
			{
				baseUrl: "https://family.example.org/dav",
				name: "Family",
				password: "secret-2",
				username: "household",
			},
		]);
	});

	it("treats a blank CALDAV_ACCOUNTS as unset", () => {
		expect(
			parseAccountsConfig({ CALDAV_ACCOUNTS: " ", CALDAV_USERNAME: "alex" })
		).toEqual([{ baseUrl: "", password: "", username: "alex" }]);
	});

	it("names every missing variable of a named account", () => {
		const { CALDAV_FAMILY_PASSWORD: _, ...withoutPassword } = family;
		expect(() =>
			parseAccountsConfig({
				CALDAV_ACCOUNTS: "personal,family,work",
				...personal,
				...withoutPassword,
				CALDAV_WORK_BASE_URL: "https://work.example.com",
				CALDAV_WORK_USERNAME: "",
			})
		).toThrow(
			"CALDAV_ACCOUNTS is set, but these variables are missing: CALDAV_FAMILY_PASSWORD, CALDAV_WORK_USERNAME, CALDAV_WORK_PASSWORD"
		);
	});

	it("rejects a name that cannot be part of a variable name", () => {
		expect(() =>
			parseAccountsConfig({ CALDAV_ACCOUNTS: "my-calendar" })
		).toThrow('invalid account name "my-calendar"');
	});

	it("rejects a name listed twice, ignoring case", () => {
		expect(() =>
			parseAccountsConfig({ CALDAV_ACCOUNTS: "personal,PERSONAL", ...personal })
		).toThrow('account "PERSONAL" is listed twice');
	});
});
