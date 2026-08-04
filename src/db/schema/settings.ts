import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * Deployment-level configuration entered through the UI rather than the
 * environment.
 *
 * Scoped to the whole install, not to a site: an OAuth client and a Google Ads
 * developer token belong to the deployment, while the ad *account* they reach
 * is per-workspace and lives in ad_account.
 *
 * Every value is sealed, including the ones that are not strictly secret. A
 * uniform rule is easier to keep right than a per-key judgement about what
 * deserves encryption, and nothing here is read often enough for the cost to
 * matter.
 */
export const appSetting = sqliteTable("app_setting", {
	/** Namespaced, e.g. "google_ads.client_secret". */
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.$defaultFn(() => new Date())
		.notNull(),
	updatedByUserId: text("updated_by_user_id").references(() => user.id, {
		onDelete: "set null",
	}),
});
