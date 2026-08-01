import { createContext } from "@custora/api/context";
import { appRouter } from "@custora/api/routers/index";
import { auth } from "@custora/auth";
import { env } from "@custora/env/server";
import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { collector } from "./collector";

const app = new Hono();

app.use(logger());

/**
 * The dashboard's own origin lock. The collector under /c mounts its own,
 * looser CORS policy because it has to accept requests from the tracked sites.
 */
app.use(
	"/trpc/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);
app.use(
	"/api/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.route("/c", collector);

app.get("/", (c) => {
	return c.text("OK");
});

serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
