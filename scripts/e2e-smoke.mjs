// Loads dist/chrome as an unpacked extension in Chromium and exercises M1 flows.
// Needs Playwright (not a project dependency): NODE_PATH=$(npm root -g) node scripts/e2e-smoke.mjs <shots-dir>
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const ext = resolve(process.env.TN_DIST ?? 'dist/chrome');
const shots = process.argv[2] ?? '.';
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1280, height: 800 },
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('chrome://newtab');
await page.waitForTimeout(1500);
console.log('URL after newtab:', page.url());
await page.screenshot({ path: join(shots, '01-empty.png') });

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
const tiles = () => page.locator('.tile-link');
const add = async (url, title, desc) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  if (title) await page.getByLabel('Title').fill(title);
  if (desc) await page.getByLabel(/Short label/).fill(desc);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};

// invalid URL is rejected
await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
await page.getByLabel('Web address').fill('not a url');
await page.getByRole('button', { name: 'Add', exact: true }).click();
assert(await page.getByRole('alert').isVisible(), 'invalid URL shows an error');
await page.keyboard.press('Escape');

await add('github.com', 'GitHub', 'Code');
await add('news.ycombinator.com', '', '');
await add('https://www.wikipedia.org', 'Wikipedia', '');
assert(await tiles().count() === 3, 'three bookmarks added');
assert((await tiles().nth(1).innerText()).match(/news\.ycombinator\.com/) !== null, 'title defaults to hostname');

// group: create + rename
await page.getByRole('button', { name: '+ New group' }).click();
await page.keyboard.type('Work');
await page.keyboard.press('Enter');
assert(await page.getByRole('button', { name: /^Work/ }).isVisible(), 'group created and renamed');
assert(await page.getByText('This group is empty').isVisible(), 'empty group hint');

// add bookmark into the active group (default group = current view)
await add('figma.com', 'Figma', '');
assert(await tiles().count() === 1, 'group view shows only its bookmark');
await page.getByRole('button', { name: /^All bookmarks/ }).click();
assert(await tiles().count() === 4, 'All view shows 4');
await page.screenshot({ path: join(shots, '02-tiles.png') });

// edit via context menu
await page.locator('.tile', { hasText: 'Wikipedia' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.getByLabel('Title').fill('Wikipedia EN');
await page.getByRole('button', { name: 'Save' }).click();
assert(await page.getByText('Wikipedia EN').isVisible(), 'edit saved');

// delete + undo
await page.locator('.tile', { hasText: 'GitHub' }).hover();
await page.getByRole('button', { name: 'Actions for GitHub' }).click();
await page.getByRole('menuitem', { name: 'Delete' }).click();
assert(await tiles().count() === 3, 'bookmark deleted');
await page.getByRole('button', { name: 'Undo' }).click();
assert(await tiles().count() === 4, 'undo restored bookmark');

// delete group keeps bookmarks, undo restores group
await page.locator('.side-row', { hasText: 'Work' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Delete group' }).click();
assert(await page.locator('.side-row', { hasText: 'Work' }).count() === 0, 'group deleted');
assert(await tiles().count() === 4, 'bookmarks kept after group delete');
await page.keyboard.press('Control+z');
assert(await page.locator('.side-row', { hasText: 'Work' }).count() === 1, 'Ctrl+Z restored group');

// persistence across reload
await page.reload();
await page.waitForSelector('.tile-link');
assert(await tiles().count() === 4, 'data persisted after reload');

// dark theme
await page.getByRole('button', { name: '⚙ Settings' }).click();
await page.getByLabel('Dark', { exact: true }).check();
await page.getByRole('button', { name: 'Done' }).click();
assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme applied');
await page.screenshot({ path: join(shots, '03-dark.png') });
await page.reload();
await page.waitForSelector('.tile-link');
assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'theme persisted');

// favicon API request actually resolves to an image element
const imgs = await page.locator('.tile-icon--favicon img').count();
console.log('favicon <img> tiles:', imgs);

console.log('console/page errors:', errors);
await ctx.close();
