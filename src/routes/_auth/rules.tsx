import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Toolbar } from "@/components/app-sidebar";
import { FilterSelect } from "@/components/filter-select";
import { StackedAreaChart } from "@/components/stacked-area-chart";
import { TableScroll } from "@/components/table-scroll";
import { formatNumber, formatRelative } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_auth/rules")({
	component: RulesPage,
});

const TRIGGERS = [
	{ value: "click", label: "Click" },
	{ value: "submit", label: "Form submit" },
	{ value: "pageview", label: "Pageview" },
] as const;

const MATCHERS = [
	{
		value: "selector",
		label: "CSS selector",
		hint: "Matches the clicked element or any ancestor, e.g. #book-demo or .pricing .cta",
		placeholder: "#book-demo",
	},
	{
		value: "text",
		label: "Text contains",
		hint: "Case-insensitive match on the element's visible text.",
		placeholder: "Book a demo",
	},
	{
		value: "href",
		label: "Link URL contains",
		hint: "Matches the href of the clicked link.",
		placeholder: "/signup",
	},
	{
		value: "path",
		label: "Page path contains",
		hint: "Matches the current URL path. Most useful with the Pageview trigger.",
		placeholder: "/pricing",
	},
] as const;

const TRIGGER_LABEL = Object.fromEntries(
	TRIGGERS.map((t) => [t.value, t.label]),
) as Record<string, string>;
const MATCHER_LABEL = Object.fromEntries(
	MATCHERS.map((m) => [m.value, m.label]),
) as Record<string, string>;

