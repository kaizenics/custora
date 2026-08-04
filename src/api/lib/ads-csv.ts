/**
 * Parser for Google Ads report exports.
 *
 * The export is not a clean CSV. It carries one or two preamble lines naming
 * the report and its date range, a header row whose labels differ by column set
 * and by UI language, and a trailing "Total" row that would double every figure
 * if it were read as data. Numbers are locale-formatted — "1.234,56" in Spain,
 * "1,234.56" in the US — and money may carry a symbol.
 *
 * Rather than demand one exact shape, this recognises the columns it needs by
 * alias and rejects the file with a specific reason when it cannot.
 */

export type SpendRow = {
	/** UTC midnight for the day the spend belongs to. */
	date: Date;
	campaign: string | null;
	spendCents: number;
	currency: string;
	impressions: number | null;
	clicks: number | null;
};

export type ParseResult = {
	rows: SpendRow[];
	/** Rows skipped with the reason, so an import never silently drops data. */
	skipped: Array<{ line: number; reason: string }>;
};

/**
 * Column aliases, lowercased. Google varies these by report type and by the
 * account's display language; "Interactions" is what a call-only campaign
 * reports instead of "Clicks".
 */
const COLUMNS = {
	date: ["day", "date", "día", "fecha"],
	campaign: ["campaign", "campaign name", "campaña"],
	cost: ["cost", "spend", "coste", "costo"],
	impressions: ["impr.", "impressions", "impr", "impresiones"],
	clicks: ["clicks", "interactions", "clics", "interacciones"],
} as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
	"€": "EUR",
	$: "USD",
	"£": "GBP",
};

/** Splits one CSV line, honouring quoted fields that contain commas. */
function splitLine(line: string): string[] {
	const out: string[] = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			// A doubled quote inside a quoted field is a literal quote.
			if (quoted && line[i + 1] === '"') {
				field += '"';
				i++;
			} else {
				quoted = !quoted;
			}
		} else if (char === "," && !quoted) {
			out.push(field);
			field = "";
		} else {
			field += char;
		}
	}
	out.push(field);
	return out.map((value) => value.trim());
}

/**
 * Reads a locale-formatted number.
 *
 * The ambiguous case is a single separator: "1,234" is one thousand two hundred
 * in the US and one-point-two-three-four in Spain. Resolved by digit count —
 * exactly three digits after the separator means it is a thousands grouping,
 * which is the convention both locales share.
 */
export function parseAmount(raw: string): number | null {
	const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
	if (!cleaned || cleaned === "-") return null;

	const lastComma = cleaned.lastIndexOf(",");
	const lastDot = cleaned.lastIndexOf(".");

	let normalised: string;
	if (lastComma === -1 && lastDot === -1) {
		normalised = cleaned;
	} else if (lastComma > lastDot) {
		// Comma is rightmost: decimal separator unless it groups three digits.
		const decimals = cleaned.length - lastComma - 1;
		normalised =
			decimals === 3
				? cleaned.replace(/,/g, "")
				: `${cleaned.slice(0, lastComma).replace(/[.,]/g, "")}.${cleaned.slice(lastComma + 1)}`;
	} else {
		const decimals = cleaned.length - lastDot - 1;
		normalised =
			decimals === 3
				? cleaned.replace(/\./g, "")
				: `${cleaned.slice(0, lastDot).replace(/[.,]/g, "")}.${cleaned.slice(lastDot + 1)}`;
	}

	const value = Number(normalised);
	return Number.isFinite(value) ? value : null;
}

function parseCount(raw: string): number | null {
	const value = parseAmount(raw);
	if (value == null) return null;
	return Math.round(value);
}

/**
 * Accepts the formats Google emits: ISO, and the day-first / month-first
 * variants its localised exports use. Ambiguous d/m vs m/d is resolved toward
 * day-first only when the first field cannot be a month.
 */
export function parseDay(raw: string): Date | null {
	const value = raw.trim();
	if (!value) return null;

	const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (iso) {
		return new Date(
			Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
		);
	}

	const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
	if (slash) {
		const a = Number(slash[1]);
		const b = Number(slash[2]);
		const year = Number(slash[3]);
		// >12 in the first field can only be a day.
		const [day, month] = a > 12 ? [a, b] : [b, a];
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return new Date(Date.UTC(year, month - 1, day));
	}

	return null;
}

