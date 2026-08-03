import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	CircleAlert,
	CircleCheck,
	CircleHelp,
	CircleSlash,
	KeyRound,
	Radio,
} from "lucide-react";

export type InstallStatus =
	| "live"
	| "installed_no_events"
	| "reporting_not_found"
	| "wrong_key"
	| "not_found"
	| "unreachable";

type Descriptor = {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	variant: "default" | "secondary" | "outline" | "destructive";
	/** Plain-language explanation, and what to do about it. */
	detail: string;
};

export const INSTALL_STATUS: Record<InstallStatus, Descriptor> = {
	live: {
		label: "Live",
		icon: CircleCheck,
		variant: "default",
		detail: "Snippet found on the page and events are arriving. Nothing to do.",
	},
	installed_no_events: {
		label: "Installed, no data",
		icon: Radio,
		variant: "secondary",
		detail:
			"The snippet is on the page but nothing has reported yet. Load the site once in a browser — if it stays empty, an ad blocker or a Content-Security-Policy rule is likely blocking the request.",
	},
	reporting_not_found: {
		label: "Reporting",
		icon: CircleCheck,
		variant: "secondary",
		detail:
			"Events are arriving, but the snippet was not in the served HTML. That is normal when it is injected by a tag manager or a client-side router. Data is flowing, so this is fine.",
	},
	wrong_key: {
		label: "Wrong key",
		icon: KeyRound,
		variant: "destructive",
		detail:
			"A Custora snippet is on the page, but with a different write key. This usually means the key was rotated and the site still has the old snippet. Copy the snippet below and redeploy.",
	},
	not_found: {
		label: "Not installed",
		icon: CircleSlash,
		variant: "outline",
		detail:
			"No snippet found in the page HTML and nothing has reported. Paste the snippet below before the closing body tag and deploy.",
	},
	unreachable: {
		label: "Unreachable",
		icon: CircleAlert,
		variant: "destructive",
		detail:
			"The site could not be fetched. It may be behind auth, a firewall, or not deployed yet. This does not necessarily mean the snippet is missing.",
	},
};

export function InstallBadge({
	status,
	className,
}: {
	status: InstallStatus | null | undefined;
	className?: string;
}) {
	if (!status) {
		return (
			<Badge variant="outline" className={className}>
				<CircleHelp />
				Not checked
			</Badge>
		);
	}

	const descriptor = INSTALL_STATUS[status];
	return (
		<Badge variant={descriptor.variant} className={className}>
			<descriptor.icon />
			{descriptor.label}
		</Badge>
	);
}

export function InstallDetail({
	status,
	url,
	httpStatus,
	foundKey,
	eventCount,
	installedVia,
	className,
}: {
	status: InstallStatus;
	url?: string;
	httpStatus?: number | null;
	foundKey?: string | null;
	eventCount?: number;
	installedVia?: "script" | "injected" | null;
	className?: string;
}) {
	const descriptor = INSTALL_STATUS[status];

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{/* The verdict is what the reader came for, so it is the most legible
			    line here; the caveat below it stays secondary. */}
			<p className="text-foreground text-sm leading-relaxed">
				{descriptor.detail}
			</p>
			{installedVia === "injected" ? (
				<p className="text-muted-foreground text-sm leading-relaxed">
					Mounted from JavaScript rather than as a tag in the HTML — normal for
					Next.js &lt;Script&gt;, a tag manager, or a client-side router.
				</p>
			) : null}
			<dl className="flex flex-wrap gap-x-6 gap-y-2">
				<Fact label="Checked" value={url} mono />
				<Fact
					label="HTTP"
					value={typeof httpStatus === "number" ? String(httpStatus) : undefined}
				/>
				<Fact
					label="Events"
					value={typeof eventCount === "number" ? String(eventCount) : undefined}
				/>
				<Fact
					label="Key on page"
					value={
						foundKey && status === "wrong_key"
							? `${foundKey.slice(0, 14)}…`
							: undefined
					}
					mono
				/>
			</dl>
		</div>
	);
}

/** Label above value, so the eye finds the values on one line. */
function Fact({
	label,
	value,
	mono,
}: {
	label: string;
	value?: string;
	mono?: boolean;
}) {
	if (!value) return null;
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd
				className={cn(
					"text-foreground text-sm tabular-nums",
					mono && "font-mono text-[13px]",
				)}
			>
				{value}
			</dd>
		</div>
	);
}
