import { publicProcedure, router } from "../index";
import { analyticsRouter } from "./analytics";
import { contactsRouter } from "./contacts";
import { dealsRouter } from "./deals";
import { eventsRouter } from "./events";
import { rulesRouter } from "./rules";
import { sitesRouter } from "./sites";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => "OK"),
	sites: sitesRouter,
	analytics: analyticsRouter,
	events: eventsRouter,
	rules: rulesRouter,
	contacts: contactsRouter,
	deals: dealsRouter,
});

export type AppRouter = typeof appRouter;
