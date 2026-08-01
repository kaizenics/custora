import { db } from "@custora/db";
import { createId } from "@custora/db/ids";
import { contact, DEAL_STAGES, deal } from "@custora/db/schema";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sum } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveSite } from "../lib/site";

export const dealsRouter = router({
	list: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				stage: z.enum(DEAL_STAGES).optional(),
				page: z.number().min(0).default(0),
				limit: z.number().min(1).max(100).default(25),
			}),
		)
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);

			const filters = [eq(deal.siteId, site.id)];
			if (input.stage) filters.push(eq(deal.stage, input.stage));
			const where = and(...filters);

			const [total] = await db
				.select({ value: count() })
				.from(deal)
				.where(where);

			const items = await db
				.select({
					id: deal.id,
					title: deal.title,
					valueCents: deal.valueCents,
					currency: deal.currency,
					stage: deal.stage,
					closedAt: deal.closedAt,
					createdAt: deal.createdAt,
					contactId: contact.id,
					contactEmail: contact.email,
					contactName: contact.name,
					contactCompany: contact.company,
					/** Carried through so the pipeline table can show what produced each deal. */
					firstTouchSource: contact.firstTouchSource,
					firstTouchCampaign: contact.firstTouchCampaign,
				})
				.from(deal)
				.innerJoin(contact, eq(contact.id, deal.contactId))
				.where(where)
				.orderBy(desc(deal.createdAt))
				.limit(input.limit)
				.offset(input.page * input.limit);

			return {
				items,
				total: total?.value ?? 0,
				page: input.page,
				pageCount: Math.max(1, Math.ceil((total?.value ?? 0) / input.limit)),
			};
		}),

	totals: protectedProcedure
		.input(z.object({ siteId: z.string().optional() }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);

			const rows = await db
				.select({
					stage: deal.stage,
					deals: count(),
					value: sum(deal.valueCents),
				})
				.from(deal)
				.where(eq(deal.siteId, site.id))
				.groupBy(deal.stage);

			const byStage = Object.fromEntries(
				rows.map((row) => [
					row.stage,
					{ deals: row.deals, valueCents: Number(row.value ?? 0) },
				]),
			) as Record<string, { deals: number; valueCents: number }>;

			return {
				open: byStage.open ?? { deals: 0, valueCents: 0 },
				won: byStage.won ?? { deals: 0, valueCents: 0 },
				lost: byStage.lost ?? { deals: 0, valueCents: 0 },
			};
		}),

	create: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				contactId: z.string(),
				title: z.string().min(1).max(200),
				/** Major units from the form; stored as cents. */
				value: z.number().min(0).default(0),
				currency: z.string().length(3).default("USD"),
			}),
		)
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);

			const [owner] = await db
				.select({ id: contact.id })
				.from(contact)
				.where(eq(contact.id, input.contactId))
				.limit(1);
			if (!owner)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Contact not found",
				});

			const [created] = await db
				.insert(deal)
				.values({
					id: createId("deal"),
					siteId: site.id,
					contactId: input.contactId,
					title: input.title,
					valueCents: Math.round(input.value * 100),
					currency: input.currency.toUpperCase(),
					stage: "open",
				})
				.returning();
			return created;
		}),

	/**
	 * Moving a deal to won is what closes the loop — it promotes the contact to
	 * customer, which is what the channel report counts as revenue.
	 */
	updateStage: protectedProcedure
		.input(z.object({ dealId: z.string(), stage: z.enum(DEAL_STAGES) }))
		.mutation(async ({ input }) => {
			const [updated] = await db
				.update(deal)
				.set({
					stage: input.stage,
					closedAt: input.stage === "open" ? null : new Date(),
				})
				.where(eq(deal.id, input.dealId))
				.returning();

			if (!updated)
				throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });

			if (input.stage === "won") {
				await db
					.update(contact)
					.set({ status: "customer" })
					.where(eq(contact.id, updated.contactId));
			}

			return updated;
		}),
});
