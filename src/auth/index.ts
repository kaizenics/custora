import { createDb } from "@/db";
import * as schema from "@/db/schema/auth";
import { env } from "@/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",

      schema: schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
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
