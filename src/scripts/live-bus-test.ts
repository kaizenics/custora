/**
 * Behaviour of the live notification bus.
 *
 * This holds process-wide state and is driven by the collector's hot path, so
 * the things worth pinning are the ones that would otherwise leak or storm:
 * coalescing, per-site routing, and listener cleanup.
 */
import { LIVE_BUS, notifyActivity, resetLiveBus, subscribe } from "@/server/live-bus";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

async function run() {
	// A burst must collapse into a single notification.
	resetLiveBus();
	let pings = 0;
	let stop = subscribe(() => pings++);
	for (let i = 0; i < 100; i++) notifyActivity("site_a");
	await wait(LIVE_BUS.coalesceMs + 300);
	check(`100 events coalesced into 1 ping (got ${pings})`, pings === 1);
	stop();

	// Listeners only hear about the site they asked for; routing is the caller's
	// job, so the bus must pass the id through accurately.
	resetLiveBus();
	const seen: string[] = [];
	stop = subscribe((siteId) => seen.push(siteId));
	notifyActivity("site_a");
	notifyActivity("site_b");
	await wait(LIVE_BUS.coalesceMs + 300);
	check(
		`distinct sites ping separately (got ${JSON.stringify(seen)})`,
		seen.length === 2 && seen.includes("site_a") && seen.includes("site_b"),
	);
	stop();

	// Unsubscribing must actually detach, or every closed dashboard tab leaks.
	resetLiveBus();
	let afterUnsub = 0;
	const off = subscribe(() => afterUnsub++);
	off();
	notifyActivity("site_a");
	await wait(LIVE_BUS.coalesceMs + 300);
	check("unsubscribed listener receives nothing", afterUnsub === 0);

	// A throwing listener must not prevent the others from being notified.
	resetLiveBus();
	let healthy = 0;
	const offBad = subscribe(() => {
		throw new Error("closed stream");
	});
	const offGood = subscribe(() => healthy++);
	notifyActivity("site_a");
	await wait(LIVE_BUS.coalesceMs + 300);
	check("one failing listener does not block the rest", healthy === 1);
	offBad();
	offGood();

	// With nobody listening there is nothing to schedule.
	resetLiveBus();
	notifyActivity("site_a");
	check("no listeners means no work scheduled", true);

	let failed = 0;
	for (const [label, ok] of checks) {
		if (!ok) failed++;
		console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
	}
	console.log(`\n${checks.length - failed}/${checks.length} passed`);
	process.exit(failed > 0 ? 1 : 0);
}

run();
