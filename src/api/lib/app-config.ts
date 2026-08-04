import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { inArray } from "drizzle-orm";

import { open, seal } from "./secret-box";

/**
 * Deployment settings, stored sealed and read through a short-lived cache.
 *
 * Values entered in the UI take precedence over the environment. The
 * environment stays supported so an existing deployment configured that way
 * keeps working, and so a container can be provisioned without a first-run
 * click — but once someone saves a value here, that is the one that applies.
 */

const CACHE_MS = 30_000;
let cache: { at: number; values: Map<string, string> } | null = null;

export function invalidateAppConfig(): void {
	cache = null;
}

async function load(): Promise<Map<string, string>> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;

	const rows = await db.select().from(appSetting);
	const values = new Map<string, string>();
	for (const row of rows) {
		try {
			values.set(row.key, open(row.value));
		} catch {
			/**
			 * Unreadable means BETTER_AUTH_SECRET changed since this was written.
			 * Skipped rather than thrown: one stale row must not take down every
			 * request that touches configuration. It surfaces as "not configured",
			 * which is what it effectively is.
			 */
		}
	}

	cache = { at: Date.now(), values };
	return values;
}

export async function readSetting(
	key: string,
	envFallback?: string,
): Promise<string | undefined> {
	const values = await load();
	const stored = values.get(key);
	if (stored) return stored;
	return envFallback ? process.env[envFallback] || undefined : undefined;
}

/** Which source a value came from, so the UI can say so. */
export async function settingSource(
	key: string,
	envFallback?: string,
): Promise<"app" | "env" | "unset"> {
	const values = await load();
	if (values.get(key)) return "app";
	if (envFallback && process.env[envFallback]) return "env";
	return "unset";
}

export async function writeSetting(
	key: string,
	value: string,
	userId?: string,
): Promise<void> {
	await db
		.insert(appSetting)
		.values({
			key,
			value: seal(value),
			updatedAt: new Date(),
			updatedByUserId: userId ?? null,
		})
		.onConflictDoUpdate({
			target: appSetting.key,
			set: {
				value: seal(value),
				updatedAt: new Date(),
				updatedByUserId: userId ?? null,
			},
		});
	invalidateAppConfig();
}

export async function clearSettings(keys: string[]): Promise<void> {
	if (!keys.length) return;
	await db.delete(appSetting).where(inArray(appSetting.key, keys));
	invalidateAppConfig();
}

/**
 * Last four characters, for confirming which credential is in place without
 * handing the secret back to the browser.
 */
export function maskSecret(value: string): string {
	if (value.length <= 4) return "••••";
	return `••••${value.slice(-4)}`;
}
