/**
 * The workspace resolves which site every screen is reading, so the failure it
 * has to avoid is silent: pointing at a site the user did not choose while the
 * UI still looks correct. These exercise the resolution rule directly.
 *
 *   pnpm test:workspace
 */

type Site = { id: string };

/**
 * Mirrors the resolution in src/lib/workspace.tsx: the stored id is a
 * preference to validate, not a fact to trust.
 */
function resolve(sites: Site[], stored: string | undefined): string | undefined {
	if (!sites.length) return undefined;
	if (stored && sites.some((site) => site.id === stored)) return stored;
	return sites[0]?.id;
}

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(
		`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `\n        expected ${String(expected)}, got ${String(actual)}`}`,
	);
}

const A = { id: "site_a" };
const B = { id: "site_b" };

console.log("\nresolution");
check("no sites → nothing selected", resolve([], undefined), undefined);
check("no sites ignores a stale preference", resolve([], "site_a"), undefined);
check("no preference → first site", resolve([A, B], undefined), "site_a");
check("valid preference is honoured", resolve([A, B], "site_b"), "site_b");

// The case that motivates validating rather than trusting: a site deleted in
// another tab leaves an id in localStorage that no longer exists. Trusting it
// would send every query a siteId the server rejects.
check("deleted site falls back", resolve([A], "site_b"), "site_a");
check("preference for a never-existing site falls back", resolve([A, B], "ghost"), "site_a");

console.log("\nstability");
// Resolution must not drift while nothing changes, or the effect that persists
// the choice would fight itself and re-render forever.
const first = resolve([A, B], undefined);
check("repeat resolution is stable", resolve([A, B], first), first);

// Once a fallback is persisted, it is a valid preference on the next pass.
const afterDelete = resolve([A], "site_b");
check("fallback persists as valid", resolve([A], afterDelete), "site_a");

console.log(
	failures === 0
		? "\nAll workspace checks passed.\n"
		: `\n${failures} check(s) failed.\n`,
);
if (failures > 0) process.exit(1);
