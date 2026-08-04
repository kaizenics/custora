import { z } from "zod";

import { adminProcedure, router } from "../index";
import {
	clearSettings,
	maskSecret,
	readSetting,
	settingSource,
	writeSetting,
} from "../lib/app-config";
import { DEFAULT_VERSION, SETTING_KEYS } from "../lib/google-ads";

const ENV_FALLBACK: Record<string, string> = {
	[SETTING_KEYS.clientId]: "GOOGLE_ADS_CLIENT_ID",
	[SETTING_KEYS.clientSecret]: "GOOGLE_ADS_CLIENT_SECRET",
	[SETTING_KEYS.developerToken]: "GOOGLE_ADS_DEVELOPER_TOKEN",
	[SETTING_KEYS.apiVersion]: "GOOGLE_ADS_API_VERSION",
};

/**
 * Deployment integrations, admin-only in both directions.
 *
 * Reads never return a stored secret. The client secret and developer token
 * come back masked, which is enough to confirm *which* credential is in place
 * without the browser — or anything logging its traffic — ever seeing it.
 */
export const integrationsRouter = router({
	googleAds: adminProcedure.query(async () => {
		const [clientId, clientSecret, developerToken, version] = await Promise.all([
			readSetting(SETTING_KEYS.clientId, ENV_FALLBACK[SETTING_KEYS.clientId]),
			readSetting(
				SETTING_KEYS.clientSecret,
				ENV_FALLBACK[SETTING_KEYS.clientSecret],
			),
			readSetting(
				SETTING_KEYS.developerToken,
				ENV_FALLBACK[SETTING_KEYS.developerToken],
			),
			readSetting(SETTING_KEYS.apiVersion, ENV_FALLBACK[SETTING_KEYS.apiVersion]),
		]);

		const [clientIdFrom, secretFrom, tokenFrom] = await Promise.all([
			settingSource(SETTING_KEYS.clientId, ENV_FALLBACK[SETTING_KEYS.clientId]),
			settingSource(
				SETTING_KEYS.clientSecret,
				ENV_FALLBACK[SETTING_KEYS.clientSecret],
			),
			settingSource(
				SETTING_KEYS.developerToken,
				ENV_FALLBACK[SETTING_KEYS.developerToken],
			),
		]);

		return {
			// Not a secret — shown in full so the reader can check it against the
			// value in their Google Cloud console.
			clientId: clientId ?? null,
			clientSecret: clientSecret ? maskSecret(clientSecret) : null,
			developerToken: developerToken ? maskSecret(developerToken) : null,
			apiVersion: version ?? DEFAULT_VERSION,
			defaultApiVersion: DEFAULT_VERSION,
			source: { clientId: clientIdFrom, clientSecret: secretFrom, developerToken: tokenFrom },
			complete: Boolean(clientId && clientSecret && developerToken),
		};
	}),

	saveGoogleAds: adminProcedure
		.input(
			z.object({
				clientId: z.string().trim().min(1).max(400),
				/**
				 * Optional on update: an empty field means "leave the stored one
				 * alone", so re-saving after changing only the client id does not
				 * require pasting the secret again.
				 */
				clientSecret: z.string().trim().max(400).optional(),
				developerToken: z.string().trim().max(200).optional(),
				apiVersion: z
					.string()
					.trim()
					.regex(/^v\d+$/, "Use a version like v21.")
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await writeSetting(SETTING_KEYS.clientId, input.clientId, userId);
			if (input.clientSecret) {
				await writeSetting(SETTING_KEYS.clientSecret, input.clientSecret, userId);
			}
			if (input.developerToken) {
				await writeSetting(
					SETTING_KEYS.developerToken,
					input.developerToken,
					userId,
				);
			}
			if (input.apiVersion) {
				await writeSetting(SETTING_KEYS.apiVersion, input.apiVersion, userId);
			}
			return { saved: true };
		}),

	/**
	 * Removes the stored values. Any environment variables remain in effect —
	 * the message says so, because otherwise "cleared" would look broken when
	 * the integration keeps working.
	 */
	clearGoogleAds: adminProcedure.mutation(async () => {
		await clearSettings(Object.values(SETTING_KEYS));
		const stillFromEnv = Boolean(
			process.env.GOOGLE_ADS_CLIENT_ID &&
				process.env.GOOGLE_ADS_CLIENT_SECRET &&
				process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
		);
		return { stillFromEnv };
	}),
});
