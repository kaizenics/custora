import { createDb } from "@/db";
import * as schema from "@/db/schema/auth";
import { env } from "@/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Origins allowed to call the auth endpoints.
 *
 * BETTER_AUTH_URL is the app's own public origin and is always trusted.
 * TRUSTED_ORIGINS takes an optional comma-separated list for the cases where
 * the dashboard answers on more than one hostname.
 */
function trustedOrigins(): string[] {
	const extra = (process.env.TRUSTED_ORIGINS ?? "")
		.split(",")
		.map((value) => value.trim().replace(/\/$/, ""))
		.filter(Boolean);

	return [...new Set([env.BETTER_AUTH_URL.replace(/\/$/, ""), ...extra])];
}

/**
 * A production deployment pointing at localhost cannot be right, and the way it
 * surfaces otherwise is a bare 403 "Invalid origin" on every sign-in with
 * nothing in the logs to explain it. Fail at boot with the actual cause instead.
 */
function assertOriginConfigured(): void {
	if (env.NODE_ENV !== "production") return;
	if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/.test(env.BETTER_AUTH_URL)) return;

	throw new Error(
		`BETTER_AUTH_URL is "${env.BETTER_AUTH_URL}" in production. It must be the app's ` +
			"public origin (for example https://custora.example.com), because it is used " +
			"as both the auth base URL and the trusted origin. Sign-in returns 403 " +
			"INVALID_ORIGIN until it matches the address the browser is using.",
	);
}

/**
 * Whether anyone reaching /login can create an account.
 *
 * Closed in production unless ALLOW_SIGNUP is explicitly set, because this
 * dashboard exposes every contact, deal and browsing history you have collected
 * — an open sign-up form on a public hostname hands that to whoever finds it.
 *
 * Set ALLOW_SIGNUP=true just long enough to create the accounts you need, then
 * remove it and redeploy.
 */
export function signUpEnabled(): boolean {
	const flag = process.env.ALLOW_SIGNUP;
	if (flag != null) return flag === "true" || flag === "1";
	return env.NODE_ENV !== "production";
}

export function createAuth() {
	assertOriginConfigured();
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",

			schema: schema,
		}),
		trustedOrigins: trustedOrigins(),
		emailAndPassword: {
			enabled: true,
			disableSignUp: !signUpEnabled(),
		},
		user: {
			additionalFields: {
				/**
				 * input: false is the security half of this — without it, a signup
				 * request could simply include role: "admin" in its JSON body and
				 * Better Auth would write it.
				 */
				role: {
					type: "string",
					defaultValue: "member",
					input: false,
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					/**
					 * The first account ever created becomes admin, because someone
					 * has to be and there is no console to appoint them from. Every
					 * later signup starts as member and is promoted from Settings.
					 */
					before: async (data) => {
						const [existing] = await db
							.select({ id: schema.user.id })
							.from(schema.user)
							.limit(1);
						return {
							data: { ...data, role: existing ? "member" : "admin" },
						};
					},
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				// The dashboard and the API share an origin now, so the cookie no
				// longer has to be SameSite=None. Lax is the stricter default and
				// stops the cookie riding along on cross-site requests.
				sameSite: "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
		plugins: [],
	});
}

export const auth = createAuth();
