/**
 * Scroll region for a shadcn <Table>.
 *
 * Table renders its own `overflow-x-auto` container, and per spec an
 * overflow value other than `visible` on one axis forces the other axis to
 * compute to `auto` too. That container therefore becomes the scroll parent for
 * a `sticky top-0` thead — but it has no height of its own, so the header never
 * sticks to anything.
 *
 * Giving it a definite height fixes it: the container scrolls, and the header
 * pins to the top of the visible rows.
 */
export function TableScroll({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-0 flex-1 [&>[data-slot=table-container]]:h-full">
			{children}
		</div>
	);
}
