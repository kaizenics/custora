/**
 * Google Ads export parsing.
 *
 * This decides what spend figures reach the database, and a misread separator
 * is off by 1000× while still looking like a plausible number — so the locale
 * cases are pinned rather than assumed.
 *
 *   pnpm test:ads
 */
import {
	parseAmount,
	parseDay,
	parseGoogleAdsCsv,
} from "@/api/lib/ads-csv";

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ── number formats ────────────────────────────────────────────────────────
check("plain integer", parseAmount("42") === 42);
check("US decimal", parseAmount("1,234.56") === 1234.56);
check("EU decimal", parseAmount("1.234,56") === 1234.56);
check("US thousands, no decimals", parseAmount("1,234") === 1234);
check("EU thousands, no decimals", parseAmount("1.234") === 1234);
check("bare decimal", parseAmount("0.75") === 0.75);
check("EU bare decimal", parseAmount("0,75") === 0.75);
check("currency symbol stripped", parseAmount("€1.234,56") === 1234.56);
check("trailing currency code stripped", parseAmount("1,234.56 EUR") === 1234.56);
check("millions, US", parseAmount("1,234,567.89") === 1234567.89);
check("millions, EU", parseAmount("1.234.567,89") === 1234567.89);
check("dash means no value", parseAmount("--") === null);
check("empty means no value", parseAmount("") === null);

// ── dates ─────────────────────────────────────────────────────────────────
check("ISO date", parseDay("2026-08-04")?.toISOString().slice(0, 10) === "2026-08-04");
check(
	"day-first when unambiguous",
	parseDay("31/07/2026")?.toISOString().slice(0, 10) === "2026-07-31",
);
check(
	"dotted day-first",
	parseDay("31.07.2026")?.toISOString().slice(0, 10) === "2026-07-31",
);
check("impossible month rejected", parseDay("31/13/2026") === null);
check("garbage rejected", parseDay("last tuesday") === null);
// Parsed as UTC midnight, so a day never lands on the neighbouring date for a
// reader west of Greenwich.
check("parsed at UTC midnight", parseDay("2026-08-04")?.getUTCHours() === 0);

// ── a realistic export ────────────────────────────────────────────────────
const SPANISH_EXPORT = `Informe de campañas
04 ago 2026 - 04 ago 2026
Día,Campaña,Impr.,Clics,Coste
2026-08-01,Emergencias Marbella,1.240,86,"48,20"
2026-08-02,Emergencias Marbella,1.310,92,"51,05"
2026-08-02,Nueva Andalucía,430,21,"12,60"
Total,,2.980,199,"111,85"`;

const spanish = parseGoogleAdsCsv(SPANISH_EXPORT);
check("preamble lines skipped", spanish.rows.length === 3);
check(
	"total row excluded",
	spanish.rows.every((r) => r.campaign !== null && !r.campaign.startsWith("Total")),
);
check("EU money → cents", spanish.rows[0]?.spendCents === 4820);
check("EU thousands in impressions", spanish.rows[0]?.impressions === 1240);
check("localised headers matched", spanish.rows[0]?.clicks === 86);
check("campaign name read", spanish.rows[2]?.campaign === "Nueva Andalucía");
check("currency detected from symbol-less EU export", spanish.rows[0]?.currency === "USD");

const US_EXPORT = `Campaign report
Day,Campaign,Impr.,Clicks,Cost
2026-08-01,Brand,"1,240",86,"$48.20"
2026-08-02,Brand,"1,310",92,"$51.05"
Total,,"2,550",178,"$99.25"`;

const us = parseGoogleAdsCsv(US_EXPORT);
check("US export rows", us.rows.length === 2);
check("US money → cents", us.rows[0]?.spendCents === 4820);
check("currency from $ symbol", us.rows[0]?.currency === "USD");

// A quoted campaign name containing a comma must not split the row.
const QUOTED = `Day,Campaign,Cost
2026-08-01,"Marbella, Costa del Sol",48.20`;
const quoted = parseGoogleAdsCsv(QUOTED);
check("quoted comma kept in campaign", quoted.rows[0]?.campaign === "Marbella, Costa del Sol");
check("quoted row still reads cost", quoted.rows[0]?.spendCents === 4820);

// ── failure modes are explained, not swallowed ────────────────────────────
function throwsWith(fn: () => unknown, fragment: string): boolean {
	try {
		fn();
		return false;
	} catch (error) {
		return (error as Error).message.toLowerCase().includes(fragment);
	}
}

check("empty file rejected", throwsWith(() => parseGoogleAdsCsv(""), "empty"));
check(
	"no cost column rejected",
	throwsWith(() => parseGoogleAdsCsv("Day,Campaign\n2026-08-01,Brand"), "cost"),
);
check(
	"no day column and no fallback rejected",
	throwsWith(() => parseGoogleAdsCsv("Campaign,Cost\nBrand,48.20"), "day"),
);

// The same export becomes valid once the caller says which day it covers.
const undated = parseGoogleAdsCsv(
	"Campaign,Cost\nBrand,48.20",
	new Date(Date.UTC(2026, 7, 4)),
);
check("fallback date accepted", undated.rows[0]?.date.toISOString().slice(0, 10) === "2026-08-04");

// A bad row is reported rather than silently dropped.
const partial = parseGoogleAdsCsv(
	`Day,Campaign,Cost
2026-08-01,Brand,48.20
not-a-date,Brand,10.00`,
);
check("good row kept alongside a bad one", partial.rows.length === 1);
check("bad row reported", partial.skipped.length === 1 && partial.skipped[0]?.line === 3);

// Blank lines must not shift the numbering, or the reported line sends the
// reader to the wrong row in their own file.
const spaced = parseGoogleAdsCsv(
	`Campaign report

Day,Campaign,Cost

2026-08-01,Brand,48.20

not-a-date,Brand,10.00`,
);
check("blank lines do not shift line numbers", spaced.skipped[0]?.line === 7);
check("blank lines do not drop rows", spaced.rows.length === 1);

let failed = 0;
for (const [label, ok] of checks) {
	if (!ok) failed++;
	console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed > 0 ? 1 : 0);
