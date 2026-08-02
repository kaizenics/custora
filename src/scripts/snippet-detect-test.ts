/**
 * Detection cases for findSnippet(). The install check is only as trustworthy
 * as this parser, and it runs against real-world HTML we do not control.
 */
import { findSnippet } from "@/api/lib/verify-install";

const KEY = "ck_063623217dfccbe40985391def51ab913efccdc0b5f03499";

const cases: Array<{
	name: string;
	html: string;
	found: boolean;
	key: string | null;
}> = [
	{
		name: "standard snippet",
		html: `<html><body><script defer src="https://track.northgate.dev/c/v1/custora.js" data-key="${KEY}"></script></body></html>`,
		found: true,
		key: KEY,
	},
	{
		name: "single quotes + attribute order swapped",
		html: `<script data-key='${KEY}' src='https://x.io/c/v1/custora.js' defer></script>`,
		found: true,
		key: KEY,
	},
	{
		name: "multiline / pretty-printed tag",
		html: `<script\n  defer\n  src="http://localhost:3000/c/v1/custora.js"\n  data-key="${KEY}"></script>`,
		found: true,
		key: KEY,
	},
	{
		name: "stale key after rotate",
		html: `<script defer src="https://x.io/c/v1/custora.js" data-key="ck_oldkey123"></script>`,
		found: true,
		key: "ck_oldkey123",
	},
	{
		name: "snippet present but data-key missing",
		html: `<script defer src="https://x.io/c/v1/custora.js"></script>`,
		found: true,
		key: null,
	},
	{
		name: "Next.js <Script afterInteractive> (client-side injected)",
		html: `<html><head><link rel="preload" href="https://track.northgate.dev/c/v1/custora.js" as="script"/></head><body><script>self.__next_f.push([1,"e:[\\"$\\",\\"$L2\\",null,{\\"id\\":\\"custora\\",\\"src\\":\\"https://track.northgate.dev/c/v1/custora.js\\",\\"data-key\\":\\"${KEY}\\",\\"strategy\\":\\"afterInteractive\\"}]"])</script></body></html>`,
		found: true,
		key: KEY,
	},
	{
		name: "preload hint only, no key anywhere",
		html: `<link rel="preload" href="https://x.io/c/v1/custora.js" as="script"/>`,
		found: true,
		key: null,
	},
	{
		name: "unrelated analytics script must not match",
		html: `<script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script>`,
		found: false,
		key: null,
	},
	{
		name: "empty page",
		html: "<html><body></body></html>",
		found: false,
		key: null,
	},
	{
		name: "path mentioned in prose but not a script tag",
		html: "<p>Add /c/v1/custora.js to your site</p>",
		found: false,
		key: null,
	},
];

let failures = 0;
for (const testCase of cases) {
	const result = findSnippet(testCase.html);
	const ok = result.found === testCase.found && result.key === testCase.key;
	if (!ok) failures++;
	console.log(
		`${ok ? "pass" : "FAIL"}  ${testCase.name.padEnd(42)} found=${result.found} key=${result.key ?? "null"}`,
	);
}

console.log(`\n${cases.length - failures}/${cases.length} passed`);
process.exit(failures > 0 ? 1 : 0);
