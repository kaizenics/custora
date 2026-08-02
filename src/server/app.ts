import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { createContext } from "@/api/context";
import { appRouter } from "@/api/routers/index";
import { auth } from "@/auth";

import { collector } from "./collector";

export { API_PREFIXES, isApiPath } from "./paths";

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

/** Cheap liveness probe for Coolify's health check. */
api.get("/healthz", (c) => c.text("OK"));
