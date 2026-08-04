import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * A pending invitation to join the dashboard.
 *
 * This exists so public sign-up can stay closed permanently. Opening it to add
 * one colleague means anyone who finds the URL can create an account in the
 * meantime, and every account reads every contact, deal and browsing history
 * collected — a window worth engineering away rather than living with.
 *
 * Only the SHA-256 of the token is stored. The raw token lives in the link and
 * is shown to the inviter exactly once, so a copy of this table is not a set of
 * working invitations.
 */
export const invite = sqliteTable(
	"invite",
	{
		id: text("id").primaryKey(),
		/** Lowercased on write; the address the invite was issued for. */
		email: text("email").notNull(),
		/** "admin" | "member" — the role the account is created with. */
		role: text("role").notNull().default("member"),
		tokenHash: text("token_hash").notNull().unique(),
		invitedByUserId: text("invited_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.$defaultFn(() => new Date())
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		/** Set when claimed. A claimed invite is kept as a record, not deleted. */
		acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
		acceptedUserId: text("accepted_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("invite_email_idx").on(table.email),
		index("invite_token_hash_idx").on(table.tokenHash),
	],
);

export const inviteRelations = relations(invite, ({ one }) => ({
	invitedBy: one(user, {
		fields: [invite.invitedByUserId],
		references: [user.id],
		relationName: "invitedBy",
	}),
	acceptedUser: one(user, {
		fields: [invite.acceptedUserId],
		references: [user.id],
		relationName: "acceptedUser",
	}),
}));
