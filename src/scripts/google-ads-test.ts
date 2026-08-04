/**
 * Google Ads client and credential sealing.
 *
 * The live OAuth handshake cannot be exercised without a real developer token,
 * so everything that does not need Google is pinned here: the encryption that
 * protects the stored refresh token, the CSRF state, and the response parsing —
 * where a mistake means silently missing spend rather than a visible error.
 *
 *   pnpm test:gads
 */
process.env.BETTER_AUTH_SECRET ||= "test-secret-that-is-at-least-32-chars-long";
process.env.SKIP_ENV_VALIDATION = "1";

import {
	apiVersion,
	authorizeUrl,
	describeApiError,
	gaqlDate,
	microsToCents,
	normaliseCustomerId,
	parseSearchStream,
	redirectUri,
} from "@/api/lib/google-ads";
import { open, seal, signState, verifyState } from "@/api/lib/secret-box";

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ── sealing the refresh token ─────────────────────────────────────────────
const TOKEN = "1//0abcDEF_refresh-token-value";
const sealed = seal(TOKEN);
check("round-trips", open(sealed) === TOKEN);
check("ciphertext does not contain the plaintext", !sealed.includes(TOKEN));
check("versioned envelope", sealed.startsWith("v1."));

// A fresh IV each time, so two seals of the same token are not comparable —
// otherwise a dump would reveal which sites share an account.
check("same input seals differently", seal(TOKEN) !== seal(TOKEN));

function throws(fn: () => unknown): boolean {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}

const parts = sealed.split(".");
// Flip a byte in the ciphertext: GCM must reject rather than return garbage.
const tamperedPayload = Buffer.from(parts[3] ?? "", "base64url");
tamperedPayload[0] = (tamperedPayload[0] ?? 0) ^ 0xff;
check(
	"tampered ciphertext is rejected",
	throws(() =>
		open(`${parts[0]}.${parts[1]}.${parts[2]}.${tamperedPayload.toString("base64url")}`),
	),
);
check("truncated envelope rejected", throws(() => open("v1.abc.def")));
check("unknown version rejected", throws(() => open(`v2.${parts.slice(1).join(".")}`)));

// ── OAuth state ───────────────────────────────────────────────────────────
const state = signState({ siteId: "site_abc", nonce: "n1" });
check("valid state verifies", verifyState(state)?.siteId === "site_abc");
check("tampered state rejected", verifyState(`${state}x`) === null);
check("garbage state rejected", verifyState("not-a-state") === null);
check(
	"state with a swapped body rejected",
	verifyState(
		`${Buffer.from(JSON.stringify({ siteId: "other", exp: Date.now() + 1000 })).toString("base64url")}.${state.split(".")[1]}`,
	) === null,
);
// An expired state must not be honoured — the window is what bounds a
// stolen-callback replay.
const expired = `${Buffer.from(JSON.stringify({ siteId: "s", exp: Date.now() - 1 })).toString("base64url")}`;
check(
	"expired state rejected",
	verifyState(`${expired}.${signState({}).split(".")[1]}`) === null,
);

// ── identifiers and dates ─────────────────────────────────────────────────
check("customer id strips dashes", normaliseCustomerId("123-456-7890") === "1234567890");
check("customer id already clean", normaliseCustomerId("1234567890") === "1234567890");
check("GAQL date is plain UTC date", gaqlDate(new Date(Date.UTC(2026, 7, 4))) === "2026-08-04");

// ── money ─────────────────────────────────────────────────────────────────
// A micro is a millionth; 48.20 in account currency is 48_200_000 micros.
check("micros → cents", microsToCents(48_200_000) === 4820);
check("sub-cent micros round", microsToCents(1_005) === 0);
check("half cent rounds up", microsToCents(5_000) === 1);
check("zero stays zero", microsToCents(0) === 0);

// ── response parsing ──────────────────────────────────────────────────────
// searchStream answers with an array of chunks, each with its own `results`.
// Reading only the first chunk silently loses the rest of the account.
const STREAM = [
	{
		results: [
			{
				campaign: { name: "Emergencias Marbella" },
				segments: { date: "2026-08-01" },
				metrics: { impressions: "1240", clicks: "86", costMicros: "48200000" },
				customer: { currencyCode: "EUR" },
			},
		],
	},
	{
		results: [
			{
				campaign: { name: "Nueva Andalucía" },
				segments: { date: "2026-08-02" },
				metrics: { impressions: "430", clicks: "21", costMicros: "12600000" },
				customer: { currencyCode: "EUR" },
			},
		],
	},
];

const parsed = parseSearchStream(STREAM);
check("reads every chunk, not just the first", parsed.length === 2);
check("string metrics coerced to numbers", parsed[0]?.impressions === 1240);
check("cost carried as micros", parsed[0]?.costMicros === 48_200_000);
check("campaign name read", parsed[1]?.campaign === "Nueva Andalucía");
check("currency read", parsed[0]?.currencyCode === "EUR");
check(
	"micros convert to the same cents the CSV path produces",
	microsToCents(parsed[0]?.costMicros ?? 0) === 4820,
);

// A row with no date cannot be attributed to a day and must be dropped, not
// defaulted to today.
check(
	"undated row dropped",
	parseSearchStream([{ results: [{ campaign: { name: "X" }, metrics: {} }] }]).length === 0,
);
check("empty stream is empty", parseSearchStream([]).length === 0);
check("non-array body tolerated", parseSearchStream({ results: [] }).length === 0);
check("null body tolerated", parseSearchStream(null).length === 0);

// ── error messages ────────────────────────────────────────────────────────
const GOOGLE_ERROR = [
	{
		error: {
			code: 403,
			message: "The caller does not have permission",
			details: [
				{
					errors: [
						{ message: "User doesn't have permission to access customer." },
					],
				},
			],
		},
	},
];
check(
	"nested Google message surfaced",
	describeApiError(403, GOOGLE_ERROR).includes("permission to access customer"),
);
check(
	"404 explains the version may be retired",
	describeApiError(404, null).toLowerCase().includes("version"),
);
check("401 explained", describeApiError(401, null).includes("401"));

// ── consent URL ───────────────────────────────────────────────────────────
const consent = new URL(
	authorizeUrl({ clientId: "cid", baseUrl: "https://app.example.com", state: "st" }),
);
// Without these two, Google issues a refresh token only on the very first
// consent — a reconnect would come back with none and die at the first expiry.
check("offline access requested", consent.searchParams.get("access_type") === "offline");
check("consent forced", consent.searchParams.get("prompt") === "consent");
check("adwords scope", consent.searchParams.get("scope")?.includes("adwords") === true);
check("state carried", consent.searchParams.get("state") === "st");
check(
	"redirect points at our callback",
	consent.searchParams.get("redirect_uri") ===
		"https://app.example.com/api/ads/google/callback",
);
check(
	"redirect uri builder is stable",
	redirectUri("https://app.example.com/") ===
		"https://app.example.com/api/ads/google/callback",
);
check("api version is non-empty", apiVersion().startsWith("v"));

let failed = 0;
for (const [label, ok] of checks) {
	if (!ok) failed++;
	console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed > 0 ? 1 : 0);
