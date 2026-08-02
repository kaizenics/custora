import { trpcServer } from "@hono/trpc-server";
import { streamSSE } from "hono/streaming";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { createContext } from "@/api/context";
import { appRouter } from "@/api/routers/index";
import { db } from "@/db";
import { auth, signUpEnabled } from "@/auth";

import { collector } from "./collector";
import { subscribe } from "./live-bus";

export { API_PREFIXES, isApiPath } from "./paths.ts";

/**
 * Every non-page HTTP surface: auth, tRPC, and the public tracking collector.
 *
 * Mounted in front of the app in both environments — as Vite middleware in dev
 * and in server.js in production — so there is exactly one definition of these
 * routes and dev cannot drift from what ships.
 *
 * The dashboard now shares an origin with this, so /trpc and /api need no CORS
 * policy at all. The collector still mounts its own permissive one, because it
 * is called from the sites being tracked.
 */
export const api = new Hono();

api.use(logger());

api.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

api.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => createContext({ context }),
	}),
);

api.route("/c", collector);

/**
 * Pushes a ping whenever the collector records something, so the dashboard can
 * refresh on activity instead of polling. An idle dashboard costs nothing.
 *
 * Authenticated: this reveals that a site is receiving traffic, which is not
 * public information.
 */
api.get("/api/live", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.text("Unauthorized", 401);

	const siteId = c.req.query("siteId");

	return streamSSE(c, async (stream) => {
		let closed = false;
		const finish = () => {
			closed = true;
		};
		stream.onAbort(finish);

		const unsubscribe = subscribe((changedSiteId) => {
			if (closed) return;
			if (siteId && siteId !== changedSiteId) return;
			void stream.writeSSE({ event: "activity", data: changedSiteId });
		});

		try {
			await stream.writeSSE({ event: "ready", data: "ok" });

			/**
			 * Reverse proxies close connections that go quiet — Traefik in front of
			 * Coolify among them. A periodic comment keeps this one alive without
			 * looking like activity to the client.
			 */
			while (!closed) {
				await stream.sleep(25_000);
				if (closed) break;
				await stream.writeSSE({ event: "ping", data: String(Date.now()) });
			}
		} finally {
			unsubscribe();
		}
	});
});

/**
 * Public UI config. Only says whether the sign-up form is worth showing — no
 * secrets, and it is the same answer an attacker gets by submitting the form.
 */
api.get("/api/public-config", (c) => c.json({ signUpEnabled: signUpEnabled() }));

/**
 * Readiness probe. Verifies the database, because a container whose Turso
 * connection is dead can still serve a static "OK" and keep taking traffic it
 * cannot record.
 *
 * The result is cached briefly so the probe cannot itself become a way to
 * hammer the database.
 */
let lastCheck = { at: 0, ok: false };
const HEALTH_CACHE_MS = 5_000;

api.get("/healthz", async (c) => {
	const now = Date.now();

	if (now - lastCheck.at > HEALTH_CACHE_MS) {
		try {
			await db.run(sql`select 1`);
			lastCheck = { at: now, ok: true };
		} catch (error) {
			console.error("[healthz] database unreachable", error);
			lastCheck = { at: now, ok: false };
		}
	}

	return lastCheck.ok
		? c.text("OK")
		: c.text("database unreachable", 503);
});
