import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { site } from "./tracking";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const CONTACT_STATUSES = [
	"lead",
	"qualified",
	"customer",
	"churned",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const DEAL_STAGES = ["open", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

/**
 * A known person. Created the first time an `identify` call carries an email or
 * phone, or manually from the dashboard.
 *
 * `emailHash` / `phoneHash` are SHA-256 of the normalised value. They are what
 * deterministic matching keys off, and what gets uploaded to the ad platforms'
 * conversion APIs — the raw value never leaves the database.
 */
export const contact = sqliteTable(
	"contact",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		email: text("email"),
		emailHash: text("email_hash"),
		phone: text("phone"),
		phoneHash: text("phone_hash"),
		name: text("name"),
		company: text("company"),
		status: text("status").$type<ContactStatus>().default("lead").notNull(),
		/** Where this person came from, resolved at stitch time. Denormalised for list views. */
		firstTouchSource: text("first_touch_source"),
		firstTouchCampaign: text("first_touch_campaign"),
		lastTouchSource: text("last_touch_source"),
		lastTouchCampaign: text("last_touch_campaign"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(now)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("contact_site_email_idx").on(table.siteId, table.emailHash),
		index("contact_siteId_createdAt_idx").on(table.siteId, table.createdAt),
		index("contact_phoneHash_idx").on(table.phoneHash),
		index("contact_status_idx").on(table.status),
	],
);

/**
 * Revenue attached to a person. This is the far end of the loop — a deal with a
 * `wonAt` is what makes a touchpoint worth reporting on.
 */
export const deal = sqliteTable(
	"deal",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		contactId: text("contact_id")
			.notNull()
			.references(() => contact.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		/** Minor units (cents) to keep money out of floating point. */
		valueCents: integer("value_cents").default(0).notNull(),
		currency: text("currency").default("USD").notNull(),
		stage: text("stage").$type<DealStage>().default("open").notNull(),
		/** Set when the deal moves to won or lost. Drives time-to-close reporting. */
		closedAt: integer("closed_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(now)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("deal_contactId_idx").on(table.contactId),
		index("deal_siteId_stage_idx").on(table.siteId, table.stage),
		index("deal_closedAt_idx").on(table.closedAt),
	],
);

/**
 * Daily ad spend per campaign, pulled from the ad platform APIs. Joined against
 * attributed revenue to produce ROAS. Kept as a plain table so spend can also be
 * entered by hand before the integrations land.
 */
export const adSpend = sqliteTable(
	"ad_spend",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		/** Matches touchpoint.source, e.g. "google" | "meta" | "tiktok". */
		source: text("source").notNull(),
		campaign: text("campaign"),
		/** UTC day boundary, so daily rollups do not double count across timezones. */
		date: integer("date", { mode: "timestamp_ms" }).notNull(),
		spendCents: integer("spend_cents").default(0).notNull(),
		currency: text("currency").default("USD").notNull(),
		impressions: integer("impressions"),
		clicks: integer("clicks"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
	},
	(table) => [
		uniqueIndex("ad_spend_site_source_campaign_date_idx").on(
			table.siteId,
			table.source,
			table.campaign,
			table.date,
		),
		index("ad_spend_siteId_date_idx").on(table.siteId, table.date),
	],
);

export const contactRelations = relations(contact, ({ one, many }) => ({
	site: one(site, { fields: [contact.siteId], references: [site.id] }),
	deals: many(deal),
}));

export const dealRelations = relations(deal, ({ one }) => ({
	site: one(site, { fields: [deal.siteId], references: [site.id] }),
	contact: one(contact, { fields: [deal.contactId], references: [contact.id] }),
}));

/** Kept as a plain float helper — money is stored in cents everywhere else. */
export function centsToUnits(cents: number): number {
	return Math.round(cents) / 100;
}

export type Deal = typeof deal.$inferSelect;
export type Contact = typeof contact.$inferSelect;
export type AdSpendRow = typeof adSpend.$inferSelect;
