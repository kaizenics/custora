import { db } from "@custora/db";
import { contact, event, visitSession } from "@custora/db/schema";
import { and, count, desc, eq, gte, like, lt, or } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { rangeSchema, rangeStart } from "../lib/range";
import { resolveSite } from "../lib/site";

export const EVENT_TYPES = [
	"pageview",
	"click",
	"form_submit",
	"identify",
	"custom",
] as const;

export const eventsRouter = router({
	/**
	 * Keyset pagination on createdAt. Offset pagination degrades badly on an
	 * append-only table this size, and the stream is always read newest-first.
	 */
	list: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				range: rangeSchema,
				type: z.enum(EVENT_TYPES).optional(),
				search: z.string().max(200).optional(),
				cursor: z.number().optional(),
				limit: z.number().min(1).max(100).default(50),
			}),
		)
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));

			const filters = [eq(event.siteId, site.id), gte(event.createdAt, since)];
			if (input.type) filters.push(eq(event.type, input.type));
			if (input.cursor)
				filters.push(lt(event.createdAt, new Date(input.cursor)));
			if (input.search) {
				const term = `%${input.search}%`;
				const match = or(like(event.name, term), like(event.path, term));
				if (match) filters.push(match);
			}

			const rows = await db
				.select({
					id: event.id,
					type: event.type,
					name: event.name,
					path: event.path,
					url: event.url,
					referrer: event.referrer,
					props: event.props,
					value: event.value,
					currency: event.currency,
					createdAt: event.createdAt,
					visitorId: event.visitorId,
					contactId: event.contactId,
					contactEmail: contact.email,
					contactName: contact.name,
					device: visitSession.device,
					country: visitSession.country,
				})
				.from(event)
				.leftJoin(contact, eq(contact.id, event.contactId))
				.leftJoin(visitSession, eq(visitSession.id, event.sessionId))
				.where(and(...filters))
				.orderBy(desc(event.createdAt))
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;

			return {
				items,
				nextCursor: hasMore
					? (items[items.length - 1]?.createdAt.getTime() ?? null)
					: null,
			};
		}),

	/** Counts per type, used to label the filter chips without a second round trip. */
	countsByType: protectedProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));

			const rows = await db
				.select({ type: event.type, total: count() })
				.from(event)
				.where(and(eq(event.siteId, site.id), gte(event.createdAt, since)))
				.groupBy(event.type);

			return Object.fromEntries(
				rows.map((row) => [row.type, row.total]),
			) as Record<string, number>;
		}),
});
