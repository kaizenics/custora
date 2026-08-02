import { db } from "@/db";
import { site } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

type Site = typeof site.$inferSelect;

/**
 * Sites change on the order of once a month; this helper runs on the order of
 * once per query. The Overview screen alone calls it six times for a single
 * page load, and Turso bills every one of those.
 *
 * A short memo collapses that to one lookup. Mutations bust the cache
 * explicitly, so the window only matters for a change made by a different
 * process — which, on a single container, is nobody.
 */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; site: Site }>();
const DEFAULT_KEY = "__default__";

export function invalidateSiteCache(): void {
	cache.clear();
}

function fromCache(key: string): Site | null {
	const hit = cache.get(key);
	if (!hit) return null;
	if (Date.now() - hit.at > CACHE_MS) {
		cache.delete(key);
		return null;
	}
	return hit.site;
}

/**
 * Resolves the site a request operates on.
 *
 * The app is single-tenant, but every table is already scoped by siteId so a
 * second brand or domain is a UI change rather than a migration. When no id is
 * supplied the oldest site wins, which keeps the common case a no-op.
 */
export async function resolveSite(siteId?: string): Promise<Site> {
	const key = siteId ?? DEFAULT_KEY;
	const cached = fromCache(key);
	if (cached) return cached;

	if (siteId) {
		const [found] = await db
			.select()
			.from(site)
			.where(eq(site.id, siteId))
			.limit(1);
		if (!found) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
		}
		cache.set(key, { at: Date.now(), site: found });
		return found;
	}

	const [first] = await db.select().from(site).orderBy(site.createdAt).limit(1);
	if (!first) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"No site configured yet. Create one under Sites to get a tracking snippet.",
		});
	}
	cache.set(key, { at: Date.now(), site: first });
	return first;
}
