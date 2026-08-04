import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { SettingsSection } from "@/components/settings-section";
import { formatNumber } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/tracking")({
	component: TrackingPage,
});

function TrackingPage() {
	const trpc = useTRPC();
	const sites = useQuery(trpc.sites.list.queryOptions());

	return (
		<SettingsSection
			title="Tracking"
			description="Sites currently reporting into this workspace."
		>
			{sites.isPending ? (
				<Skeleton className="h-16 w-full" />
			) : sites.data?.length ? (
				<ul className="flex flex-col gap-2">
					{sites.data.map((site) => (
						<li
							key={site.id}
							className="flex items-center justify-between gap-3 border p-3"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-xs">{site.name}</p>
								<p className="truncate text-[11px] text-muted-foreground">
									{site.domain} · {formatNumber(site.eventCount)} events
								</p>
							</div>
							<Link
								to="/install"
								className={buttonVariants({ variant: "ghost", size: "sm" })}
							>
								Manage
								<ExternalLink data-icon="inline-end" />
							</Link>
						</li>
					))}
				</ul>
			) : (
				<div className="flex items-center justify-between gap-3 border p-3">
					<p className="text-muted-foreground text-xs">
						No sites connected yet.
					</p>
					<Link to="/install" className={buttonVariants({ size: "sm" })}>
						Add a site
					</Link>
				</div>
			)}
		</SettingsSection>
	);
}
