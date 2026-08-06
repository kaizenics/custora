import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * A tracked website. Everything downstream is scoped by `siteId` so a second
 * brand or domain can be added later without a migration.
 */
export const site = sqliteTable(
	"site",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		/** Apex domain the script is installed on, e.g. "custora.com". */
		domain: text("domain").notNull(),
		/** Public key embedded in the snippet. Safe to expose; scoped to ingest only. */
		writeKey: text("write_key").notNull().unique(),
		/**
		 * Secret for pushing ad spend in. Distinct from writeKey, which is embedded
		 * in the page and therefore public — anything accepting that key would let
		 * a stranger write spend figures into the reports. Null until first asked
		 * for, so existing sites do not carry a credential nobody uses.
		 */
		spendKey: text("spend_key").unique(),
		/** Result of the last installation check. Null until one has been run. */
		lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
		lastCheckStatus: text("last_check_status"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(now)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	// One row per domain — adding the same site twice would split its visitors
	// across two write keys and silently halve every report.
	(table) => [uniqueIndex("site_domain_idx").on(table.domain)],
);

/**
 * An anonymous device. Persisted via a first-party cookie set server-side so
 * Safari's ITP does not cap it at 7 days the way a JS-set cookie is capped.
 *
 * `contactId` is null until an `identify` call stitches this device to a person.
 */
export const visitor = sqliteTable(
	"visitor",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		contactId: text("contact_id"),
		firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
	},
	(table) => [
		index("visitor_siteId_idx").on(table.siteId),
		index("visitor_contactId_idx").on(table.contactId),
		index("visitor_lastSeenAt_idx").on(table.lastSeenAt),
	],
);

/**
 * A visit. Closed by inactivity (see SESSION_TIMEOUT_MS in the collector) rather
 * than by a browser session, so a returning visitor gets a fresh row.
 */
export const visitSession = sqliteTable(
	"visit_session",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitor.id, { onDelete: "cascade" }),
		startedAt: integer("started_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		lastEventAt: integer("last_event_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		landingPath: text("landing_path"),
		referrer: text("referrer"),
		referrerHost: text("referrer_host"),
		userAgent: text("user_agent"),
		/** "desktop" | "mobile" | "tablet" | "bot" */
		device: text("device"),
		/**
		 * Where the visit came from. Resolved once when the session is created,
		 * not per event — location does not change mid-visit.
		 */
		country: text("country"),
		region: text("region"),
		city: text("city"),
		/**
		 * Client address, anonymised by default: the last IPv4 octet and the last
		 * 80 bits of IPv6 are zeroed before storage.
		 *
		 * A full IP is personal data under GDPR, and this tracks visitors in the
		 * EU. Truncation keeps it useful for geography and abuse investigation
		 * while no longer identifying a household. Set STORE_FULL_IP=1 only with a
		 * lawful basis and a retention policy to match.
		 */
		ipAddress: text("ip_address"),
		eventCount: integer("event_count").default(0).notNull(),
	},
	(table) => [
		index("visit_session_visitorId_idx").on(table.visitorId),
		index("visit_session_siteId_startedAt_idx").on(
			table.siteId,
			table.startedAt,
		),
	],
);

/**
 * A marketing touch — one row per session that arrived with attributable
 * provenance (click ID, UTM set, or external referrer).
 *
 * Stored raw and never overwritten. Attribution models are computed at read
 * time from these rows, so adding first-touch/linear/time-decay later does not
 * require reprocessing history.
 */
export const touchpoint = sqliteTable(
	"touchpoint",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitor.id, { onDelete: "cascade" }),
		sessionId: text("session_id")
			.notNull()
			.references(() => visitSession.id, { onDelete: "cascade" }),
		/** Denormalised on stitch so contact-scoped reads skip a join. */
		contactId: text("contact_id"),
		source: text("source"),
		medium: text("medium"),
		campaign: text("campaign"),
		term: text("term"),
		content: text("content"),
		/** "google" | "meta" | "tiktok" | "microsoft" | "linkedin" */
		clickIdProvider: text("click_id_provider"),
		clickId: text("click_id"),
		landingUrl: text("landing_url"),
		referrer: text("referrer"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
	},
	(table) => [
		index("touchpoint_visitorId_idx").on(table.visitorId),
		index("touchpoint_contactId_idx").on(table.contactId),
		index("touchpoint_siteId_createdAt_idx").on(table.siteId, table.createdAt),
		index("touchpoint_clickId_idx").on(table.clickId),
	],
);

/**
 * The raw event stream. Append-only and high volume — keep this table's access
 * path separate from the CRM tables so it can be lifted into a columnar store
 * later without touching the rest of the app.
 */
