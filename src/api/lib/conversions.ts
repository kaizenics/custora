import { sql } from "drizzle-orm";

/**
 * What counts as a conversion, in one place.
 *
 * A conversion is an event whose name matches a rule the site marked as one.
 * Resolved by name rather than by a column on the event, so flagging a rule
 * applies to the taps it has already produced — the alternative would leave
 * every historical conversion invisible until someone re-tapped.
 *
 * Deliberately not "any click": on a service site most clicks are navigation,
 * and counting them as leads would make the conversion rate meaningless.
 */
export function conversionEventFilter(siteId: string, alias = "e") {
	return sql`${sql.raw(alias)}.name IN (
		SELECT name FROM event_rule
		WHERE site_id = ${siteId} AND is_conversion = 1
	)`;
}

/** True when the site has flagged nothing yet, so the UI can say so. */
export function noConversionRules(rows: Array<{ total: number }>): boolean {
	return (rows[0]?.total ?? 0) === 0;
}
