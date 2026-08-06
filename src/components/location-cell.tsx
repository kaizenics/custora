import { CountryFlag } from "@/components/country-flag";

/**
 * Where a visitor was, as one table cell: "City, CC" with the truncated
 * address underneath. Shared by every table that shows per-event provenance,
 * so the two pages cannot drift apart in how they render the same fact.
 *
 * IP without country is still shown — that combination is real (a collector
 * with no geo source configured still stores the address), and hiding the
 * address behind a missing country read as "nothing captured" when something
 * was.
 */
export function LocationCell({
	country,
	city,
	ipAddress,
}: {
	country: string | null;
	city: string | null;
	ipAddress: string | null;
}) {
	if (!country && !ipAddress) {
		return <span title="No geo source configured on the collector">—</span>;
	}

	return (
		<>
			{country ? (
				<span className="flex items-center gap-1.5">
					<CountryFlag code={country} />
					{city ? `${city}, ${country}` : country}
				</span>
			) : (
				<span title="Address captured, but no geo source was configured when this session started">
					Unresolved
				</span>
			)}
			{ipAddress ? (
				<p
					className="font-mono text-[11px]"
					title="Truncated before storage — the host portion is never kept"
				>
					{ipAddress}
				</p>
			) : null}
		</>
	);
}
