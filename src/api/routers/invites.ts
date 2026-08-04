import { db } from "@/db";
import { createId } from "@/db/ids";
import { invite, user } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, publicProcedure, router } from "../index";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Mirrors the server's own normalisation so lookups cannot miss on case. */
function normaliseEmail(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * 256 bits from the CSPRNG, base64url so it survives a URL untouched. Guessing
 * one is not a threat model worth rate-limiting against.
 */
function createInviteToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Only the digest is stored, so the table is not a set of working invites. */
async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

type InviteRow = typeof invite.$inferSelect;

/**
 * Resolves a raw token to a usable invite, or explains why it is not one.
 *
 * The reasons are deliberately specific: someone holding a genuine but expired
 * link needs to know to ask for a new one, and "invalid" would send them
 * chasing a typo instead.
 */
async function usableInvite(token: string): Promise<InviteRow> {
	const [found] = await db
		.select()
		.from(invite)
		.where(eq(invite.tokenHash, await hashToken(token)))
		.limit(1);

	if (!found) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "This invitation link is not valid. Ask for a new one.",
		});
	}
	if (found.acceptedAt) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This invitation has already been used. Sign in instead, or ask for a new one.",
		});
	}
	if (found.expiresAt.getTime() < Date.now()) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This invitation has expired. Ask for a new one.",
		});
	}
	return found;
}

export const invitesRouter = router({
	/** Pending invitations, newest first. Accepted ones drop off the list. */
	list: adminProcedure.query(async () => {
		return db
			.select({
				id: invite.id,
				email: invite.email,
				role: invite.role,
				createdAt: invite.createdAt,
				expiresAt: invite.expiresAt,
			})
			.from(invite)
			.where(isNull(invite.acceptedAt))
			.orderBy(desc(invite.createdAt));
	}),

	/**
	 * Issues a link. The raw token is returned exactly once and never stored,
	 * so it cannot be shown again — revoke and re-invite instead.
	 */
	create: adminProcedure
		.input(
			z.object({
				email: z.email(),
				role: z.enum(["admin", "member"]).default("member"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const email = normaliseEmail(input.email);

			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, email))
				.limit(1);
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `${email} already has an account. Change their role from the team list instead.`,
				});
			}

			// Re-inviting is a normal thing to do when a link is lost. The old one
			// stops working rather than both being live.
			await db
				.delete(invite)
				.where(and(eq(invite.email, email), isNull(invite.acceptedAt)));

			const token = createInviteToken();
			const [created] = await db
				.insert(invite)
				.values({
					id: createId("inv"),
					email,
					role: input.role,
					tokenHash: await hashToken(token),
					invitedByUserId: ctx.session.user.id,
					expiresAt: new Date(Date.now() + INVITE_TTL_MS),
				})
				.returning({
					id: invite.id,
					email: invite.email,
					role: invite.role,
					expiresAt: invite.expiresAt,
				});

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not create the invitation.",
				});
			}

			return { ...created, token };
		}),

	revoke: adminProcedure
		.input(z.object({ inviteId: z.string() }))
		.mutation(async ({ input }) => {
			const [removed] = await db
				.delete(invite)
				.where(and(eq(invite.id, input.inviteId), isNull(invite.acceptedAt)))
				.returning({ id: invite.id, email: invite.email });
			if (!removed) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "That invitation no longer exists.",
				});
			}
			return removed;
		}),

	/**
	 * What the claim page shows before asking for a password. Public by
	 * necessity — the recipient has no account yet — but it reveals nothing the
	 * holder of the token was not already told.
	 */
	peek: publicProcedure
		.input(z.object({ token: z.string().min(1) }))
		.query(async ({ input }) => {
			const found = await usableInvite(input.token);
			return { email: found.email, role: found.role };
		}),

	/**
	 * Creates the account.
	 *
	 * Goes through Better Auth's own adapter and password hasher rather than the
	 * public sign-up endpoint, which stays disabled — that is the entire point of
	 * inviting rather than opening registration. The role comes from the invite,
	 * never from the request.
	 */
	accept: publicProcedure
		.input(
			z.object({
				token: z.string().min(1),
				name: z.string().min(1).max(120),
				password: z.string().min(12).max(200),
			}),
		)
		.mutation(async ({ input }) => {
			const found = await usableInvite(input.token);

			const [taken] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, found.email))
				.limit(1);
			if (taken) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"An account already exists for this address. Sign in instead.",
				});
			}

			const { auth } = await import("@/auth");
			const authCtx = await auth.$context;

			const account = await authCtx.internalAdapter.createUser({
				email: found.email,
				name: input.name.trim(),
				// The invite went to this address; proving it again adds nothing.
				emailVerified: true,
				role: found.role,
			});

			await authCtx.internalAdapter.createAccount({
				userId: account.id,
				providerId: "credential",
				accountId: account.id,
				password: await authCtx.password.hash(input.password),
			});

			/**
			 * Marked used only after the account exists. The other order would burn
			 * the invite on a failed create and leave the person locked out with a
			 * link that now reports itself as already used.
			 */
			await db
				.update(invite)
				.set({ acceptedAt: new Date(), acceptedUserId: account.id })
				.where(eq(invite.id, found.id));

			return { email: found.email };
		}),
});
