import { db } from "@/db";
import { session, user } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, router } from "../index";

/**
 * Team management. Admin-only in both directions: members cannot see the
 * roster either, because a list of every colleague's email is exactly what a
 * phisher wants from a foothold account.
 */
export const usersRouter = router({
	list: adminProcedure.query(async () => {
		return db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				createdAt: user.createdAt,
			})
			.from(user)
			.orderBy(desc(user.createdAt));
	}),

	setRole: adminProcedure
		.input(
			z.object({
				userId: z.string(),
				role: z.enum(["admin", "member"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.role === "member") {
				/**
				 * Demoting the last admin locks everyone out of role management
				 * permanently — there is no console to fix it from. Counting other
				 * admins (rather than admins minus this one) also covers demoting
				 * someone who is already a member: a no-op, not a lockout.
				 */
				const [admins] = await db
					.select({ total: count() })
					.from(user)
					.where(and(eq(user.role, "admin"), ne(user.id, input.userId)));
				if (!admins || admins.total === 0) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message:
							"This is the only admin. Promote someone else before demoting them.",
					});
				}
			}

			const [updated] = await db
				.update(user)
				.set({ role: input.role })
				.where(eq(user.id, input.userId))
				.returning({ id: user.id, email: user.email, role: user.role });
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
			}

			/**
			 * A demoted user's open sessions still say "admin" until they expire,
			 * and every permission check reads the session. Deleting their session
			 * rows ends that immediately — next request, they sign in again as a
			 * member. Not done on promotion: gaining access can wait a sign-in,
			 * losing it must not.
			 */
			if (input.role === "member" && input.userId !== ctx.session.user.id) {
				await db.delete(session).where(eq(session.userId, input.userId));
			}

			return updated;
		}),
});
