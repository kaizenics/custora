import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Plus,
	SearchCheck,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

/** Mirrors the server's domain normalisation so the stale-result check lines up. */
function normalizeDomain(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/.*$/, "")
		.replace(/:\d+$/, "");
}

function Row({ tone, text }: { tone: "good" | "warn" | "bad"; text: string }) {
	const Icon =
		tone === "good" ? Check : tone === "warn" ? TriangleAlert : ShieldCheck;
	return (
		<div className="flex items-start gap-2">
			<Icon
				className={cn(
					"mt-0.5 size-3.5 shrink-0",
					tone === "bad" && "text-destructive",
					tone === "warn" && "text-muted-foreground",
				)}
			/>
			<p className={cn("text-[11px]", tone === "bad" && "text-destructive")}>
				{text}
			</p>
		</div>
	);
}

export function NewSiteDialog({
	open: controlledOpen,
	onOpenChange,
	onCreated,
}: {
	/**
	 * Controlled mode, for callers that own the trigger themselves. The workspace
	 * switcher needs this: a dialog rendered inside the dropdown would unmount
	 * the moment the menu closed, so the menu item only opens state and the
	 * dialog lives outside it.
	 */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onCreated?: (siteId: string) => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = onOpenChange ?? setUncontrolledOpen;
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");

	const checkDomain = useMutation(trpc.sites.checkDomain.mutationOptions());

	const create = useMutation(
		trpc.sites.create.mutationOptions({
			onSuccess: (created) => {
				queryClient.invalidateQueries({ queryKey: trpc.sites.pathKey() });
				toast.success("Site added");
				setOpen(false);
				setName("");
				setDomain("");
				checkDomain.reset();
				if (created?.id) onCreated?.(created.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const probe = checkDomain.data;
	// Re-checking is required after an edit — a stale result for a different
	// domain is worse than no result at all.
	const probeIsStale =
		probe != null && probe.domain !== normalizeDomain(domain);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{controlledOpen === undefined ? (
				<DialogTrigger render={<Button size="sm" />}>
					<Plus data-icon="inline-start" />
					Add site
				</DialogTrigger>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a site</DialogTitle>
					<DialogDescription>
						Every visitor, event, and contact is scoped to a site, so a second
						brand stays cleanly separated.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-site"
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (!name.trim() || !domain.trim()) return;
						create.mutate({ name: name.trim(), domain: domain.trim() });
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="site-name">Name</Label>
						<Input
							id="site-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Marketing site"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="site-domain">Domain</Label>
						<div className="flex gap-2">
							<Input
								id="site-domain"
								value={domain}
								onChange={(e) => setDomain(e.target.value)}
								placeholder="northgate.dev"
								required
							/>
							<Button
								type="button"
								variant="outline"
								disabled={!domain.trim() || checkDomain.isPending}
								onClick={() => checkDomain.mutate({ domain: domain.trim() })}
							>
								<SearchCheck data-icon="inline-start" />
								{checkDomain.isPending ? "Checking" : "Check"}
							</Button>
						</div>
					</div>

					{checkDomain.error ? (
						<p className="text-[11px] text-destructive">
							{checkDomain.error.message}
						</p>
					) : null}

					{probe && !probeIsStale ? (
						<div className="flex flex-col gap-2 border p-3">
							{probe.alreadyTracked ? (
								<Row
									tone="bad"
									text={`Already tracked as "${probe.existingSiteName}". Adding it again would split its visitors across two keys.`}
								/>
							) : (
								<Row tone="good" text="Not tracked here yet." />
							)}

							{probe.reachable ? (
								<Row
									tone="good"
									text={`Reachable — responded ${probe.httpStatus} at https://${probe.domain}/`}
								/>
							) : (
								<Row
									tone="warn"
									text={`Could not fetch the site: ${probe.error}. You can still add it — the snippet may just not be deployed yet.`}
								/>
							)}

							{probe.existingSnippetKey ? (
								<Row
									tone={probe.snippetMatchesExisting ? "good" : "warn"}
									text={
										probe.snippetMatchesExisting
											? "A Custora snippet is already live on this page, using the existing site's key."
											: "A Custora snippet is already on this page under a different key. Reuse that site instead of adding a second one, or rotate the key after adding."
									}
								/>
							) : probe.reachable ? (
								<Row
									tone="warn"
									text="No Custora snippet on the page yet. You will get one to paste after adding."
								/>
							) : null}
						</div>
					) : null}
				</form>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>
						Cancel
					</DialogClose>
					<Button
						type="submit"
						form="new-site"
						disabled={
							!name.trim() ||
							!domain.trim() ||
							create.isPending ||
							// Hard block: the server rejects it anyway, so do not let the
							// form pretend it might work.
							Boolean(probe && !probeIsStale && probe.alreadyTracked)
						}
					>
						{create.isPending ? "Adding" : "Add site"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
