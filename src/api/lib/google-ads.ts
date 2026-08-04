/**
 * Google Ads API client — just the part this app needs: exchange a refresh
 * token for an access token, run one GAQL report, hand back daily rows.
 *
 * Deliberately hand-rolled rather than pulling in the official library, which
 * is gRPC-first and drags in a large generated surface for what amounts to two
 * HTTPS calls.
 */

export type GoogleAdsCredentials = {
	clientId: string;
	clientSecret: string;
	developerToken: string;
};

export type CampaignDay = {
	date: string;
	campaign: string | null;
	costMicros: number;
	impressions: number;
	clicks: number;
	currencyCode: string | null;
};

/**
 * The API is versioned in the URL and Google retires versions on a rolling
 * schedule — roughly a year. Pinning a version in source guarantees this file
 * eventually 404s, so the version is configurable and the failure explains
 * itself when it happens.
 */
export const DEFAULT_VERSION = "v21";

export const SETTING_KEYS = {
	clientId: "google_ads.client_id",
	clientSecret: "google_ads.client_secret",
	developerToken: "google_ads.developer_token",
	apiVersion: "google_ads.api_version",
} as const;

/**
 * Synchronous fallback for the two places that only format an error message.
 * Anything that actually calls Google resolves the version through
 * `resolveApiVersion`, which can see the value saved in the UI.
 */
export function apiVersion(): string {
	return process.env.GOOGLE_ADS_API_VERSION || DEFAULT_VERSION;
}

export async function resolveApiVersion(): Promise<string> {
	const { readSetting } = await import("./app-config");
	return (
		(await readSetting(SETTING_KEYS.apiVersion, "GOOGLE_ADS_API_VERSION")) ||
		DEFAULT_VERSION
	);
}

/**
 * Credentials come from the settings saved in the app first, falling back to
 * the environment. Both are supported so a deployment already configured with
 * env vars keeps working, while the UI can take over without a redeploy.
 */
export async function readCredentials(): Promise<GoogleAdsCredentials | null> {
	const { readSetting } = await import("./app-config");
	const [clientId, clientSecret, developerToken] = await Promise.all([
		readSetting(SETTING_KEYS.clientId, "GOOGLE_ADS_CLIENT_ID"),
		readSetting(SETTING_KEYS.clientSecret, "GOOGLE_ADS_CLIENT_SECRET"),
		readSetting(SETTING_KEYS.developerToken, "GOOGLE_ADS_DEVELOPER_TOKEN"),
	]);
	if (!clientId || !clientSecret || !developerToken) return null;
	return { clientId, clientSecret, developerToken };
}

/** Digits only — Google shows customer ids as 123-456-7890 but the API wants 1234567890. */
export function normaliseCustomerId(raw: string): string {
	return raw.replace(/\D/g, "");
}

export function redirectUri(baseUrl: string): string {
	return new URL("/api/ads/google/callback", baseUrl).toString();
}

/**
 * Consent URL.
 *
 * access_type=offline + prompt=consent is what makes Google return a refresh
 * token. Without prompt=consent it only issues one on the *first* ever consent
 * for that client/account pair, so a reconnect after disconnecting would come
 * back with no refresh token and the connection would die at the first expiry.
 */
export function authorizeUrl(options: {
	clientId: string;
	baseUrl: string;
	state: string;
}): string {
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", options.clientId);
	url.searchParams.set("redirect_uri", redirectUri(options.baseUrl));
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("include_granted_scopes", "true");
	url.searchParams.set("state", options.state);
	return url.toString();
}

async function tokenRequest(
	body: Record<string, string>,
): Promise<Record<string, unknown>> {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body).toString(),
	});

	const payload = (await res.json().catch(() => ({}))) as Record<
		string,
		unknown
	>;
	if (!res.ok) {
		const detail =
			(payload.error_description as string) ??
			(payload.error as string) ??
			`HTTP ${res.status}`;
		throw new Error(`Google rejected the token request: ${detail}`);
	}
	return payload;
}

/** Trades the one-time authorization code for a refresh token. */
export async function exchangeCode(options: {
	code: string;
	credentials: GoogleAdsCredentials;
	baseUrl: string;
}): Promise<{ refreshToken: string; accessToken: string }> {
	const payload = await tokenRequest({
		code: options.code,
		client_id: options.credentials.clientId,
		client_secret: options.credentials.clientSecret,
		redirect_uri: redirectUri(options.baseUrl),
		grant_type: "authorization_code",
	});

	const refreshToken = payload.refresh_token as string | undefined;
	if (!refreshToken) {
		// Almost always a consent screen that reused a prior grant.
		throw new Error(
			"Google returned no refresh token. Revoke this app's access in your Google account and connect again.",
		);
	}
	return { refreshToken, accessToken: payload.access_token as string };
}

export async function accessTokenFor(
	refreshToken: string,
	credentials: GoogleAdsCredentials,
): Promise<string> {
	const payload = await tokenRequest({
		refresh_token: refreshToken,
		client_id: credentials.clientId,
		client_secret: credentials.clientSecret,
		grant_type: "refresh_token",
	});

	const accessToken = payload.access_token as string | undefined;
	if (!accessToken) {
		throw new Error("Google returned no access token.");
	}
	return accessToken;
}

