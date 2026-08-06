/**
 * Generates the Google Ads Script an advertiser pastes into their own account.
 *
 * This is the path that needs no developer token and no review: the script runs
 * inside Google Ads with access to that account's own data, and posts daily
 * spend out to Custora. What Google's API makes you wait days for, this does in
 * five minutes.
 *
 * The key is baked in, so there is nothing for the reader to wire up by hand —
 * which is also why the panel showing it is admin-only.
 */
export function googleAdsScript(options: {
	endpoint: string;
	spendKey: string;
	days?: number;
}): string {
	const days = options.days ?? 30;

	return `// Custora — daily Google Ads spend push.
// Paste into Google Ads: Tools → Bulk actions → Scripts → +, then schedule daily.

var ENDPOINT = ${JSON.stringify(options.endpoint)};
var SPEND_KEY = ${JSON.stringify(options.spendKey)};
var DAYS = ${days};

function main() {
  var rows = [];
  var query =
    "SELECT campaign.name, segments.date, metrics.impressions, " +
    "metrics.clicks, metrics.cost_micros " +
    "FROM campaign " +
    "WHERE segments.date DURING LAST_" + DAYS + "_DAYS";

  var report = AdsApp.report(query);
  var iterator = report.rows();

  while (iterator.hasNext()) {
    var row = iterator.next();
    rows.push({
      date: row["segments.date"],
      campaign: row["campaign.name"],
      // Micros are millionths of the account currency.
      cost: Number(row["metrics.cost_micros"]) / 1000000,
      impressions: Number(row["metrics.impressions"]),
      clicks: Number(row["metrics.clicks"])
    });
  }

  if (!rows.length) {
    Logger.log("No rows for the last " + DAYS + " days; nothing sent.");
    return;
  }

  var response = UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + SPEND_KEY },
    payload: JSON.stringify({
      source: "google",
      currency: AdsApp.currentAccount().getCurrencyCode(),
      rows: rows
    }),
    muteHttpExceptions: true
  });

  // Logged rather than thrown so one bad day does not disable the schedule,
  // but visible in the script history when something is wrong.
  Logger.log("Custora responded " + response.getResponseCode() + ": " + response.getContentText());
}
`;
}
