import { CustoraLogo, CustoraMark } from "@/components/custora-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Check,
	Code2,
	Fingerprint,
	MousePointerClick,
	RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Custora | Revenue attribution, connected" },
			{
				name: "description",
				content:
					"Custora connects ad clicks, anonymous visits, leads, and closed deals in one complete customer journey.",
			},
		],
	}),
	component: MarketingPage,
});

const JOURNEY = [
	{
		label: "Ad click",
		detail: "Click IDs and campaign context captured at arrival.",
	},
	{
		label: "Anonymous visit",
		detail: "Sessions and meaningful events preserved before signup.",
	},
	{
		label: "Identified lead",
		detail: "One email connects the person to their earlier history.",
	},
	{
		label: "Closed deal",
		detail: "Won revenue returns to the campaign that started it.",
	},
];

const PRODUCT_POINTS = [
	"Capture UTM parameters and click IDs",
	"Join anonymous activity after identification",
	"Compare first and last touch attribution",
	"Report leads, pipeline, revenue, and ROAS",
];

function MarketingPage() {
	return (
		<div className="marketing-page min-h-svh overflow-x-hidden bg-white text-[#0a0a0a]">
			<a className="marketing-skip-link" href="#main-content">
				Skip to content
			</a>
			<MarketingHeader />
			<main id="main-content">
				<HeroSection />
				<JourneySection />
				<IdentitySection />
				<AttributionSection />
				<InstallSection />
				<ClosingSection />
			</main>
			<MarketingFooter />
		</div>
	);
}

function MarketingHeader() {
	return (
		<header className="marketing-header sticky top-0 z-40 border-black/10 border-b bg-white/90 backdrop-blur-xl">
			<div className="marketing-container flex h-[72px] items-center justify-between gap-5">
				<a href="#top" aria-label="Custora home">
					<CustoraLogo />
				</a>
				<nav
					aria-label="Main navigation"
					className="hidden items-center gap-7 text-[13px] text-black/60 md:flex"
				>
					<a className="marketing-nav-link" href="#product">
						Product
					</a>
					<a className="marketing-nav-link" href="#how-it-works">
						How it works
					</a>
					<a className="marketing-nav-link" href="#install">
						Install
					</a>
				</nav>
				<div className="flex items-center gap-2">
					<Link
						to="/login"
						className="hidden px-3 py-2 font-medium text-[13px] text-black/65 transition-colors hover:text-black sm:inline-flex"
					>
						Sign in
					</Link>
					<Link
						to="/overview"
						className={cn(
							buttonVariants({ size: "lg" }),
							"h-10 px-4",
						)}
					>
						Open dashboard
						<ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Link>
				</div>
			</div>
		</header>
	);
}

function HeroSection() {
	return (
		<section id="top" className="marketing-hero border-black/10 border-b">
			<div className="marketing-container grid min-h-[calc(100svh-72px)] items-center gap-10 py-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:py-16">
				<div className="marketing-hero-copy max-w-[650px] lg:py-10">
					<p className="marketing-eyebrow">Revenue attribution, connected</p>
					<h1 className="mt-7 max-w-[10ch] text-balance font-semibold text-[clamp(3.5rem,7vw,7rem)] leading-[0.91] tracking-[-0.065em]">
						Trace revenue home.
					</h1>
					<p className="mt-8 max-w-[540px] text-pretty text-black/58 text-lg leading-7">
						Custora connects every ad click, anonymous visit, lead, and closed deal in one customer journey.
					</p>
					<div className="mt-9 flex flex-wrap items-center gap-3">
						<Link
							to="/overview"
							className={cn(
								buttonVariants({ size: "lg" }),
								"h-12 px-5",
							)}
						>
							Open dashboard
							<ArrowRight data-icon="inline-end" aria-hidden="true" />
						</Link>
						<a
							href="#how-it-works"
							className={cn(
								buttonVariants({ variant: "link", size: "lg" }),
								"h-12 px-2",
							)}
						>
							See how it works
						</a>
					</div>
				</div>

				<figure className="marketing-hero-visual relative lg:ml-auto lg:w-full">
					<div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#ededeb] sm:aspect-[5/4] lg:aspect-[4/5] xl:aspect-[5/4]">
						<img
							src="/images/custora-journey-hero.png"
							alt="A black path moving through connected touchpoints and ending at a solid revenue block"
							className="h-full w-full object-cover"
							fetchPriority="high"
						/>
					</div>
					<figcaption className="mt-3 grid grid-cols-3 gap-3 text-[11px] text-black/45">
						<span>First touch captured</span>
						<span className="text-center">Identity preserved</span>
						<span className="text-right">Revenue connected</span>
					</figcaption>
				</figure>
			</div>
		</section>
	);
}

