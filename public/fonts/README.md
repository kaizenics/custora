# TwemojiCountryFlags.woff2

Country-flag glyphs, vendored so location rows show a flag on Windows.

Windows ships no flag emoji — Segoe UI Emoji renders 🇪🇸 as the letters "ES"
instead of a flag. This font supplies the glyphs, scoped by `unicode-range` to
the regional-indicator block so it affects nothing else on the page.

Vendored rather than installed because the only thing needed is this one file;
the npm package around it adds a runtime that fetches the same font from a CDN,
which a self-hosted deployment should not depend on.

- Font build: [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) — MIT, © 2022 TalkJS
- Artwork: [Twemoji](https://github.com/twitter/twemoji) — CC-BY 4.0
