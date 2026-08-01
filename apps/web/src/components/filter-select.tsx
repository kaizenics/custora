import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@custora/ui/components/select";

export type FilterOption = {
	label: string;
	/** null is the "all" row — Base UI's idiom for an empty selection. */
	value: string | null;
	count?: number;
};

/**
 * Filter dropdown for the table toolbars.
 *
 * Base UI's Select needs the full option list on the root to render the trigger
 * label, so options are passed as data rather than as children.
 */
export function FilterSelect({
	id,
	label,
	options,
	value,
	onChange,
	className,
}: {
	/** Lets a visible <Label htmlFor> point at the trigger button. */
	id?: string;
	label: string;
	options: FilterOption[];
	value: string | null;
	onChange: (value: string | null) => void;
	className?: string;
}) {
	return (
		<Select
			items={options}
			value={value}
			onValueChange={(next) => onChange((next as string | null) ?? null)}
		>
			<SelectTrigger id={id} size="sm" className={className} aria-label={label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				{options.map((option) => (
					<SelectItem key={option.value ?? "__all"} value={option.value}>
						<span className="flex-1">{option.label}</span>
						{typeof option.count === "number" ? (
							<span className="ml-auto pl-4 text-muted-foreground tabular-nums">
								{option.count}
							</span>
						) : null}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