export const event = sqliteTable(
	"event",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitor.id, { onDelete: "cascade" }),
		sessionId: text("session_id")
			.notNull()
			.references(() => visitSession.id, { onDelete: "cascade" }),
		contactId: text("contact_id"),
		/** "pageview" | "click" | "form_submit" | "identify" | "custom" */
		type: text("type").notNull(),
		/** Human label, e.g. "Pricing CTA" or "Book a call". */
		name: text("name"),
		path: text("path"),
		url: text("url"),
		referrer: text("referrer"),
		/** Free-form JSON blob of event properties. */
		props: text("props", { mode: "json" }).$type<Record<string, unknown>>(),
		/** Set on revenue-bearing events so conversions can be summed inline. */
		value: real("value"),
		currency: text("currency"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
	},
	(table) => [
		index("event_siteId_createdAt_idx").on(table.siteId, table.createdAt),
		index("event_visitorId_idx").on(table.visitorId),
		index("event_contactId_idx").on(table.contactId),
		index("event_sessionId_idx").on(table.sessionId),
		index("event_type_idx").on(table.type),
	],
);

/**
 * Audit log of every device-to-person merge. Kept because identity stitching is
 * the part most likely to need debugging when a report looks wrong.
 */
export const identityLink = sqliteTable(
	"identity_link",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitor.id, { onDelete: "cascade" }),
		contactId: text("contact_id").notNull(),
		/** "email" | "phone" | "manual" */
		method: text("method").notNull(),
		/** How many prior events were backfilled onto the contact by this merge. */
		backfilledEvents: integer("backfilled_events").default(0).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
	},
	(table) => [
		uniqueIndex("identity_link_visitor_contact_idx").on(
			table.visitorId,
			table.contactId,
		),
		index("identity_link_contactId_idx").on(table.contactId),
	],
);

export const siteRelations = relations(site, ({ many }) => ({
	visitors: many(visitor),
	sessions: many(visitSession),
	events: many(event),
	touchpoints: many(touchpoint),
}));

export const visitorRelations = relations(visitor, ({ one, many }) => ({
	site: one(site, { fields: [visitor.siteId], references: [site.id] }),
	sessions: many(visitSession),
	events: many(event),
	touchpoints: many(touchpoint),
}));

export const visitSessionRelations = relations(
	visitSession,
	({ one, many }) => ({
		site: one(site, { fields: [visitSession.siteId], references: [site.id] }),
		visitor: one(visitor, {
			fields: [visitSession.visitorId],
			references: [visitor.id],
		}),
		events: many(event),
		touchpoints: many(touchpoint),
	}),
);

export const eventRelations = relations(event, ({ one }) => ({
	site: one(site, { fields: [event.siteId], references: [site.id] }),
	visitor: one(visitor, {
		fields: [event.visitorId],
		references: [visitor.id],
	}),
	session: one(visitSession, {
		fields: [event.sessionId],
		references: [visitSession.id],
	}),
}));

export const touchpointRelations = relations(touchpoint, ({ one }) => ({
	site: one(site, { fields: [touchpoint.siteId], references: [site.id] }),
	visitor: one(visitor, {
		fields: [touchpoint.visitorId],
		references: [visitor.id],
	}),
	session: one(visitSession, {
		fields: [touchpoint.sessionId],
		references: [visitSession.id],
	}),
}));

export const RULE_TRIGGERS = ["click", "submit", "pageview"] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

export const RULE_MATCHERS = ["selector", "text", "href", "path"] as const;
export type RuleMatcher = (typeof RULE_MATCHERS)[number];

/**
 * A tracking rule defined from the dashboard, in the shape of a Google Tag
 * Manager trigger: "when a click matches this selector, record an event called
 * X". The point is that adding tracking stops requiring a code change and a
 * deploy on the tracked site.
 *
 * The tracker still honours data-custora-event attributes and custora.track()
 * calls; rules are an addition, not a replacement.
 */
export const eventRule = sqliteTable(
	"event_rule",
	{
		id: text("id").primaryKey(),
		siteId: text("site_id")
			.notNull()
			.references(() => site.id, { onDelete: "cascade" }),
		/** The event name recorded when this rule fires, e.g. "Booked a call". */
		name: text("name").notNull(),
		/** What the visitor did: click, submit, pageview. */
		trigger: text("trigger").$type<RuleTrigger>().notNull(),
		/** How `pattern` is compared. */
		matcher: text("matcher").$type<RuleMatcher>().notNull(),
		/** CSS selector, substring of text/href, or URL path fragment. */
		pattern: text("pattern").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(now)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(now)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		// The collector reads enabled rules per site on every config fetch.
		index("event_rule_site_enabled_idx").on(table.siteId, table.enabled),
	],
);

export const eventRuleRelations = relations(eventRule, ({ one }) => ({
	site: one(site, { fields: [eventRule.siteId], references: [site.id] }),
}));
