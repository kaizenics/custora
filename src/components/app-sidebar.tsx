import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	Activity,
	ChartNoAxesColumn,
	ChevronsUpDown,
	CircleDollarSign,
	Globe,
	LogOut,
	Settings,
	Users,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

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
			{ to: "/sites", label: "Sites", icon: Globe },
			{ to: "/settings", label: "Settings", icon: Settings },
		],
	},
];

export function AppSidebar() {
	const trpc = useTRPC();
	const site = useQuery(trpc.sites.current.queryOptions({}, { retry: false }));

	return (
		<aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
			<div className="flex h-14 items-center gap-2 border-b px-4">
				<div className="flex size-6 items-center justify-center bg-primary font-semibold text-[10px] text-primary-foreground">
					C
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm tracking-tight">Custora</p>
					{site.isPending ? (
						<Skeleton className="mt-0.5 h-3 w-24" />
					) : (
						<p className="truncate text-[11px] text-muted-foreground">
							{site.data?.domain ?? "No site yet"}
						</p>
					)}
				</div>
			</div>

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
					<DropdownMenuItem render={<Link to="/sites" />}>
						<Globe />
						Sites and tracking
					</DropdownMenuItem>
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
