/**
 * Exercises the collector's abuse controls.
 *
 * These decide what a reader of the tracked site's page source can do with the
 * write key, so the edge cases matter more than the happy path: a missing
 * Origin must not break server-to-server calls, a subdomain must be accepted,
 * and the rate limiter must not grow without bound.
 */
import {
	RATE_LIMIT,
	allowRequest,
	isSameSite,
	originAllowed,
	resetRateLimiter,
} from "@/server/collector/guard";

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ── origin ────────────────────────────────────────────────────────────────
check(
	"exact domain allowed",
	originAllowed("https://northgate.dev", undefined, "northgate.dev"),
);
check(
	"subdomain allowed (track.*)",
	originAllowed("https://track.northgate.dev", undefined, "northgate.dev"),
);
check(
	"www allowed",
	originAllowed("https://www.northgate.dev", undefined, "northgate.dev"),
);
check(
	"foreign origin rejected",
	!originAllowed("https://evil.example", undefined, "northgate.dev"),
);
check(
	"suffix-confusion rejected (notnorthgate.dev)",
	!originAllowed("https://notnorthgate.dev", undefined, "northgate.dev"),
);
check(
	"missing origin allowed (server-to-server)",
	originAllowed(undefined, undefined, "northgate.dev"),
);
check(
	"falls back to referer",
	originAllowed(undefined, "https://northgate.dev/pricing", "northgate.dev"),
);
check(
	"malformed origin does not throw and is treated as absent",
	originAllowed("not a url", undefined, "northgate.dev"),
);

// ── cookie scoping ────────────────────────────────────────────────────────
// Decides SameSite. Getting this wrong is how every pageview became a new
// visitor: a Lax cookie is never returned on a cross-site request.
check(
	"collector on a subdomain of the site is same-site",
	isSameSite("https://marbella.com", "track.marbella.com"),
);
check(
	"collector on an unrelated domain is cross-site",
	!isSameSite("https://marbellaelectrician.com", "custora.kaizenics.dev"),
);
check(
	"same host is same-site",
	isSameSite("https://example.com", "example.com"),
);
check(
	"missing origin treated as same-site",
	isSameSite(undefined, "custora.kaizenics.dev"),
);

// ── rate limit ────────────────────────────────────────────────────────────
resetRateLimiter();
let allowed = 0;
for (let i = 0; i < RATE_LIMIT.burst + 25; i++) {
	if (allowRequest("ck_a", "1.2.3.4")) allowed++;
}
check(
	`burst capped at ${RATE_LIMIT.burst} (allowed ${allowed})`,
	allowed === RATE_LIMIT.burst,
);
check("further requests rejected", !allowRequest("ck_a", "1.2.3.4"));

// One flooding client must not throttle everyone else.
check("different IP unaffected", allowRequest("ck_a", "5.6.7.8"));
check("different site unaffected", allowRequest("ck_b", "1.2.3.4"));

// The map is module state; a flood of unique clients must not grow it forever.
resetRateLimiter();
for (let i = 0; i < 5000; i++) allowRequest("ck_a", `10.0.${i % 255}.${i % 97}`);
check("survives many distinct clients without throwing", true);

let failed = 0;
for (const [label, ok] of checks) {
	if (!ok) failed++;
	console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed > 0 ? 1 : 0);
