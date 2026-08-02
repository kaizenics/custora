import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Segmented theme picker.
 *
 * next-themes cannot know the active theme until it has read localStorage and
 * the media query on the client, so the first render is deliberately a
 * skeleton. Rendering a guessed value instead produces a visible flip and a
 * hydration mismatch.
 */
export function ThemeToggle() {
	const { theme, setTheme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <Skeleton className="h-8 w-[264px]" />;
	}

	return (
		<div className="flex flex-col gap-2">
			<Tabs
				value={theme ?? "system"}
				onValueChange={(value) => setTheme(String(value))}
			>
				<TabsList aria-label="Colour theme">
					{OPTIONS.map((option) => (
						<TabsTrigger key={option.value} value={option.value}>
							<option.icon className="size-3.5" />
							{option.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{theme === "system" ? (
				<p className="text-[11px] text-muted-foreground">
					Following your operating system, currently{" "}
					{resolvedTheme ?? "unknown"}.
				</p>
			) : null}
		</div>
	);
}
