import { Hono } from "hono";

import { auth } from "@/auth";
import { db } from "@/db";
import { createId } from "@/db/ids";
import { adAccount } from "@/db/schema";
import { eq } from "drizzle-orm";

import { seal, signState, verifyState } from "@/api/lib/secret-box";
import {
	accessTokenFor,
	authorizeUrl,
	exchangeCode,
	listAccessibleCustomers,
	normaliseCustomerId,
	readCredentials,
} from "@/api/lib/google-ads";
import { resolveSite } from "@/api/lib/site";
import { getBaseUrl } from "@/lib/base-url";

/**
 * The Google Ads OAuth round trip.
 *
 * This lives on Hono rather than in tRPC because both legs are browser
 * navigations — a redirect out to Google's consent screen and a plain GET back —
 * which a JSON-RPC endpoint cannot express.
 */
export const adsOauth = new Hono();

/** Sends the reader back to the app with a message rather than a bare error page. */
function backToApp(status: "connected" | "error", detail?: string) {
	const url = new URL("/integrations", getBaseUrl());
	url.searchParams.set("google", status);
	if (detail) url.searchParams.set("detail", detail.slice(0, 300));
	return url.toString();
}

type Guard =
	| { ok: false; error: string }
	| { ok: true; session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>> };

async function requireAdmin(headers: Headers): Promise<Guard> {
	const session = await auth.api.getSession({ headers });
	if (!session) return { ok: false, error: "Sign in first." };
	if (session.user.role !== "admin") {
		return { ok: false, error: "Only an admin can connect an ad account." };
	}
	return { ok: true, session };
}

adsOauth.get("/api/ads/google/connect", async (c) => {
	const guard = await requireAdmin(c.req.raw.headers);
	if (!guard.ok) return c.text(guard.error, 403);

	const credentials = await readCredentials();
	if (!credentials) {
		return c.text(
			"Google Ads is not configured on this server. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN.",
			501,
		);
	}

	const site = await resolveSite(c.req.query("siteId") || undefined);

	/**
	 * The site id travels inside a signed, expiring state rather than as a bare
	 * query parameter, so a crafted callback cannot bind an attacker's ad
	 * account to a workspace they do not own.
	 */
	const state = signState({
		siteId: site.id,
		userId: guard.session.user.id,
		nonce: createId("inv", 8),
	});

	return c.redirect(
		authorizeUrl({ clientId: credentials.clientId, baseUrl: getBaseUrl(), state }),
	);
});

adsOauth.get("/api/ads/google/callback", async (c) => {
	const guard = await requireAdmin(c.req.raw.headers);
	if (!guard.ok) return c.text(guard.error, 403);

	// Google reports a declined consent here rather than as an HTTP error.
	const denied = c.req.query("error");
	if (denied) {
		return c.redirect(backToApp("error", `Google returned "${denied}".`));
	}

	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) {
		return c.redirect(backToApp("error", "Google's response was incomplete."));
	}

	const claims = verifyState(state);
	if (!claims?.siteId) {
		return c.redirect(
			backToApp("error", "That authorisation link expired or was tampered with. Try again."),
		);
	}

	// The browser that started the flow must be the one that finishes it.
	if (claims.userId !== guard.session.user.id) {
		return c.redirect(
			backToApp("error", "That authorisation was started by a different account."),
		);
	}

	const credentials = await readCredentials();
	if (!credentials) {
		return c.redirect(backToApp("error", "Google Ads is not configured on this server."));
	}

	try {
		const { refreshToken, accessToken } = await exchangeCode({
			code,
			credentials,
			baseUrl: getBaseUrl(),
		});

		/**
		 * Which customer id to use is not something the admin should have to look
		 * up — ask Google what this grant can reach. A single account is chosen
		 * outright; several means the UI has to offer a choice, so the connection
		 * is stored against the first and the rest are surfaced for switching.
		 */
		const customers = await listAccessibleCustomers({ accessToken, credentials });
		if (!customers.length) {
			return c.redirect(
				backToApp(
					"error",
					"That Google account cannot reach any Ads accounts. Sign in with the account that manages your campaigns.",
				),
			);
		}

		const customerId = normaliseCustomerId(customers[0] ?? "");
		const existing = await db
			.select({ id: adAccount.id })
			.from(adAccount)
			.where(eq(adAccount.siteId, claims.siteId))
			.limit(1);

		const values = {
			siteId: claims.siteId,
			provider: "google",
			customerId,
			refreshToken: seal(refreshToken),
			connectedByUserId: guard.session.user.id,
			connectedAt: new Date(),
			lastSyncError: null,
		};

		if (existing[0]) {
			await db
				.update(adAccount)
				.set(values)
				.where(eq(adAccount.id, existing[0].id));
		} else {
			await db.insert(adAccount).values({ id: createId("spd"), ...values });
		}

		return c.redirect(
			backToApp(
				"connected",
				customers.length > 1
					? `Connected ${customerId}. ${customers.length - 1} other account(s) are reachable — switch in settings if this is the wrong one.`
					: undefined,
			),
		);
	} catch (error) {
		return c.redirect(backToApp("error", (error as Error).message));
	}
});

/** Confirms the token still works, without waiting for the next sync to fail. */
export async function verifyConnection(sealedToken: string): Promise<string[]> {
	const credentials = await readCredentials();
	if (!credentials) throw new Error("Google Ads is not configured on this server.");
	const { open } = await import("@/api/lib/secret-box");
	const accessToken = await accessTokenFor(open(sealedToken), credentials);
	return listAccessibleCustomers({ accessToken, credentials });
}
