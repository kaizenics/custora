import { publicProcedure, router } from "../index";
import { adsRouter } from "./ads";
import { analyticsRouter } from "./analytics";
import { contactsRouter } from "./contacts";
import { dealsRouter } from "./deals";
import { eventsRouter } from "./events";
import { invitesRouter } from "./invites";
import { rulesRouter } from "./rules";
import { sitesRouter } from "./sites";
import { usersRouter } from "./users";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => "OK"),
	sites: sitesRouter,
	analytics: analyticsRouter,
	ads: adsRouter,
	events: eventsRouter,
	rules: rulesRouter,
	contacts: contactsRouter,
	deals: dealsRouter,
	users: usersRouter,
	invites: invitesRouter,
});

export type AppRouter = typeof appRouter;
