/**
 * Renders real components in jsdom and asserts on what comes out.
 *
 * Base UI enforces composition at runtime, not in the types: a GroupLabel
 * outside a Group throws, a Button told to render an anchor complains. None of
 * that reaches typecheck, lint or build, and overlay content is only built
 * when open — so this opens things and looks.
 *
 *   pnpm test:ui
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "http://localhost:3100/",
	pretendToBeVisual: true,
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// Node 24 defines navigator as a getter-only global.
Object.defineProperty(g, "navigator", {
	value: dom.window.navigator,
	configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
	dom.window.setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
g.DOMRect = dom.window.DOMRect;
g.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");

const h = React.createElement;

let failures = 0;

function report(name: string, ok: boolean, detail?: string) {
	if (!ok) failures++;
	console.log(
		`${ok ? "  ok" : "FAIL"}  ${name}` +
			(ok || !detail ? "" : `\n        ${detail.slice(0, 160)}`),
	);
}

/**
 * Renders a tree and returns whatever Base UI objected to, if anything.
 *
 * Some violations throw through the error-boundary path and others only reach
 * console.error, so both are captured — a complaint must not pass by being
 * merely logged.
 */
async function capture(tree: React.ReactNode): Promise<{
	complaint?: string;
	host: HTMLElement;
	/** Call once the DOM has been inspected — unmounting empties the host. */
	done: () => Promise<void>;
}> {
	const host = dom.window.document.createElement("div");
	dom.window.document.body.appendChild(host);
	const root = createRoot(host);

	const logged: string[] = [];
	const origError = console.error;
	console.error = (...args: unknown[]) => logged.push(String(args[0]));

	let thrown: unknown;
	try {
		await act(async () => root.render(tree));
	} catch (error) {
		thrown = error;
	} finally {
		console.error = origError;
	}

	const complaint =
		(thrown ? String(thrown) : undefined) ??
		logged.find((line) => line.includes("Base UI"));

	return {
		complaint,
		host,
		done: async () => {
			await act(async () => root.unmount());
			host.remove();
		},
	};
}

/** A check is only meaningful if it can fail — so prove the failing shape does. */
async function expectComplaint(name: string, tree: React.ReactNode) {
	const { complaint, done } = await capture(tree);
	report(
		name,
		Boolean(complaint),
		"expected Base UI to object, but it rendered without complaint",
	);
	await done();
}

// ── menus ──────────────────────────────────────────────────────────────────

const {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} = await import("@/components/ui/dropdown-menu");

const openMenu = (children: React.ReactNode) =>
	h(
		DropdownMenu,
		{ open: true },
		h(DropdownMenuTrigger, null, "open"),
		h(DropdownMenuContent, null, children),
	);

console.log("\nmenu composition");

// The shape the workspace switcher actually uses.
{
	const { complaint, done } = await capture(
		openMenu(
			h(
				React.Fragment,
				null,
				h(
					DropdownMenuGroup,
					null,
					h(DropdownMenuLabel, null, "Workspaces"),
					h(DropdownMenuItem, { key: "a" }, "Site A"),
					h(DropdownMenuItem, { key: "b" }, "Site B"),
				),
				h(DropdownMenuSeparator),
				h(DropdownMenuItem, null, "New workspace"),
			),
		),
	);
	report("workspace switcher: label inside a group", !complaint, complaint);
	await done();
}

await expectComplaint(
	"control: a bare label is rejected",
	openMenu(
		h(
			React.Fragment,
			null,
			h(DropdownMenuLabel, null, "Workspaces"),
			h(DropdownMenuItem, null, "Site A"),
		),
	),
);

// ── dialogs ────────────────────────────────────────────────────────────────

console.log("\ndialog composition");

const {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} = await import("@/components/ui/dialog");

/**
 * Controlled and triggerless, which is how the workspace switcher and the
 * Install page open the add-site form: the trigger lives outside the dialog,
 * so there is no DialogTrigger child to anchor it.
 */
{
	const { complaint, done } = await capture(
		h(
			Dialog,
			{ open: true, onOpenChange: () => {} },
			h(
				DialogContent,
				null,
				h(
					DialogHeader,
					null,
					h(DialogTitle, null, "Add a site"),
					h(DialogDescription, null, "Scoped to one workspace."),
				),
			),
		),
	);
	// Portalled content lands on document.body rather than inside the host.
	const rendered = dom.window.document.body.textContent?.includes("Add a site");
	report(
		"add-site dialog: controlled, no trigger",
		!complaint && Boolean(rendered),
		complaint ?? "rendered nothing",
	);
	await done();
}

// ── syntax highlighting ────────────────────────────────────────────────────

console.log("\nsyntax highlighting");

const { CodeBlock } = await import("@/components/code-block");

/**
 * A language Prism does not have loaded still renders — as one undifferentiated
 * plain-text run. So "it rendered" proves nothing; these assert that specific
 * constructs came out as the token colours they should be.
 */
async function renderCode(
	name: string,
	code: string,
	language: string,
	expectations: Array<{ text: string; token: string }>,
) {
	const { host, done } = await capture(h(CodeBlock, { code, language }));
	const spans = [...host.querySelectorAll("span")];

	for (const { text, token } of expectations) {
		const hit = spans.find((span) => span.textContent?.includes(text));
		const colour = hit?.getAttribute("style") ?? "";
		report(
			`${name}: "${text}" → ${token}`,
			Boolean(hit) && colour.includes(`var(--code-${token})`),
			hit ? `got style: ${colour || "(none)"}` : "not found in output",
		);
	}
	await done();
}

await renderCode(
	"snippet (markup)",
	'<script defer\n  src="http://localhost:3100/c/v1/custora.js"\n  data-key="ck_abc"></script>',
	"markup",
	[
		{ text: "script", token: "tag" },
		{ text: "data-key", token: "attr" },
		{ text: "ck_abc", token: "string" },
	],
);

await renderCode(
	"tracking calls (jsx)",
	'// Identify a person\ncustora.identify({ email: "sam@northgate.dev" })\n<button data-custora-event="Pricing CTA">Start free</button>',
	"jsx",
	[
		{ text: "// Identify a person", token: "comment" },
		{ text: "identify", token: "function" },
		{ text: "sam@northgate.dev", token: "string" },
	],
);

// ── links styled as buttons ────────────────────────────────────────────────

console.log("\nlinks styled as buttons");

const { Button, buttonVariants } = await import("@/components/ui/button");

/**
 * Navigation controls are anchors wearing button styles, not buttons. Base UI's
 * Button assumes its render target is a native <button> and objects otherwise,
 * and calling a link a button misreports it to assistive tech either way.
 */
{
	const { complaint, host, done } = await capture(
		h(
			"a",
			{ href: "/install", className: buttonVariants({ size: "sm" }) },
			"Add a site",
		),
	);
	report("anchor + buttonVariants renders clean", !complaint, complaint);
	report(
		"…and stays an anchor, not a button",
		host.querySelector("a") !== null && host.querySelector("button") === null,
		`markup: ${host.innerHTML.slice(0, 80)}`,
	);
	await done();
}

await expectComplaint(
	"control: Button rendering an anchor is rejected",
	h(Button, { render: h("a", { href: "/install" }) }, "Add a site"),
);

console.log(
	failures === 0
		? "\nAll UI render checks passed.\n"
		: `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
