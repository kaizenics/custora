/**
 * Paths owned by the API rather than by the page router.
 *
 * Kept in its own module with no heavy imports so the Vite dev plugin and the
 * Hono app can share one definition. Duplicating the list is how dev ends up
 * routing a path that production does not, or the reverse.
 */
export const API_PREFIXES = ["/api/", "/trpc", "/c/", "/healthz"] as const;

export function isApiPath(pathname: string): boolean {
	return API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
