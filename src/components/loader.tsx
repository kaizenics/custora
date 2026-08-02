import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/**
 * Centred loading state.
 *
 * Defaults to filling the viewport because the main caller is the router's
 * pending component, which renders with no height-constrained parent — `h-full`
 * there collapses to the spinner's own height and pins it to the top of the
 * page. Pass a smaller min-height when embedding it in an existing layout.
 */
export default function Loader({ className }: { className?: string }) {
	return (
		<div
			role="status"
			className={cn("flex min-h-svh items-center justify-center", className)}
		>
			<Loader2 className="size-5 animate-spin text-muted-foreground" />
			<span className="sr-only">Loading</span>
		</div>
	);
}
