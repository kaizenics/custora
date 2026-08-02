import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getBaseUrl } from "./base-url";

/** tRPC router segments whose data an incoming event can actually change. */
const LIVE_QUERY_KEYS = ["analytics", "events", "contacts", "deals"];

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
			 * Only the data that new events can change. Invalidating everything also
			 * refetched sites, rules and config — none of which an incoming pageview
			 * affects, and each one a billed query against Turso.
			 *
			 * Invalidate rather than refetch, so React Query only re-runs the queries
			 * actually mounted instead of waking screens nobody is looking at.
			 */
			for (const key of LIVE_QUERY_KEYS) {
				queryClient.invalidateQueries({ queryKey: [key] });
			}
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
