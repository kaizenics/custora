import { Highlight, type PrismTheme } from "prism-react-renderer";

import { cn } from "@/lib/utils";

/**
 * Colours come from CSS variables rather than a theme object chosen in JS, so
 * light and dark are handled by the same mechanism as the rest of the app. The
 * alternative — reading the active theme and picking a palette — renders the
 * wrong one for a frame on load, and gets it wrong again on a theme toggle
 * until React re-renders.
 */
const THEME: PrismTheme = {
	plain: { color: "var(--code-fg)" },
	styles: [
		{
			types: ["comment", "prolog", "doctype", "cdata"],
			style: { color: "var(--code-comment)" },
		},
		{ types: ["punctuation"], style: { color: "var(--code-punctuation)" } },
		{
			types: ["string", "attr-value", "char", "inserted"],
			style: { color: "var(--code-string)" },
		},
		{
			types: ["number", "boolean", "constant", "symbol"],
			style: { color: "var(--code-number)" },
		},
		{
			types: ["keyword", "operator", "atrule", "selector", "important"],
			style: { color: "var(--code-keyword)" },
		},
		{ types: ["tag"], style: { color: "var(--code-tag)" } },
		{
			types: ["attr-name", "property", "variable"],
			style: { color: "var(--code-attr)" },
		},
		{
			types: ["function", "class-name", "builtin"],
			style: { color: "var(--code-function)" },
		},
	],
};

/**
 * Label and code as one object rather than two floating pieces, and the code
 * set larger than the surrounding UI — it is the thing on the page that has to
 * be read character by character.
 */
export function CodeBlock({
	title,
	action,
	code,
	language = "markup",
	className,
}: {
	title?: React.ReactNode;
	action?: React.ReactNode;
	code: string;
	/** Prism language id. "markup" covers HTML; "jsx" covers JS with tags in it. */
	language?: string;
	className?: string;
}) {
	return (
		<div className={cn("border", className)}>
			{title || action ? (
				<div className="flex items-center justify-between gap-2 border-b bg-muted/40 py-1.5 pr-1.5 pl-3">
					<p className="font-medium text-foreground text-xs">{title}</p>
					{action}
				</div>
			) : null}
			<Highlight theme={THEME} code={code} language={language}>
				{({ style, tokens, getLineProps, getTokenProps }) => (
					<pre
						// Prism's own background is dropped; the block sits on the app's
						// surface so it belongs to the page rather than to the editor.
						style={{ ...style, backgroundColor: undefined }}
						className="overflow-x-auto bg-muted/30 p-4 font-mono text-[13px] leading-6"
					>
						{tokens.map((line, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: lines have no id
								key={i}
								{...getLineProps({ line })}
							>
								{line.map((token, k) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: tokens have no id
									<span key={k} {...getTokenProps({ token })} />
								))}
							</div>
						))}
					</pre>
				)}
			</Highlight>
		</div>
	);
}
