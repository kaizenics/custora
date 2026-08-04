import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";

import { env } from "@/env/server";

/**
 * Symmetric encryption for third-party credentials held at rest.
 *
 * An OAuth refresh token is a long-lived key to someone else's ad account, and
 * unlike the invite tokens elsewhere in this codebase it cannot be hashed — it
 * has to be replayed to Google verbatim. So it is encrypted instead, and a
 * database dump on its own does not yield working credentials.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than silently producing garbage that gets sent to Google as a token.
 */

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derived from the auth secret rather than stored separately, so there is one
 * secret to rotate and no second one to lose. The fixed salt is deliberate:
 * decryption has to reproduce the key, and a per-value salt would have to be
 * stored alongside the ciphertext for no gain over the random IV already there.
 */
function key(): Buffer {
	return scryptSync(env.BETTER_AUTH_SECRET, "custora.secret-box.v1", KEY_LENGTH);
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function seal(plaintext: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv("aes-256-gcm", key(), iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		"v1",
		iv.toString("base64url"),
		tag.toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

/**
 * Throws on a wrong key or tampered payload rather than returning something
 * plausible — a silently wrong token would surface much later as an opaque
 * Google auth failure.
 */
export function open(sealed: string): string {
	const parts = sealed.split(".");
	if (parts.length !== 4 || parts[0] !== "v1") {
		throw new Error("Malformed sealed value.");
	}

	const iv = Buffer.from(parts[1] ?? "", "base64url");
	const tag = Buffer.from(parts[2] ?? "", "base64url");
	const payload = Buffer.from(parts[3] ?? "", "base64url");
	if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
		throw new Error("Malformed sealed value.");
	}

	const decipher = createDecipheriv("aes-256-gcm", key(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([
		decipher.update(payload),
		decipher.final(),
	]).toString("utf8");
}

/**
 * Signed, expiring state for the OAuth round trip.
 *
 * The callback arrives as a plain browser GET, so without this anyone could
 * hand a signed-in admin a crafted callback URL and bind their own ad account
 * to the workspace. Carrying the site id inside the signature also means the
 * callback cannot be replayed against a different workspace.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(payload: Record<string, string>): string {
	const body = Buffer.from(
		JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS }),
		"utf8",
	).toString("base64url");
	const mac = createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(body)
		.digest("base64url");
	return `${body}.${mac}`;
}

export function verifyState(state: string): Record<string, string> | null {
	const [body, mac] = state.split(".");
	if (!body || !mac) return null;

	const expected = createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(body)
		.digest("base64url");

	// Constant-time: a length mismatch would otherwise leak through timingSafeEqual.
	const given = Buffer.from(mac);
	const want = Buffer.from(expected);
	if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

	try {
		const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
		if (typeof parsed?.exp !== "number" || parsed.exp < Date.now()) return null;
		return parsed as Record<string, string>;
	} catch {
		return null;
	}
}
