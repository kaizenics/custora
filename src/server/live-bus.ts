/**
 * In-process notification bus for live dashboard updates.
 *
 * The collector already knows the instant an event is recorded, so the
 * dashboard can be told rather than made to poll. That matters here: an idle
 * dashboard costs nothing, and every avoided refetch is five queries against a
 * database that is a network hop away.
 *
 * In-process means a single container. Several would need Redis pub/sub for a
 * viewer on instance A to see traffic recorded by instance B; each instance
 * would still correctly serve its own.
 */

type Listener = (siteId: string) => void;

/**
 * A busy site produces events far faster than a dashboard needs redrawing, so
 * notifications are coalesced: the first event schedules a ping and everything
 * inside the window rides along with it.
 */
const COALESCE_MS = 2_000;

/** One listener per open dashboard connection. Bounded so a leak cannot grow forever. */
const MAX_LISTENERS = 500;

const listeners = new Set<Listener>();
const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

export function notifyActivity(siteId: string): void {
	if (!listeners.size || scheduled.has(siteId)) return;

	const timer = setTimeout(() => {
		scheduled.delete(siteId);
		for (const listener of listeners) {
			try {
				listener(siteId);
			} catch {
				// A failed write to one closed stream must not stop the others.
			}
		}
	}, COALESCE_MS);

	// Never hold the process open on a pending ping during shutdown.
	timer.unref?.();
	scheduled.set(siteId, timer);
}

export function subscribe(listener: Listener): () => void {
	if (listeners.size >= MAX_LISTENERS) {
		return () => {};
	}
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Test seam — this module holds process-wide state. */
export function resetLiveBus(): void {
	for (const timer of scheduled.values()) clearTimeout(timer);
	scheduled.clear();
	listeners.clear();
}

export const LIVE_BUS = { coalesceMs: COALESCE_MS, maxListeners: MAX_LISTENERS };
