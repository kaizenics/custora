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
	{ n: "Call rule", t: "click", m: "text", p: "Call" },
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
			<a id="phone" href="tel:+34600111222" data-custora-event="Phone call">Call Now</a>
			<a id="bare-tel" href="tel:+34600999888">Call the office</a>
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
	click("#phone");
	click("#bare-tel");

	await new Promise((r) => setTimeout(r, 20));

	const names = posted.filter((p) => p.t === "click").map((p) => p.n);
	const checks: Array<[string, boolean]> = [
		["tracker loaded and sent a pageview", posted.some((p) => p.t === "pageview")],
		["CSS selector rule fired", names.includes("Booked a call")],
		["text rule fired (case-insensitive)", names.includes("Pricing interest")],
		["href rule fired", names.includes("Signup link")],
		["malformed selector did not fire", !names.includes("Broken rule")],
		["malformed selector did not break later rules", names.length >= 3],
		["untracked element produced no rule event", names.filter(Boolean).length === 5],

		/*
		 * The marked phone link carries data-custora-event, matches the "Call"
		 * text rule, and is a tel: link — three things that each used to emit, so
		 * one tap was recorded three times under three names.
		 */
		[
			"marked phone link emits once, under its own name",
			names.filter((n) => n === "Phone call").length === 1,
		],
		[
			// Twice would mean the marked element triggered it as well.
			"the overlapping rule fired only for the unmarked link",
			names.filter((n) => n === "Call rule").length === 1,
		],
		[
			// Precedence 2 beats 3: a rule name is more useful than link text.
			"an unmarked tel: link is named by the rule, not its text",
			!names.includes("Call the office"),
		],
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
