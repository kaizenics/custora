import { Separator } from "@/components/ui/separator";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getBaseUrl } from "@/lib/base-url";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});

/**
 * What the product actually does, in the order it happens. Deliberately plain
 * text rather than a mocked-up dashboard: a fake screenshot on a login screen
 * is a tell, and these users already know the product.
 */
const STAGES = [
	{
		title: "Ad click",
		body: "Click IDs and campaign captured the moment someone lands.",
	},
	{
		title: "Anonymous visit",
		body: "Every page and interaction recorded before you know who they are.",
	},
	{
		title: "Lead",
		body: "An email arrives and their whole history is attached retroactively.",
	},
	{
		title: "Deal",
		body: "Revenue closes the loop back to the campaign that started it.",
	},
];

function RouteComponent() {
	// Signing in is the common case; creating an account happens once.
	const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
	// Registration is closed in production unless explicitly opened. Offering a
	// link that always fails is worse than not offering one.
	const [signUpEnabled, setSignUpEnabled] = useState(false);

	useEffect(() => {
		fetch(`${getBaseUrl()}/api/public-config`)
			.then((r) => r.json())
			.then((config) => setSignUpEnabled(Boolean(config?.signUpEnabled)))
			.catch(() => setSignUpEnabled(false));
	}, []);

	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			<main className="flex flex-col justify-center px-6 py-10 sm:px-10">
				<div className="mx-auto w-full max-w-sm">
					<div className="mb-8 flex items-center gap-2">
						<div className="flex size-6 items-center justify-center rounded-md bg-primary font-semibold text-[10px] text-primary-foreground">
							C
						</div>
						<span className="font-medium text-sm tracking-tight">Custora</span>
					</div>

					{mode === "sign-in" || !signUpEnabled ? (
						<SignInForm
							onSwitchToSignUp={
								signUpEnabled ? () => setMode("sign-up") : undefined
							}
						/>
					) : (
						<SignUpForm onSwitchToSignIn={() => setMode("sign-in")} />
					)}
				</div>
			</main>

			{/* Hidden below lg — an explainer stacked above a login form is just noise. */}
			<aside className="hidden flex-col justify-center border-l bg-muted/30 px-12 py-10 lg:flex">
				<div className="max-w-md">
					<h2 className="font-medium text-xl tracking-tight">
						Attribution that survives the sales cycle
					</h2>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Custora connects the ad click to the closed deal, even when weeks
						pass in between and the visitor changes device.
					</p>

					<Separator className="my-8" />

					{/*
					 * No gap on the list: the spacing lives inside each item as padding
					 * instead. A gap sits *between* list items, so the flex-1 connector
					 * would only fill its own item's height and stop short of the next
					 * marker, leaving the line visibly broken at every step.
					 */}
					<ol className="flex flex-col">
						{STAGES.map((stage, index) => {
							const isLast = index === STAGES.length - 1;
							return (
								<li key={stage.title} className="flex gap-4">
									<div className="flex flex-col items-center">
										<span className="flex size-5 shrink-0 items-center justify-center rounded-full border bg-background font-medium text-[10px] tabular-nums">
											{index + 1}
										</span>
										{!isLast ? (
											<span className="w-px flex-1 bg-border" aria-hidden />
										) : null}
									</div>
									<div className={isLast ? "pt-0.5" : "pt-0.5 pb-6"}>
										<p className="font-medium text-xs">{stage.title}</p>
										<p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
											{stage.body}
										</p>
									</div>
								</li>
							);
						})}
					</ol>
				</div>
			</aside>
		</div>
	);
}
