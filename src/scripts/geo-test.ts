/**
 * Address handling for the collector.
 *
 * This decides what personal data ends up in the database, so the truncation
 * rules and the header-trust rules are worth pinning rather than assuming.
 */
import {
	anonymiseIp,
	clientAddress,
	locationFromHeaders,
	storableIp,
} from "@/server/collector/geo";

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const h = (init: Record<string, string>) => new Headers(init);

// ── truncation ────────────────────────────────────────────────────────────
check("IPv4 host octet zeroed", anonymiseIp("203.0.113.42") === "203.0.113.0");
check("IPv6 truncated to /48", anonymiseIp("2001:db8:abcd:1234::1") === "2001:db8:abcd::");
check("garbage returns null", anonymiseIp("not-an-ip") === null);

// ── storage policy ────────────────────────────────────────────────────────
delete process.env.STORE_FULL_IP;
check(
	"anonymised by default",
	storableIp("203.0.113.42") === "203.0.113.0",
);
process.env.STORE_FULL_IP = "1";
check(
	"full address only when explicitly opted in",
	storableIp("203.0.113.42") === "203.0.113.42",
);
delete process.env.STORE_FULL_IP;

// ── which hop to trust ────────────────────────────────────────────────────
// X-Forwarded-For is a chain the client can prepend to. Only the rightmost
// entry is added by infrastructure we control, so trusting the first would let
// a caller choose its own apparent address.
check(
	"spoofed leading XFF entry ignored, real peer used",
	clientAddress(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" })) === "203.0.113.9",
);
check(
	"single-hop XFF works",
	clientAddress(h({ "x-forwarded-for": "203.0.113.9" })) === "203.0.113.9",
);
check(
	"cf-connecting-ip preferred when present",
	clientAddress(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" })) ===
		"198.51.100.7",
);
check("no headers means no address", clientAddress(h({})) === null);
check(
	"non-IP values rejected rather than stored",
	clientAddress(h({ "x-forwarded-for": "unknown, garbage" })) === null,
);

// ── edge-provided location ────────────────────────────────────────────────
check(
	"cloudflare country read",
	locationFromHeaders(h({ "cf-ipcountry": "es" })).country === "ES",
);
check(
	"cloudflare XX (unknown) treated as absent",
	locationFromHeaders(h({ "cf-ipcountry": "XX" })).country === null,
);
check("no geo headers yields nothing", locationFromHeaders(h({})).country === null);

let failed = 0;
for (const [label, ok] of checks) {
	if (!ok) failed++;
	console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed > 0 ? 1 : 0);
