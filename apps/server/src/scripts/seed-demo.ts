/**
 * Seeds a demo site and drives synthetic traffic through the real collector
 * endpoint over HTTP.
 *
 * It deliberately does not write events straight to the database: going through
 * POST /c/v1/e is what exercises cookie handling, session windowing, touchpoint
 * capture, and identity stitching — the parts worth proving actually work.
 *
 * Run with the server already up:
 *   pnpm --filter server dev
 *   pnpm --filter server seed:demo
 */
import { db } from "@custora/db";
import { createId, createWriteKey } from "@custora/db/ids";
import { contact, deal, site } from "@custora/db/schema";
import { and, eq } from "drizzle-orm";

const BASE = process.env.COLLECTOR_URL ?? "http://localhost:3000";
const DOMAIN = "northgate.dev";
const DAY = 86_400_000;

type Channel = {
	ctx: Record<string, string> | null;
	referrer: string | null;
};

const CHANNELS: Channel[] = [
	{
		ctx: {
			source: "google",
			medium: "cpc",
			campaign: "brand-search",
			click_id: "Cj0KCQiA-demo",
			click_id_provider: "google",
		},
		referrer: "https://www.google.com/",
	},
	{
		ctx: {
			source: "meta",
			medium: "paid-social",
			campaign: "retargeting-q3",
			click_id: "IwAR0demo",
			click_id_provider: "meta",
		},
		referrer: "https://l.facebook.com/",
	},
	{
		ctx: { source: "newsletter", medium: "email", campaign: "august-digest" },
		referrer: null,
	},
	{ ctx: null, referrer: "https://news.ycombinator.com/" },
	{ ctx: null, referrer: null },
];

const PAGES = ["/", "/pricing", "/case-studies", "/book-a-call"];

const PEOPLE = [
	{
		email: "sam.okafor@northgate.dev",
		name: "Sam Okafor",
		company: "Northgate",
	},
	{
		email: "priya.raman@lumenworks.io",
		name: "Priya Raman",
		company: "Lumen Works",
	},
	{
		email: "tobias.lindqvist@havnstudio.se",
		name: "Tobias Lindqvist",
		company: "Havn Studio",
	},
	{
		email: "amara.diallo@brightpath.co",
		name: "Amara Diallo",
		company: "Brightpath",
	},
	{
		email: "wei.zhang@meridianlabs.cn",
		name: "Wei Zhang",
		company: "Meridian Labs",
	},
	{
		email: "jonas.meyer@kessler-bau.de",
		name: "Jonas Meyer",
		company: "Kessler Bau",
	},
];

function pick<T>(list: T[], index: number): T {
	return list[index % list.length] as T;
}

async function post(
	writeKey: string,
	body: Record<string, unknown>,
	cookie?: string,
) {
	const response = await fetch(`${BASE}/c/v1/e`, {
		method: "POST",
		headers: {
			"Content-Type": "text/plain;charset=UTF-8",
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
			...(cookie ? { Cookie: cookie } : {}),
		},
		body: JSON.stringify({ k: writeKey, ...body }),
	});

	const setCookie = response.headers.get("set-cookie");
	const visitorCookie = setCookie?.split(";")[0];
	return visitorCookie ?? cookie;
}

async function ensureSite() {
	const [existing] = await db
		.select()
		.from(site)
		.where(eq(site.domain, DOMAIN))
		.limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(site)
		.values({
			id: createId("site"),
			name: "Northgate marketing site",
			domain: DOMAIN,
			writeKey: createWriteKey(),
		})
		.returning();

	if (!created) throw new Error("Could not create the demo site");
	return created;
}

async function main() {
	const demoSite = await ensureSite();
	console.log(`Site: ${demoSite.name} (${demoSite.domain})`);
	console.log(`Write key: ${demoSite.writeKey}\n`);

	let identified = 0;

	for (let visitorIndex = 0; visitorIndex < 24; visitorIndex++) {
		const channel = pick(CHANNELS, visitorIndex);
		const daysAgo = 25 - Math.floor(visitorIndex / 1.2);
		const firstVisit = Date.now() - daysAgo * DAY;

		// Landing hit — this is what creates the touchpoint.
		let cookie = await post(demoSite.writeKey, {
			t: "pageview",
			n: "Northgate — attribution that survives the sales cycle",
			u: `https://${DOMAIN}/`,
			p: "/",
			r: channel.referrer,
			ctx: channel.ctx,
			ts: firstVisit,
		});

		const depth = 1 + (visitorIndex % 3);
		for (let step = 1; step <= depth; step++) {
			cookie = await post(
				demoSite.writeKey,
				{
					t: "pageview",
					n: "Northgate",
					u: `https://${DOMAIN}${pick(PAGES, visitorIndex + step)}`,
					p: pick(PAGES, visitorIndex + step),
					ctx: channel.ctx,
					ts: firstVisit + step * 90_000,
				},
				cookie,
			);
		}

		if (visitorIndex % 3 === 0) {
			cookie = await post(
				demoSite.writeKey,
				{
					t: "click",
					n: "Pricing CTA",
					u: `https://${DOMAIN}/pricing`,
					p: "/pricing",
					props: { text: "Book a call" },
					ctx: channel.ctx,
					ts: firstVisit + 240_000,
				},
				cookie,
			);
		}

		// A quarter of visitors come back days later and convert. The gap is the
		// point: it is well past a third-party cookie's life.
		if (visitorIndex % 4 === 0 && identified < PEOPLE.length) {
			const person = pick(PEOPLE, identified);
			const returnVisit = firstVisit + 9 * DAY;

			cookie = await post(
				demoSite.writeKey,
				{
					t: "pageview",
					n: "Book a call",
					u: `https://${DOMAIN}/book-a-call`,
					p: "/book-a-call",
					ctx: channel.ctx,
					ts: returnVisit,
				},
				cookie,
			);

			await post(
				demoSite.writeKey,
				{
					t: "form_submit",
					n: "Book a call",
					u: `https://${DOMAIN}/book-a-call`,
					p: "/book-a-call",
					traits: person,
					ctx: channel.ctx,
					ts: returnVisit + 45_000,
				},
				cookie,
			);

			identified++;
		}
	}

	// Revenue on a couple of the identified people, so the channel report has
	// something on the far end of the loop.
	const wonFor = [PEOPLE[0]?.email, PEOPLE[2]?.email].filter(
		Boolean,
	) as string[];
	for (const [index, email] of wonFor.entries()) {
		const [person] = await db
			.select()
			.from(contact)
			.where(and(eq(contact.siteId, demoSite.id), eq(contact.email, email)))
			.limit(1);
		if (!person) continue;

		const [existingDeal] = await db
			.select({ id: deal.id })
			.from(deal)
			.where(eq(deal.contactId, person.id))
			.limit(1);
		if (existingDeal) continue;

		await db.insert(deal).values({
			id: createId("deal"),
			siteId: demoSite.id,
			contactId: person.id,
			title: index === 0 ? "Annual retainer" : "Implementation project",
			valueCents: index === 0 ? 1_440_000 : 680_000,
			currency: "USD",
			stage: "won",
			closedAt: new Date(),
		});

		await db
			.update(contact)
			.set({ status: "customer" })
			.where(eq(contact.id, person.id));
	}

	console.log(
		`Simulated 24 visitors, ${identified} identified, ${wonFor.length} deals won.`,
	);
	console.log("Open http://localhost:3100/overview to see it.");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
