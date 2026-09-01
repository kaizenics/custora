import { cn } from "@/lib/utils";

type CustoraMarkProps = {
	className?: string;
	/** Decorative when the adjacent wordmark already names the product. */
	decorative?: boolean;
};

/** A connected C: the journey path and the touchpoints joined to revenue. */
export function CustoraMark({
	className,
	decorative = false,
}: CustoraMarkProps) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={cn("size-8 shrink-0", className)}
			aria-hidden={decorative || undefined}
			aria-label={decorative ? undefined : "Custora"}
			role={decorative ? undefined : "img"}
		>
			<rect width="32" height="32" rx="9" fill="currentColor" />
			<path
				d="M22.25 9.15a9 9 0 1 0 0 13.7"
				stroke="var(--auth-mark-ink, white)"
				strokeWidth="2.35"
				strokeLinecap="round"
			/>
			<circle
				cx="22.25"
				cy="9.15"
				r="2"
				fill="var(--auth-mark-accent, white)"
			/>
			<circle
				cx="22.25"
				cy="22.85"
				r="2"
				fill="var(--auth-mark-accent, white)"
			/>
			<circle
				cx="11.1"
				cy="16"
				r="1.25"
				fill="var(--auth-mark-accent, white)"
			/>
		</svg>
	);
}

export function CustoraLogo({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<CustoraMark decorative />
			<span className="font-semibold text-base tracking-[-0.03em]">
				Custora
			</span>
		</div>
	);
}
