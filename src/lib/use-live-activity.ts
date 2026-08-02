import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getBaseUrl } from "./base-url";

/**
 * Refreshes dashboard data when the collector records something.
 *
 * The server pushes over SSE rather than the client polling, so an idle
 * dashboard makes no queries at all — which matters when every refresh is five
 * round trips to a database in another region.
 *
 * EventSource reconnects on its own after a dropped connection, so there is no
 * retry logic here; the `connected` flag simply reflects the current state.
 */
export function useLiveActivity(siteId?: string): { connected: boolean } {
	const queryClient = useQueryClient();
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		// SSR has no EventSource, and there is nothing to keep fresh there.
		if (typeof window === "undefined") return;

		const url = new URL("/api/live", getBaseUrl());
		if (siteId) url.searchParams.set("siteId", siteId);

		const source = new EventSource(url.toString(), { withCredentials: true });

		const onReady = () => setConnected(true);
		const onError = () => setConnected(false);
		const onActivity = () => {
			/**
			 * Invalidate rather than refetch: React Query only refetches the queries
			 * actually mounted, so a burst of activity does not wake up every screen
			 * the user is not looking at.
			 */
			queryClient.invalidateQueries();
		};

		source.addEventListener("ready", onReady);
		source.addEventListener("activity", onActivity);
		source.addEventListener("error", onError);

		return () => {
			source.removeEventListener("ready", onReady);
			source.removeEventListener("activity", onActivity);
			source.removeEventListener("error", onError);
			source.close();
		};
	}, [siteId, queryClient]);

	return { connected };
}
