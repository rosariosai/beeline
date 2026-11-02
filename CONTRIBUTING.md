# Contributing to Beeline

Thanks for helping. Beeline is a small local-first extension; please keep it that way.

## Ground rules
- **No network calls, tracking or analytics.** A new permission needs a clear reason in the pull request.
- Keep logic pure and testable: put it in `src/core` with a test in `tests/`. UI goes in `src/ui`, browser APIs in `src/browser`.
- Works in Chrome, Brave and Firefox. If a feature cannot work in one of them, say so in the UI and in the docs.
- Keep the wording plain: short sentences, no jargon in the interface.

## Set up
    npm install
    npm run typecheck && npm test && npm run build

Load `dist/chrome` (or `dist/firefox`) as described in the README, then `npm run dev` to rebuild on change and reload the extension.

## Pull requests
1. One change per pull request, with a short description of what and why.
2. `npm run typecheck` and `npm test` must pass (CI runs them, plus the build).
3. Add or update a test for new behaviour, and a line in `docs/CHANGELOG.md` for anything users can see.
4. Screenshots help for UI changes (light and dark).

## Reporting bugs
Use the bug template and include the Beeline version, browser, and whether Sync or an import was involved. Do not attach backups with private bookmarks.

## Optional end-to-end tests
`scripts/e2e-*.mjs` drive a real Chromium with Playwright (`npm i -D playwright`, then `npx playwright install chromium`). They need `npm run build` first. They are not part of CI.

By contributing you agree that your work is released under the MIT licence.
