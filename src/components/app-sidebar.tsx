import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	Activity,
	ChartNoAxesColumn,
	Check,
	ChevronsUpDown,
	CircleDollarSign,
	Code,
	LogOut,
	MousePointerClick,
	Plus,
	Settings,
	Users,
} from "lucide-react";

import { useState } from "react";

import { NewSiteDialog } from "@/components/new-site-dialog";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "@/lib/workspace";

type NavItem = {
	to: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
	label: string;
	items: NavItem[];
};

const SECTIONS: NavSection[] = [
	{
		label: "Insights",
		items: [
			{ to: "/overview", label: "Overview", icon: ChartNoAxesColumn },
			{ to: "/events", label: "Events", icon: Activity },
			{ to: "/rules", label: "Click tracking", icon: MousePointerClick },
		],
	},
	{
		label: "Pipeline",
		items: [
			{ to: "/contacts", label: "Contacts", icon: Users },
			{ to: "/deals", label: "Deals", icon: CircleDollarSign },
		],
	},
	{
		label: "Setup",
		items: [
			{ to: "/install", label: "Installation", icon: Code },
			{ to: "/settings", label: "Settings", icon: Settings },
		],
	},
];

export function AppSidebar({ live }: { live?: boolean }) {
	return (
		<aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
			<WorkspaceSwitcher live={live} />

			<nav className="flex-1 overflow-y-auto p-2">
				{SECTIONS.map((section) => (
					<div key={section.label} className="mb-4">
						<p className="px-2 pb-1 font-medium text-[11px] text-muted-foreground">
							{section.label}
						</p>
						<ul className="flex flex-col gap-px">
							{section.items.map((item) => (
								<li key={item.to}>
									<Link
										to={item.to}
										className="flex h-8 items-center gap-2 px-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
										activeProps={{ className: "bg-muted text-foreground" }}
									>
										<item.icon className="size-4 shrink-0" />
										{item.label}
									</Link>
								</li>
							))}
						</ul>
					</div>
				))}
			</nav>

			<SidebarUser />
		</aside>
	);
}

/**
 * One workspace is one site, so the switcher is also the site identity — there
 * is no separate "which brand am I looking at" indicator anywhere else on the
 * screen, which is why the domain stays visible on the trigger rather than only
 * inside the open menu.
 */
function WorkspaceSwitcher({ live }: { live?: boolean }) {
	const { site, sites, siteId, isPending, switchTo } = useWorkspace();
	const [addOpen, setAddOpen] = useState(false);

	if (isPending) {
		return (
			<div className="flex h-14 items-center gap-2 border-b px-4">
				<Skeleton className="size-6 shrink-0" />
				<div className="flex-1">
					<Skeleton className="h-3.5 w-28" />
					<Skeleton className="mt-1 h-2.5 w-20" />
				</div>
			</div>
		);
	}

	// Without a site there is nothing to switch between, so the control becomes
	// the one action that resolves that.
	if (!site) {
		return (
			<div className="flex h-14 items-center border-b px-2">
				<button
					type="button"
					onClick={() => setAddOpen(true)}
					className="flex h-10 w-full items-center gap-2 px-2 text-left transition-colors hover:bg-muted"
				>
					<span className="flex size-6 shrink-0 items-center justify-center border border-dashed text-muted-foreground">
						<Plus className="size-3.5" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium text-sm tracking-tight">
							Add a site
						</span>
						<span className="block truncate text-[11px] text-muted-foreground">
							Nothing tracked yet
						</span>
					</span>
				</button>
				<NewSiteDialog
					open={addOpen}
					onOpenChange={setAddOpen}
					onCreated={switchTo}
				/>
			</div>
		);
	}

	return (
		<div className="flex h-14 items-center border-b px-2">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="flex h-10 w-full items-center gap-2 px-2 text-left transition-colors hover:bg-muted"
						/>
					}
				>
					<span className="flex size-6 shrink-0 items-center justify-center bg-primary font-semibold text-[10px] text-primary-foreground uppercase">
						{site.name.slice(0, 1)}
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium text-sm tracking-tight">
							{site.name}
						</span>
						<span className="flex items-center gap-1.5">
							<span className="truncate text-[11px] text-muted-foreground">
								{site.domain}
							</span>
							{live ? (
								<span
									className="size-1.5 shrink-0 rounded-full bg-chart-2"
									title="Live — the dashboard updates as events arrive"
									aria-label="Live"
								/>
							) : null}
						</span>
					</span>
					<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" className="w-56">
					{/* The label is Base UI's GroupLabel, which reads its group from
					    context — it throws rather than rendering bare. */}
					<DropdownMenuGroup>
						<DropdownMenuLabel className="text-[11px] text-muted-foreground">
							Workspaces
						</DropdownMenuLabel>
						{sites.map((candidate) => (
							<DropdownMenuItem
								key={candidate.id}
								onClick={() => switchTo(candidate.id)}
							>
								<span className="flex size-5 shrink-0 items-center justify-center bg-muted font-semibold text-[9px] uppercase">
									{candidate.name.slice(0, 1)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-xs">
										{candidate.name}
									</span>
									<span className="block truncate text-[10px] text-muted-foreground">
										{candidate.domain}
									</span>
								</span>
								{candidate.id === siteId ? (
									<Check className="size-3.5 shrink-0" />
								) : null}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>

					<DropdownMenuSeparator />

					<DropdownMenuItem onClick={() => setAddOpen(true)}>
						<Plus className="size-3.5" />
						New workspace
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Outside the menu on purpose — see NewSiteDialog's controlled mode. */}
			<NewSiteDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				// Switch straight to what was just created; adding a site and then
				// still looking at the old one reads as the form having failed.
				onCreated={switchTo}
			/>
		</div>
	);
}

function SidebarUser() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return (
			<div className="border-t p-2">
				<Skeleton className="h-9 w-full" />
			</div>
		);
	}

	if (!session) return null;

	return (
		<div className="border-t p-2">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-muted"
						/>
					}
				>
					<Avatar className="size-6 shrink-0">
						<AvatarFallback className="text-[10px]">
							{session.user.name.slice(0, 2)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-xs">{session.user.name}</p>
						<p className="truncate text-[11px] text-muted-foreground">
							{session.user.email}
						</p>
					</div>
					<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{/* Sites moved to the workspace switcher, which is where the
					    question "which site" is now asked. */}
					<DropdownMenuItem render={<Link to="/settings" />}>
						<Settings />
						Settings
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: () => navigate({ to: "/login" }),
								},
							});
						}}
					>
						<LogOut />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

/** Shared page chrome: title row, then a toolbar, then content. */
export function PageHeader({
	title,
	action,
	children,
}: {
	title: string;
	action?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-5">
			<div className="flex min-w-0 items-center gap-2">
				<h1 className="truncate font-medium text-sm tracking-tight">{title}</h1>
				{children}
			</div>
			{action}
		</header>
	);
}

export function Toolbar({ children, className }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2 border-b px-5 py-2.5",
				className,
			)}
		>
			{children}
		</div>
	);
}

/** Matches dub's "Viewing N links" footer with its paging controls. */
export function TableFooterBar({
	label,
	page,
	pageCount,
	onPageChange,
}: {
	label: string;
	page: number;
	pageCount: number;
	onPageChange: (page: number) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4 border-t px-5 py-2.5">
			<p className="text-muted-foreground text-xs">{label}</p>
			<div className="flex items-center gap-1.5">
				<Button
					variant="outline"
					size="sm"
					disabled={page <= 0}
					onClick={() => onPageChange(page - 1)}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={page >= pageCount - 1}
					onClick={() => onPageChange(page + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
