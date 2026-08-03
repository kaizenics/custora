/**
 * Renders the overlay components with their content open.
 *
 * Base UI enforces composition at runtime rather than in the types — a
 * GroupLabel outside a Group throws when the menu opens, which typecheck,
 * lint and build all pass straight over. Overlays only build their content
 * when open, so this opens them.
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

const {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} = await import("@/components/ui/dropdown-menu");

const h = React.createElement;

let failures = 0;

async function renderOpen(name: string, children: React.ReactNode) {
	const host = dom.window.document.createElement("div");
	dom.window.document.body.appendChild(host);
	const root = createRoot(host);

	// Base UI reports render-phase throws through the error boundary path, and
	// React also logs them; capture both so a swallowed throw cannot pass.
	const logged: string[] = [];
	const origError = console.error;
	console.error = (...args: unknown[]) => logged.push(String(args[0]));

	let thrown: unknown;
	try {
		await act(async () => {
			root.render(
				h(
					DropdownMenu,
					{ open: true },
					h(DropdownMenuTrigger, null, "open"),
					h(DropdownMenuContent, null, children),
				),
			);
		});
	} catch (error) {
		thrown = error;
	} finally {
		console.error = origError;
	}

	const composition = logged.find((line) => line.includes("Base UI"));
	const bad = thrown ?? composition;
	if (bad) {
		failures++;
		console.log(`FAIL  ${name}\n        ${String(bad).slice(0, 160)}`);
	} else {
		console.log(`  ok  ${name}`);
	}

	await act(async () => root.unmount());
	host.remove();
	return host;
}

console.log("\nmenu composition");

// The shape the switcher actually uses.
await renderOpen(
	"workspace switcher: label inside a group",
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
);

// The shape that produced the reported error, kept so the check is known to be
// capable of failing rather than merely passing.
const bare = await renderOpen(
	"control: a bare label must fail",
	h(
		React.Fragment,
		null,
		h(DropdownMenuLabel, null, "Workspaces"),
		h(DropdownMenuItem, null, "Site A"),
	),
);
void bare;

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
async function renderDialog(name: string) {
	const host = dom.window.document.createElement("div");
	dom.window.document.body.appendChild(host);
	const root = createRoot(host);

	const logged: string[] = [];
	const origError = console.error;
	console.error = (...args: unknown[]) => logged.push(String(args[0]));

	let thrown: unknown;
	try {
		await act(async () => {
			root.render(
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
		});
	} catch (error) {
		thrown = error;
	} finally {
		console.error = origError;
	}

	const composition = logged.find((line) => line.includes("Base UI"));
	const bad = thrown ?? composition;
	if (bad) {
		failures++;
		console.log(`FAIL  ${name}\n        ${String(bad).slice(0, 160)}`);
	} else {
		const titled = host.ownerDocument.body.textContent?.includes("Add a site");
		if (!titled) {
			failures++;
			console.log(`FAIL  ${name}\n        rendered nothing`);
		} else {
			console.log(`  ok  ${name}`);
		}
	}

	await act(async () => root.unmount());
	host.remove();
}

await renderDialog("add-site dialog: controlled, no trigger");

// The control is expected to fail, so one failure here is the correct result.
const expected = 1;
console.log(
	failures === expected
		? "\nMenu composition is correct (the control failed as intended).\n"
		: `\n${failures} failure(s), expected ${expected}.\n`,
);
process.exit(failures === expected ? 0 : 1);