function JourneySection() {
	return (
		<section id="how-it-works" className="marketing-section border-black/10 border-b py-24 sm:py-32">
			<div className="marketing-container">
				<div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
					<p className="max-w-[20rem] text-black/48 text-sm leading-6">
						The customer journey rarely fits inside one session. Your attribution should not have to.
					</p>
					<h2 className="max-w-[820px] text-balance font-semibold text-[clamp(2.6rem,5.6vw,5.8rem)] leading-[0.95] tracking-[-0.055em]">
						The whole journey, intact.
					</h2>
				</div>

				<ol className="marketing-journey mt-16 grid border-black/12 border-y md:grid-cols-4">
					{JOURNEY.map((item, index) => (
						<li key={item.label} className="marketing-journey-step relative py-7 md:px-6 md:py-8">
							<div className="flex items-center gap-4">
								<span className="grid size-8 shrink-0 place-items-center rounded-full border border-black/18 font-medium text-[11px]">
									{String(index + 1).padStart(2, "0")}
								</span>
								<h3 className="font-semibold text-sm tracking-[-0.02em]">{item.label}</h3>
							</div>
							<p className="mt-4 max-w-[15rem] text-black/48 text-sm leading-6 md:ml-12">
								{item.detail}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

function IdentitySection() {
	return (
		<section id="product" className="marketing-section py-24 sm:py-32">
			<div className="marketing-container grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch lg:gap-16">
				<figure className="min-h-[520px] overflow-hidden rounded-2xl bg-[#101010] lg:min-h-[680px]">
					<img
						src="/images/custora-cross-device.png"
						alt="A continuous white signal passing through two separate dark glass planes"
						className="h-full w-full object-cover"
						loading="lazy"
					/>
				</figure>

				<div className="flex flex-col justify-between border-black/12 pt-7 lg:py-7">
					<div>
						<h2 className="max-w-[11ch] text-balance font-semibold text-[clamp(2.6rem,4.3vw,4.7rem)] leading-[0.96] tracking-[-0.055em]">
							A lead should bring their history with them.
						</h2>
						<p className="mt-7 max-w-[31rem] text-black/52 text-lg leading-7">
							When a visitor identifies, Custora links their earlier sessions and touchpoints to the same contact. No journey reset at the form.
						</p>
					</div>

					<div className="marketing-code mt-16 overflow-hidden rounded-2xl border border-black/12 bg-[#f3f3f1]">
						<div className="flex items-center justify-between border-black/10 border-b px-5 py-4">
							<span className="flex items-center gap-2 font-medium text-xs">
								<Code2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
								Identify a lead
							</span>
							<span className="text-[11px] text-black/38">JavaScript</span>
						</div>
						<pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7"><code>{`custora.identify({
  email: "sam@northgate.dev",
  name: "Sam Okafor"
})`}</code></pre>
					</div>
				</div>
			</div>
		</section>
	);
}

function AttributionSection() {
	return (
		<section className="marketing-section border-black/10 border-y bg-[#f4f4f2] py-24 sm:py-32">
			<div className="marketing-container">
				<div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-24">
					<div>
						<h2 className="max-w-[10ch] text-balance font-semibold text-[clamp(2.8rem,5vw,5.5rem)] leading-[0.94] tracking-[-0.06em]">
							Marketing insight, meet sales truth.
						</h2>
					</div>
					<div className="lg:pt-4">
						<p className="max-w-[34rem] text-black/55 text-lg leading-7">
							Custora computes attribution from raw touchpoints and your actual deal pipeline, so every report can be traced back to a person and a journey.
						</p>
						<ul className="mt-10 grid gap-x-8 gap-y-5 sm:grid-cols-2">
							{PRODUCT_POINTS.map((point) => (
								<li key={point} className="flex gap-3 border-black/10 border-t pt-4 text-sm leading-6">
									<Check className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
									<span>{point}</span>
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className="mt-20 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
					<div className="rounded-2xl border border-black/12 bg-white p-7 sm:p-10">
						<div className="flex items-center justify-between">
							<Fingerprint className="size-7" strokeWidth={1.5} aria-hidden="true" />
							<span className="text-[11px] text-black/40">Customer journey</span>
						</div>
						<div className="mt-20 grid gap-8 sm:grid-cols-2">
							<div>
								<p className="text-[11px] text-black/40 uppercase tracking-[0.16em]">First touch</p>
								<p className="mt-3 font-semibold text-2xl tracking-[-0.04em]">Where demand began</p>
							</div>
							<div>
								<p className="text-[11px] text-black/40 uppercase tracking-[0.16em]">Last touch</p>
								<p className="mt-3 font-semibold text-2xl tracking-[-0.04em]">What moved it forward</p>
							</div>
						</div>
					</div>

					<div className="flex min-h-[300px] flex-col justify-between rounded-2xl border border-black/12 bg-white p-7 sm:p-10">
						<RefreshCw className="size-7" strokeWidth={1.5} aria-hidden="true" />
						<div>
							<p className="font-semibold text-3xl tracking-[-0.045em]">Recomputed, not rewritten.</p>
							<p className="mt-4 text-black/48 text-sm leading-6">Switch attribution models without changing the underlying journey.</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function InstallSection() {
	return (
		<section id="install" className="marketing-section pt-24 sm:pt-32">
			<div className="marketing-container grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
				<div className="lg:sticky lg:top-28 lg:self-start lg:pb-8">
					<p className="marketing-eyebrow">One snippet to start</p>
					<h2 className="mt-7 max-w-[9ch] text-balance font-semibold text-[clamp(2.8rem,4.8vw,5rem)] leading-[0.95] tracking-[-0.055em]">
						Install once. Keep the context.
					</h2>
					<p className="mt-5 max-w-[28rem] text-black/52 text-lg leading-7">
						Add the tracking script before the closing body tag. Custora starts building the customer journey from the next visit.
					</p>
				</div>

				<div className="flex h-full flex-col border-black/15 border-t">
					<div className="grid md:grid-cols-[10rem_1fr]">
						<div className="flex items-start gap-3 px-5 py-6 md:px-6 md:py-8">
							<Code2 className="mt-0.5 size-5" strokeWidth={1.5} aria-hidden="true" />
							<div>
								<p className="font-semibold text-sm tracking-[-0.02em]">Add the script</p>
								<p className="mt-1 text-black/45 text-xs">Before the body closes</p>
							</div>
						</div>

						<div className="border-black/15 border-t bg-[#f4f4f2] md:border-t-0 md:border-l">
							<div className="flex items-center justify-between border-black/10 border-b px-5 py-4 md:px-7">
								<span className="font-mono text-[11px] text-black/52">custora.js</span>
								<span className="text-[11px] text-black/38">HTML</span>
							</div>
							<pre className="overflow-x-auto px-5 py-6 font-mono text-[12px] leading-6 text-black/70 md:px-7 md:py-8"><code>{`<script defer
  src="https://track.your-domain.com/c/v1/custora.js"
  data-key="your-site-key">
</script>`}</code></pre>
						</div>
					</div>

					<div className="grid flex-1 border-black/15 border-t md:grid-cols-2">
						<article className="flex items-center gap-5 px-5 py-7 md:px-7 md:py-9">
							<div className="grid size-10 shrink-0 place-items-center rounded-lg border border-black/12">
								<MousePointerClick className="size-5" strokeWidth={1.5} aria-hidden="true" />
							</div>
							<div>
								<h3 className="font-semibold text-base tracking-[-0.025em]">Track important clicks</h3>
								<p className="mt-2 text-black/48 text-sm leading-6">Create click rules from the dashboard without another code change.</p>
							</div>
						</article>

						<article className="flex items-center gap-5 border-black/15 border-t px-5 py-7 md:border-t-0 md:border-l md:px-7 md:py-9">
							<div className="grid size-10 shrink-0 place-items-center rounded-lg border border-black/12">
								<Fingerprint className="size-5" strokeWidth={1.5} aria-hidden="true" />
							</div>
							<div>
								<h3 className="font-semibold text-base tracking-[-0.025em]">Keep anonymous history</h3>
								<p className="mt-2 text-black/48 text-sm leading-6">Earlier visits connect automatically when the person identifies.</p>
							</div>
						</article>
					</div>
				</div>
			</div>
		</section>
	);
}

function ClosingSection() {
	return (
		<section className="marketing-section border-black/10 border-t py-24 sm:py-32">
			<div className="marketing-container">
				<div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
					<div>
						<p className="max-w-[15rem] text-black/45 text-sm leading-6">From the first campaign click to the revenue it creates.</p>
						<h2 className="mt-8 max-w-[13ch] text-balance font-semibold text-[clamp(3.5rem,7vw,7.5rem)] leading-[0.9] tracking-[-0.065em]">
							Close the loop.
						</h2>
					</div>
					<Link
						to="/overview"
						className="marketing-closing-link group flex min-h-28 items-center justify-between gap-6 rounded-xl bg-black p-5 text-white outline-none transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4 active:translate-y-0 sm:p-6 lg:mb-2"
					>
						<span>
							<span className="block text-white/50 text-xs">Continue to your workspace</span>
							<span className="mt-2 block font-semibold text-xl tracking-[-0.035em]">Open dashboard</span>
						</span>
						<span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-black transition-transform duration-200 group-hover:translate-x-1">
							<ArrowRight className="size-5" strokeWidth={1.75} aria-hidden="true" />
						</span>
					</Link>
				</div>
			</div>
		</section>
	);
}

function MarketingFooter() {
	return (
		<footer className="border-black/10 border-t py-8">
			<div className="marketing-container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2.5">
					<CustoraMark decorative className="size-7" />
					<span className="font-semibold text-sm tracking-[-0.025em]">Custora</span>
				</div>
				<p className="text-black/42 text-xs">Revenue attribution that keeps the customer journey connected.</p>
				<div className="flex gap-5 text-xs text-black/50">
					<a className="transition-colors hover:text-black" href="#product">Product</a>
					<Link className="transition-colors hover:text-black" to="/login">Sign in</Link>
				</div>
			</div>
		</footer>
	);
}
