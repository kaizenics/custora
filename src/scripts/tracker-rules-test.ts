/**
 * Runs the real tracker script in a DOM and checks that dashboard-defined rules
 * fire the right named events.
 *
 * The rule engine interpolates user-supplied patterns into querySelector on
 * someone else's page, so the failure modes that matter — a selector that never
 * matches, a malformed one taking the tracker down with it, a click landing
 * before the rules arrive — are only visible against an actual DOM.
 */
import { JSDOM } from "jsdom";

import { TRACKER_SCRIPT } from "@/server/collector/script";

type Posted = { t: string; n: string | null; props: Record<string, unknown> | null };

const WRITE_KEY = "ck_test";
const ORIGIN = "https://track.northgate.dev";

const RULES = [
	{ n: "Booked a call", t: "click", m: "selector", p: "#book-demo" },
	{ n: "Pricing interest", t: "click", m: "text", p: "see pricing" },
	{ n: "Signup link", t: "click", m: "href", p: "/signup" },
	// Deliberately broken: must be skipped without killing the tracker.
	{ n: "Broken rule", t: "click", m: "selector", p: "a[[[" },
];

async function run() {
	const posted: Posted[] = [];

	const dom = new JSDOM(
		`<!doctype html><html><body>
			<button id="book-demo">Reserve a slot</button>
			<button class="other">See Pricing</button>
			<a href="https://northgate.dev/signup">Create account</a>
			<button id="untracked">Nothing</button>
		</body></html>`,
		{ url: "https://northgate.dev/", runScripts: "outside-only", pretendToBeVisual: true },
	);

	const { window } = dom;

	// Stub the network: serve the rules, capture the events.
	// biome-ignore lint/suspicious/noExplicitAny: minimal fetch stub for the test
	(window as any).fetch = (url: string, init?: RequestInit) => {
		if (String(url).includes("/c/v1/config")) {
			return Promise.resolve({ json: () => Promise.resolve({ rules: RULES }) });
		}
		if (String(url).includes("/c/v1/e")) {
			posted.push(JSON.parse(String(init?.body)));
			return Promise.resolve({ ok: true });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
	};

	const script = window.document.createElement("script");
	script.setAttribute("data-key", WRITE_KEY);
	Object.defineProperty(script, "src", { value: `${ORIGIN}/c/v1/custora.js` });
	window.document.body.appendChild(script);
	Object.defineProperty(window.document, "currentScript", { value: script, configurable: true });

	window.eval(TRACKER_SCRIPT);

	// Let the stubbed config fetch resolve.
	await new Promise((r) => setTimeout(r, 50));

	const click = (selector: string) => {
		const el = window.document.querySelector(selector);
		if (!el) throw new Error(`missing ${selector}`);
		el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	};

	click("#book-demo");
	click(".other");
	click("a[href*='signup']");
	click("#untracked");

	await new Promise((r) => setTimeout(r, 20));

	const names = posted.filter((p) => p.t === "click").map((p) => p.n);
	const checks: Array<[string, boolean]> = [
		["tracker loaded and sent a pageview", posted.some((p) => p.t === "pageview")],
		["CSS selector rule fired", names.includes("Booked a call")],
		["text rule fired (case-insensitive)", names.includes("Pricing interest")],
		["href rule fired", names.includes("Signup link")],
		["malformed selector did not fire", !names.includes("Broken rule")],
		["malformed selector did not break later rules", names.length >= 3],
		["untracked element produced no rule event", names.filter(Boolean).length === 3],
	];

	let failed = 0;
	for (const [label, ok] of checks) {
		if (!ok) failed++;
		console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
	}
	console.log(`\nrule events fired: ${JSON.stringify(names.filter(Boolean))}`);
	console.log(`${checks.length - failed}/${checks.length} passed`);
	process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
