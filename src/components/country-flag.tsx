/**
 * Country flag from an ISO 3166-1 alpha-2 code.
 *
 * Rendered as text rather than an image: a flag emoji is two regional-indicator
 * codepoints, so it inherits font size, line height and colour from the row it
 * sits in, needs no asset per country, and survives being copied out with the
 * surrounding text. The 78KB font in globals.css covers every flag — the SVG
 * alternative was 2.6MB, with Serbia alone weighing more than the whole font.
 */

const FIRST_REGIONAL_INDICATOR = 0x1f1e6;
const LETTER_A = 65;

/**
 * Real data carries values that are not countries — "XX" for unknown, "EU" and
 * "AP" for regional allocations, and whatever a geo provider decides to invent.
 * Anything outside two ASCII letters is refused rather than turned into a pair
 * of meaningless glyphs.
 */
export function flagEmoji(code: string | null | undefined): string | null {
	if (!code) return null;
	const upper = code.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) return null;
	if (upper === "XX") return null;

	return String.fromCodePoint(
		...[...upper].map(
			(letter) =>
				FIRST_REGIONAL_INDICATOR + (letter.charCodeAt(0) - LETTER_A),
		),
	);
}

/**
 * Shows the flag, or nothing at all when the code is not one.
 *
 * Deliberately not a fallback glyph: a placeholder in the flag column would
 * read as "somewhere unknown" when the honest answer is that the row already
 * says what it knows.
 */
export function CountryFlag({
	code,
	className,
}: {
	code: string | null | undefined;
	className?: string;
}) {
	const flag = flagEmoji(code);
	if (!flag) return null;

	return (
		<span
			className={className}
			// The country name is beside it in every current use, so announcing the
			// flag as well would just read the place twice.
			aria-hidden
			title={code ?? undefined}
		>
			{flag}
		</span>
	);
}
