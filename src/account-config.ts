export interface AccountConfig {
	baseUrl: string;
	/** Set only when the accounts come from `CALDAV_ACCOUNTS`. */
	name?: string;
	password: string;
	username: string;
}

const ACCOUNT_NAME = /^[A-Za-z0-9_]+$/u;
const SETTINGS = [
	["baseUrl", "BASE_URL"],
	["username", "USERNAME"],
	["password", "PASSWORD"],
] as const;

/**
 * Reads the CalDAV accounts from the environment. `CALDAV_ACCOUNTS` names
 * several accounts, each configured by `CALDAV_<NAME>_BASE_URL`, `_USERNAME`
 * and `_PASSWORD`; without it, the plain `CALDAV_BASE_URL`, `CALDAV_USERNAME`
 * and `CALDAV_PASSWORD` form the one unnamed account.
 */
export function parseAccountsConfig(env: NodeJS.ProcessEnv): AccountConfig[] {
	const names = (env.CALDAV_ACCOUNTS ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (names.length === 0) {
		return [
			{
				baseUrl: env.CALDAV_BASE_URL || "",
				password: env.CALDAV_PASSWORD || "",
				username: env.CALDAV_USERNAME || "",
			},
		];
	}

	const seen = new Set<string>();
	for (const name of names) {
		if (!ACCOUNT_NAME.test(name)) {
			throw new Error(
				`CALDAV_ACCOUNTS: invalid account name "${name}": use only letters, digits and _`
			);
		}
		const key = name.toUpperCase();
		if (seen.has(key)) {
			throw new Error(`CALDAV_ACCOUNTS: account "${name}" is listed twice`);
		}
		seen.add(key);
	}

	const missing: string[] = [];
	const accounts = names.map((name) => {
		const account: AccountConfig = {
			baseUrl: "",
			name,
			password: "",
			username: "",
		};
		for (const [field, suffix] of SETTINGS) {
			const variable = `CALDAV_${name.toUpperCase()}_${suffix}`;
			const value = env[variable];
			if (value) {
				account[field] = value;
			} else {
				missing.push(variable);
			}
		}
		return account;
	});
	if (missing.length > 0) {
		throw new Error(
			`CALDAV_ACCOUNTS is set, but these variables are missing: ${missing.join(", ")}`
		);
	}
	return accounts;
}
