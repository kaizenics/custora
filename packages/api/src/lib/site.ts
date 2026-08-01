import { db } from "@custora/db";
import { site } from "@custora/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

/**
 * Resolves the site a request operates on.
 *
 * The app is single-tenant, but every table is already scoped by siteId so a
 * second brand or domain is a UI change rather than a migration. When no id is
 * supplied the oldest site wins, which keeps the common case a no-op.
 */
export async function resolveSite(siteId?: string) {
	if (siteId) {
		const [found] = await db
			.select()
			.from(site)
			.where(eq(site.id, siteId))
			.limit(1);
		if (!found) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
		}
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
	return first;
}
