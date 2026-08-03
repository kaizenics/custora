/**
 * Turns grouped day/category rows into a dense series the chart can render.
 *
 * A stacked area with gaps reads as "nothing happened" in exactly the same way
 * as a zero does, but the shape is wrong — the band collapses and reappears.
 * Filling every day for every category keeps the stack continuous.
 */
export function zeroFillByDay<T extends string>(
	rows: Array<{ day: string; type: string; total: number }>,
	since: number,
	categories: readonly T[],
): Array<{ day: string } & Record<string, number | string>> {
	const byDay = new Map<string, Record<string, number>>();
	for (const row of rows) {
		const day = byDay.get(row.day) ?? {};
		day[row.type] = Number(row.total);
		byDay.set(row.day, day);
	}

	// "all time" has no lower bound; start at the first day that has data.
	const earliest =
		since === 0
			? (rows[0]?.day ?? new Date().toISOString().slice(0, 10))
			: new Date(since).toISOString().slice(0, 10);

	const cursor = new Date(`${earliest}T00:00:00Z`);
	const end = new Date();
	end.setUTCHours(0, 0, 0, 0);

	const out: Array<{ day: string } & Record<string, number | string>> = [];
	while (cursor <= end) {
		const key = cursor.toISOString().slice(0, 10);
		const found = byDay.get(key) ?? {};
		const point: Record<string, number | string> = { day: key };
		for (const category of categories) point[category] = found[category] ?? 0;
		out.push(point as { day: string } & Record<string, number | string>);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return out;
}