/** YYYY-MM-DD in UTC — GAQL date literals are plain dates, not timestamps. */
export function gaqlDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Extracts a usable message from a Google Ads error body.
 *
 * The failure shape is deeply nested and the useful sentence sits several
 * levels down; surfacing the raw JSON would put an unreadable blob in a toast.
 */
export function describeApiError(status: number, body: unknown): string {
	const asRecord = (value: unknown): Record<string, unknown> | null =>
		value && typeof value === "object" ? (value as Record<string, unknown>) : null;

	// searchStream returns errors as a single-element array.
	const first = Array.isArray(body) ? body[0] : body;
	const error = asRecord(asRecord(first)?.error);

	const details = error?.details;
	if (Array.isArray(details)) {
		for (const detail of details) {
			const errors = asRecord(detail)?.errors;
			if (Array.isArray(errors) && errors.length) {
				const message = asRecord(errors[0])?.message;
				if (typeof message === "string") return message;
			}
		}
	}

	const message = error?.message;
	if (typeof message === "string") return message;

	if (status === 401) return "Google rejected the credentials (401).";
	if (status === 403) {
		return "Google denied access (403). Check the developer token has Basic access and covers this customer id.";
	}
	if (status === 404) {
		return `Google Ads API ${apiVersion()} was not found (404). That version may be retired — set GOOGLE_ADS_API_VERSION to a current one.`;
	}
	return `Google Ads API error (HTTP ${status}).`;
}

/**
 * Parses a searchStream response into daily rows.
 *
 * searchStream answers with an *array of chunks*, each holding its own
 * `results` — not one flat list. Reading `body.results` gets the first chunk
 * only, which silently truncates any account big enough to be worth syncing.
 */
export function parseSearchStream(body: unknown): CampaignDay[] {
	const chunks = Array.isArray(body) ? body : [body];
	const rows: CampaignDay[] = [];

	for (const chunk of chunks) {
		const results = (chunk as { results?: unknown })?.results;
		if (!Array.isArray(results)) continue;

		for (const result of results) {
			const row = result as {
				campaign?: { name?: string };
				segments?: { date?: string };
				metrics?: {
					costMicros?: string | number;
					impressions?: string | number;
					clicks?: string | number;
				};
				customer?: { currencyCode?: string };
			};

			const date = row.segments?.date;
			if (!date) continue;

			// Google returns 64-bit metrics as JSON strings, not numbers.
			const num = (value: string | number | undefined): number =>
				value == null ? 0 : Number(value) || 0;

			rows.push({
				date,
				campaign: row.campaign?.name ?? null,
				costMicros: num(row.metrics?.costMicros),
				impressions: num(row.metrics?.impressions),
				clicks: num(row.metrics?.clicks),
				currencyCode: row.customer?.currencyCode ?? null,
			});
		}
	}

	return rows;
}

/**
 * Micros are millionths of the account currency. Going straight to cents keeps
 * one rounding step: micros → cents is ÷10,000, where micros → units → cents
 * would round twice and drift on long ranges.
 */
export function microsToCents(micros: number): number {
	return Math.round(micros / 10_000);
}

export async function fetchCampaignDays(options: {
	customerId: string;
	loginCustomerId?: string | null;
	accessToken: string;
	credentials: GoogleAdsCredentials;
	since: Date;
	until: Date;
}): Promise<CampaignDay[]> {
	const customerId = normaliseCustomerId(options.customerId);
	const query = `
		SELECT
			campaign.name,
			segments.date,
			metrics.impressions,
			metrics.clicks,
			metrics.cost_micros,
			customer.currency_code
		FROM campaign
		WHERE segments.date BETWEEN '${gaqlDate(options.since)}' AND '${gaqlDate(options.until)}'
	`;

	const headers: Record<string, string> = {
		Authorization: `Bearer ${options.accessToken}`,
		"developer-token": options.credentials.developerToken,
		"Content-Type": "application/json",
	};
	if (options.loginCustomerId) {
		headers["login-customer-id"] = normaliseCustomerId(options.loginCustomerId);
	}

	const version = await resolveApiVersion();
	const res = await fetch(
		`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,
		{ method: "POST", headers, body: JSON.stringify({ query }) },
	);

	const body = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(describeApiError(res.status, body));
	}
	return parseSearchStream(body);
}

/** Accounts reachable with this token, for the pick-an-account step. */
export async function listAccessibleCustomers(options: {
	accessToken: string;
	credentials: GoogleAdsCredentials;
}): Promise<string[]> {
	const version = await resolveApiVersion();
	const res = await fetch(
		`https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`,
		{
			headers: {
				Authorization: `Bearer ${options.accessToken}`,
				"developer-token": options.credentials.developerToken,
			},
		},
	);

	const body = await res.json().catch(() => null);
	if (!res.ok) throw new Error(describeApiError(res.status, body));

	const names = (body as { resourceNames?: string[] })?.resourceNames ?? [];
	// "customers/1234567890" → "1234567890"
	return names.map((name) => name.split("/").pop() ?? name);
}