function RulesPage() {
	const trpc = useTRPC();
	const { siteId, isEmpty } = useWorkspace();
	const rules = useQuery(
		trpc.rules.list.queryOptions({ siteId }, { retry: false, enabled: Boolean(siteId) }),
	);
	const series = useQuery(
		trpc.rules.series.queryOptions({ siteId, range: "30d" }, { retry: false, enabled: Boolean(siteId) }),
	);

	return (
		<>
			<PageHeader title="Click tracking" action={<NewRuleDialog />} />

			{rules.data?.length ? (
				<div className="border-b p-4">
					<Card>
						<CardHeader>
							<CardTitle>Rule fires over time</CardTitle>
							<CardDescription>
								Last 30 days. Capped at the five busiest rules — beyond that the
								bands stop being tellable apart by colour.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{series.isPending ? (
								<Skeleton className="h-56 w-full" />
							) : (
								<StackedAreaChart
									data={series.data?.series ?? []}
									series={series.data?.names ?? []}
									emptyMessage="No rule has fired yet in this range."
								/>
							)}
						</CardContent>
					</Card>
				</div>
			) : null}

			<Toolbar>
				<p className="text-[11px] text-muted-foreground">
					Rules record a named event when a visitor matches them — no change to
					your site's code. They run alongside{" "}
					<code className="font-mono">data-custora-event</code> attributes and{" "}
					<code className="font-mono">custora.track()</code> calls.
				</p>
			</Toolbar>

			{/* Before isPending: a disabled query stays pending, so with no site the
			    skeleton would otherwise spin forever. */}
			{isEmpty || rules.error ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<Card className="w-full max-w-sm text-center">
						<CardHeader>
							<CardTitle>No site connected</CardTitle>
							<CardDescription>
								Add a site before defining what to track on it.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button render={<Link to="/sites" />}>Add a site</Button>
						</CardContent>
					</Card>
				</div>
			) : rules.isPending ? (
				<div className="flex flex-1 flex-col gap-px p-5">
					{Array.from({ length: 6 }, (_, i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			) : rules.data?.length ? (
				<TableScroll>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-background">
							<TableRow>
								<TableHead className="pl-5">Event name</TableHead>
								<TableHead>Trigger</TableHead>
								<TableHead>Matches</TableHead>
								<TableHead className="text-right">Fired</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="pr-5 text-right">Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rules.data.map((rule) => (
								<TableRow key={rule.id}>
									<TableCell className="pl-5 font-medium">{rule.name}</TableCell>
									<TableCell>
										<Badge variant="outline">
											{TRIGGER_LABEL[rule.trigger] ?? rule.trigger}
										</Badge>
									</TableCell>
									<TableCell className="max-w-[280px]">
										<p className="truncate font-mono text-[11px]">
											{rule.pattern}
										</p>
										<p className="text-[11px] text-muted-foreground">
											{MATCHER_LABEL[rule.matcher] ?? rule.matcher}
										</p>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{rule.fireCount > 0 ? (
											formatNumber(rule.fireCount)
										) : (
											<span
												className="text-muted-foreground"
												title="This rule has never matched anything"
											>
												0
											</span>
										)}
									</TableCell>
									<TableCell>
										<Badge variant={rule.enabled ? "default" : "outline"}>
											{rule.enabled ? "Active" : "Paused"}
										</Badge>
									</TableCell>
									<TableCell className="pr-5 text-right whitespace-nowrap text-muted-foreground">
										<div className="flex items-center justify-end gap-1">
											{formatRelative(rule.createdAt)}
											<RuleActions
												ruleId={rule.id}
												name={rule.name}
												enabled={rule.enabled}
											/>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableScroll>
			) : (
				<div className="flex flex-1 items-center justify-center p-6">
					<div className="w-full max-w-sm text-center">
						<p className="font-medium text-sm tracking-tight">No rules yet</p>
						<p className="mt-1 text-muted-foreground text-xs">
							Add one to start recording a named event whenever a visitor clicks
							a particular button or link, without touching your site's markup.
						</p>
					</div>
				</div>
			)}

			<div className="flex items-center justify-between gap-4 border-t px-5 py-2.5">
				<p className="text-muted-foreground text-xs">
					{formatNumber(rules.data?.length ?? 0)}{" "}
					{rules.data?.length === 1 ? "rule" : "rules"}
				</p>
				<p className="text-[11px] text-muted-foreground">
					Changes reach live traffic within a minute.
				</p>
			</div>
		</>
	);
}

function RuleActions({
	ruleId,
	name,
	enabled,
}: {
	ruleId: string;
	name: string;
	enabled: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: trpc.rules.pathKey() });

	const setEnabled = useMutation(
		trpc.rules.setEnabled.mutationOptions({
			onSuccess: (rule) => {
				invalidate();
				toast.success(`${rule.name} ${rule.enabled ? "resumed" : "paused"}`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const remove = useMutation(
		trpc.rules.remove.mutationOptions({
			onSuccess: (rule) => {
				invalidate();
				toast.success(`${rule.name} deleted. Events already recorded are kept.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="ghost" size="icon-sm" />}
				aria-label={`Actions for ${name}`}
			>
				<MoreHorizontal />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuItem
					onClick={() => setEnabled.mutate({ ruleId, enabled: !enabled })}
				>
					{enabled ? "Pause" : "Resume"}
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					onClick={() => remove.mutate({ ruleId })}
				>
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NewRuleDialog() {
	const trpc = useTRPC();
	const { siteId } = useWorkspace();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [trigger, setTrigger] = useState<string>("click");
	const [matcher, setMatcher] = useState<string>("selector");
	const [pattern, setPattern] = useState("");

	const create = useMutation(
		trpc.rules.create.mutationOptions({
			onSuccess: (rule) => {
				queryClient.invalidateQueries({ queryKey: trpc.rules.pathKey() });
				toast.success(`${rule?.name} will now be recorded`);
				setOpen(false);
				setName("");
				setPattern("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const active = MATCHERS.find((m) => m.value === matcher) ?? MATCHERS[0];

	/**
	 * The pattern ends up inside querySelector on the visitor's page, so an
	 * invalid selector is checked here — in a real DOM — rather than discovered
	 * as tracking that silently never fires.
	 */
	const selectorError = (() => {
		if (matcher !== "selector" || !pattern.trim()) return null;
		try {
			document.querySelector(pattern);
			return null;
		} catch {
			return "That is not a valid CSS selector.";
		}
	})();

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<Plus data-icon="inline-start" />
				New rule
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New tracking rule</DialogTitle>
					<DialogDescription>
						Record a named event when a visitor matches this, without changing
						your site.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-rule"
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (!name.trim() || !pattern.trim() || selectorError) return;
						create.mutate({
							siteId,
							name: name.trim(),
							trigger: trigger as "click",
							matcher: matcher as "selector",
							pattern: pattern.trim(),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="rule-name">Event name</FieldLabel>
							<Input
								id="rule-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Booked a call"
								required
							/>
							<FieldDescription>
								How this shows up in Events and attribution reports.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="rule-trigger">Trigger</FieldLabel>
							<FilterSelect
								id="rule-trigger"
								label="Trigger"
								className="w-full"
								value={trigger}
								onChange={(next) => setTrigger(next ?? "click")}
								options={TRIGGERS.map((t) => ({
									label: t.label,
									value: t.value,
								}))}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="rule-matcher">Match on</FieldLabel>
							<FilterSelect
								id="rule-matcher"
								label="Match on"
								className="w-full"
								value={matcher}
								onChange={(next) => setMatcher(next ?? "selector")}
								options={MATCHERS.map((m) => ({
									label: m.label,
									value: m.value,
								}))}
							/>
						</Field>

						<Field data-invalid={selectorError ? true : undefined}>
							<FieldLabel htmlFor="rule-pattern">Pattern</FieldLabel>
							<Input
								id="rule-pattern"
								value={pattern}
								onChange={(e) => setPattern(e.target.value)}
								placeholder={active.placeholder}
								aria-invalid={selectorError ? true : undefined}
								required
							/>
							{selectorError ? (
								<p className="text-[11px] text-destructive">{selectorError}</p>
							) : (
								<FieldDescription>{active.hint}</FieldDescription>
							)}
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
					<Button
						type="submit"
						form="new-rule"
						disabled={
							!name.trim() ||
							!pattern.trim() ||
							Boolean(selectorError) ||
							create.isPending
						}
					>
						{create.isPending ? "Creating" : "Create rule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
