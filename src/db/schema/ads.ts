import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { site } from "./tracking";

/**
 * A connected ad platform account.
 *
 * One row per site per provider — a workspace tracks one site, and a site draws
 * spend from one ad account. The refresh token is stored sealed (see
 * secret-box), never in the clear.
 */
export const adAccount = sqliteTable(
	"ad_account",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		/** Only "google" today; the column exists so Meta can join later. */
		provider: text("provider").notNull().default("google"),
		/** Google Ads customer id, digits only (no dashes). */
		customerId: text("customer_id").notNull(),
		/**
		 * The manager (MCC) account the customer sits under, when it does. Google
		 * requires it as the login-customer-id header for manager-managed accounts
		 * and rejects the call without it.
		 */
		loginCustomerId: text("login_customer_id"),
		descriptiveName: text("descriptive_name"),
		currencyCode: text("currency_code"),
		/** AES-256-GCM sealed OAuth refresh token. */
		refreshToken: text("refresh_token").notNull(),
		connectedByUserId: text("connected_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		connectedAt: integer("connected_at", { mode: "timestamp_ms" })
			.$defaultFn(() => new Date())
			.notNull(),
		lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
		/** Last failure, kept so a silently stalled sync is visible in the UI. */
		lastSyncError: text("last_sync_error"),
	},
	(table) => [index("ad_account_siteId_idx").on(table.siteId)],
);