function findColumn(header: string[], aliases: readonly string[]): number {
	return header.findIndex((label) => aliases.includes(label.toLowerCase()));
}

function detectCurrency(lines: string[]): string {
	for (const line of lines) {
		for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
			if (line.includes(symbol)) return code;
		}
		// Some exports label the column "Cost (EUR)" instead of using a symbol.
		const labelled = /\b(?:cost|spend|coste)\s*\(([A-Z]{3})\)/i.exec(line);
		if (labelled?.[1]) return labelled[1].toUpperCase();
	}
	return "USD";
}

/**
 * @param csv    Raw export text.
 * @param fallbackDate Used when the report is not segmented by day — a
 *   date-range export has no Day column, so the caller supplies which day the
 *   totals belong to rather than the import guessing.
 */
export function parseGoogleAdsCsv(
	csv: string,
	fallbackDate?: Date,
): ParseResult {
	/**
	 * Blank lines are kept rather than filtered out, so a reported line number
	 * is the line the reader will actually find in their file. They are skipped
	 * where they are read instead.
	 */
	const lines = csv.split(/\r?\n/).map((line) => line.trim());

	if (!lines.some(Boolean)) {
		throw new Error("That file is empty.");
	}

	// Skip the report-name and date-range preamble by scanning for the first
	// row that actually names a column we need.
	let headerIndex = -1;
	let header: string[] = [];
	let inspected = 0;
	for (let i = 0; i < lines.length && inspected < 10; i++) {
		if (!lines[i]) continue;
		inspected++;
		const candidate = splitLine(lines[i] ?? "");
		if (
			findColumn(candidate, COLUMNS.cost) !== -1 ||
			findColumn(candidate, COLUMNS.campaign) !== -1
		) {
			headerIndex = i;
			header = candidate;
			break;
		}
	}

	if (headerIndex === -1) {
		throw new Error(
			"Could not find a header row. Export the Campaigns report from Google Ads with at least a Campaign and Cost column.",
		);
	}

	const costAt = findColumn(header, COLUMNS.cost);
	if (costAt === -1) {
		throw new Error(
			"No Cost column in that export. Add Cost to the report columns and export again.",
		);
	}

	const dateAt = findColumn(header, COLUMNS.date);
	if (dateAt === -1 && !fallbackDate) {
		throw new Error(
			"That export has no Day column. Either segment the report by day, or pick the date the totals cover.",
		);
	}

	const campaignAt = findColumn(header, COLUMNS.campaign);
	const impressionsAt = findColumn(header, COLUMNS.impressions);
	const clicksAt = findColumn(header, COLUMNS.clicks);
	const currency = detectCurrency(lines.slice(0, headerIndex + 2));

	const rows: SpendRow[] = [];
	const skipped: ParseResult["skipped"] = [];

	for (let i = headerIndex + 1; i < lines.length; i++) {
		if (!lines[i]) continue;
		const lineNumber = i + 1;
		const cells = splitLine(lines[i] ?? "");
		const first = (cells[0] ?? "").toLowerCase();

		// The trailing total row would double every figure in the file.
		if (first.startsWith("total") || first.startsWith("---")) continue;

		const date = dateAt === -1 ? fallbackDate : parseDay(cells[dateAt] ?? "");
		if (!date) {
			skipped.push({ line: lineNumber, reason: "unreadable date" });
			continue;
		}

		const spend = parseAmount(cells[costAt] ?? "");
		if (spend == null) {
			skipped.push({ line: lineNumber, reason: "unreadable cost" });
			continue;
		}

		rows.push({
			date,
			campaign: campaignAt === -1 ? null : (cells[campaignAt] || null),
			// Money is stored in minor units; rounding here rather than at write
			// time keeps the value that reaches the database exact.
			spendCents: Math.round(spend * 100),
			currency,
			impressions:
				impressionsAt === -1 ? null : parseCount(cells[impressionsAt] ?? ""),
			clicks: clicksAt === -1 ? null : parseCount(cells[clicksAt] ?? ""),
		});
	}

	if (!rows.length) {
		throw new Error(
			skipped.length
				? `No usable rows — ${skipped.length} could not be read. Check the date and cost columns.`
				: "No data rows found below the header.",
		);
	}

	return { rows, skipped };
}
