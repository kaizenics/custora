import { Button } from "@custora/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@custora/ui/components/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

export const RANGES = ["24h", "7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_LABEL: Record<Range, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
	all: "All time",
};

export function RangePicker({
	value,
	onChange,
}: {
	value: Range;
	onChange: (range: Range) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
				{RANGE_LABEL[value]}
				<ChevronDown data-icon="inline-end" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				{RANGES.map((range) => (
					<DropdownMenuItem key={range} onClick={() => onChange(range)}>
						{RANGE_LABEL[range]}
						{range === value ? <Check className="ml-auto" /> : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
