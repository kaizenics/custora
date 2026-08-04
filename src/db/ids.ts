const ALPHABET = "0123456789abcdefghijkmnopqrstuvwxyz";

/**
 * Prefixed, sortable-ish random id. The prefix makes ids self-describing in
 * logs and URLs, which matters a lot when debugging an attribution chain.
 *
 * Rejection sampling keeps the alphabet distribution flat — no modulo bias.
 */
function randomString(length: number): string {
	const max = 256 - (256 % ALPHABET.length);
	let out = "";
	while (out.length < length) {
		const bytes = crypto.getRandomValues(new Uint8Array(length));
		for (const byte of bytes) {
			if (byte >= max) continue;
			out += ALPHABET[byte % ALPHABET.length];
			if (out.length === length) break;
		}
	}
	return out;
}

export const ID_PREFIX = {
	site: "site",
	visitor: "vis",
	session: "ses",
	event: "evt",
	touchpoint: "tp",
	contact: "con",
	deal: "deal",
	identity: "idl",
	spend: "spd",
	rule: "rule",
	invite: "inv",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

export function createId(prefix: IdPrefix, length = 16): string {
	return `${prefix}_${randomString(length)}`;
}

/**
 * Public ingest key. Unbiased hex — this one is guessable-resistance sensitive,
 * unlike the display ids above.
 */
export function createWriteKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `ck_${hex}`;
}
