import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/auth";

import { getBaseUrl } from "./base-url";

export const authClient = createAuthClient({
	// better-auth derives its route-matching base from this URL's path, so the
	// public auth path must equal the server-side mount (/api/auth everywhere).
	baseURL: new URL("/api/auth", getBaseUrl()).toString(),
	// Type-only bridge: this is what puts `role` on session.user for the client,
	// and the type import is erased at build time so no server code rides along.
	plugins: [inferAdditionalFields<typeof auth>()],
});

/**
 * Whether the signed-in user can manage sites, rules and people. The server
 * enforces this on every mutation — hiding a button is comfort, not security.
 */
export function useIsAdmin(): boolean {
	const { data } = authClient.useSession();
	return data?.user.role === "admin";
}
