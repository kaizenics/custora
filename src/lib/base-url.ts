/**
 * Origin the app talks to itself on.
 *
 * The dashboard and the API are one service now, so this is always the app's
 * own origin. In the browser that is simply where the page came from. During
 * SSR there is no window, and fetch needs an absolute URL, so it falls back to
 * the configured public URL and finally to the local dev port.
 */
export function getBaseUrl(): string {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}

	const configured = process.env.BETTER_AUTH_URL ?? process.env.PUBLIC_URL;
	if (configured) {
		return configured.replace(/\/$/, "");
	}

	return `http://localhost:${process.env.PORT ?? 3000}`;
}
