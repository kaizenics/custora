/** One titled block on a settings page. */
export function SettingsSection({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="font-medium text-sm tracking-tight">{title}</h2>
				<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
			</div>
			{children}
		</section>
	);
}
