import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CustoraLogo } from "@/components/custora-logo";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getBaseUrl } from "@/lib/base-url";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Sign in · Custora" },
			{
				name: "description",
				content: "Sign in to your Custora attribution workspace.",
			},
		],
	}),
});

const TOUCHPOINTS = [
	{ title: "Google Ads", meta: "Campaign click", time: "Day 1" },
	{ title: "Pricing viewed", meta: "Anonymous visit", time: "Day 3" },
	{ title: "Demo requested", meta: "Contact identified", time: "Day 8" },
	{ title: "Closed won", meta: "Revenue attributed", time: "Day 17" },
];

function RouteComponent() {
	const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
	// Registration stays closed in production unless explicitly opened.
	const [signUpEnabled, setSignUpEnabled] = useState(false);

	useEffect(() => {
		fetch(`${getBaseUrl()}/api/public-config`)
			.then((response) => response.json())
			.then((config) => setSignUpEnabled(Boolean(config?.signUpEnabled)))
			.catch(() => setSignUpEnabled(false));
	}, []);

	return (
		<div className="auth-shell min-h-svh p-0 sm:p-4 lg:p-5">
			<div className="auth-frame mx-auto grid min-h-svh max-w-[1480px] overflow-hidden sm:min-h-[calc(100svh-2rem)] sm:rounded-3xl lg:min-h-[calc(100svh-2.5rem)] lg:grid-cols-[minmax(25rem,0.86fr)_minmax(34rem,1.14fr)]">
				<main className="auth-main flex min-w-0 flex-col px-6 py-7 sm:px-10 sm:py-9 xl:px-16">
					<header>
						<CustoraLogo />
					</header>

					<div className="flex flex-1 items-center py-12 sm:py-16">
						<div className="auth-form mx-auto w-full max-w-[25rem]">
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
					</div>

					<footer className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-xs">
						<span>© {new Date().getFullYear()} Custora</span>
						<span>Private by design</span>
					</footer>
				</main>

				<aside className="auth-story relative hidden min-h-0 overflow-hidden px-10 py-9 lg:flex lg:flex-col xl:px-14 xl:py-12">
					<div className="auth-grid" aria-hidden />
					<div className="relative flex items-center justify-between">
						<p className="auth-eyebrow">Revenue attribution</p>
						<div className="auth-live flex items-center gap-2 text-xs">
							<span className="size-1.5 rounded-full" />
							Live journey
						</div>
					</div>

					<div className="relative mt-auto max-w-xl pb-10 xl:pb-14">
						<p className="auth-kicker mb-5">From first click to closed won</p>
						<h2 className="max-w-[12ch] text-balance font-semibold text-4xl leading-[1.03] tracking-[-0.045em] xl:text-5xl">
							Know which campaigns actually create revenue.
						</h2>
						<p className="auth-story-copy mt-5 max-w-lg text-sm leading-relaxed xl:text-base">
							Custora connects anonymous sessions, known contacts, and closed
							deals into one complete customer journey.
						</p>
					</div>

					<div className="auth-journey relative mb-auto max-w-2xl">
						<div className="auth-journey-head flex items-end justify-between gap-6 px-5 pb-5">
							<div>
								<p className="text-xs">Journey matched</p>
								<p className="mt-1 font-semibold text-2xl tracking-[-0.04em]">
									$42,680
								</p>
							</div>
							<p className="text-right text-xs leading-relaxed">
								17 days
								<br />4 touchpoints
							</p>
						</div>

						<ol className="auth-touchpoints grid grid-cols-4">
							{TOUCHPOINTS.map((touchpoint, index) => (
								<li key={touchpoint.title} className="relative px-5 py-5">
									<div className="auth-node mb-4 flex size-7 items-center justify-center rounded-full text-[10px] tabular-nums">
										{String(index + 1).padStart(2, "0")}
									</div>
									<p className="font-medium text-xs">{touchpoint.title}</p>
									<p className="mt-1 text-[11px]">{touchpoint.meta}</p>
									<p className="mt-3 text-[10px] tabular-nums">
										{touchpoint.time}
									</p>
								</li>
							))}
						</ol>
					</div>

					<p className="auth-proof relative mt-8 text-xs">
						One source of truth for marketing and sales.
					</p>
				</aside>
			</div>
		</div>
	);
}
