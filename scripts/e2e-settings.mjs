// M7: settings. NODE_PATH=$(npm root -g) node scripts/e2e-settings.mjs <shots-dir>
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const ext = resolve(process.env.TN_DIST ?? 'dist/chrome');
const shots = process.argv[2] ?? '.';
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
const html = (k) => page.evaluate((k) => document.documentElement.dataset[k], k);
const css = (v) => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
const openSettings = async () => { await page.getByRole('button', { name: '⚙ Settings' }).click(); await page.getByRole('heading', { name: 'Settings' }).waitFor(); };
const done = () => page.getByRole('button', { name: 'Done' }).click();
const reload = async () => { await page.reload(); await page.waitForSelector('.topbar'); await page.waitForTimeout(300); };

await page.goto('chrome://newtab');
await page.waitForSelector('.topbar');
const add = async (url, title, group) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
// two groups with a bookmark each
for (const g of ['Work', 'Play']) {
  await page.getByRole('button', { name: /New group/ }).click();
  await page.keyboard.type(g); await page.keyboard.press('Enter');
}
await add('https://example.com/a', 'Alpha');
await add('https://example.org/b', 'Beta');

// default settings + focus
await page.waitForTimeout(300);
await reload();
assert(await page.evaluate(() => document.activeElement?.getAttribute('role')) === 'combobox', 'search focused by default');

// dialog opens, Esc closes and focus returns to the Settings button
await openSettings();
await page.keyboard.press('Escape');
await page.waitForSelector('dialog', { state: 'detached' });
assert(await page.evaluate(() => document.activeElement?.textContent) === '⚙ Settings', 'Esc closes and focus returns to Settings button');

// theme
await openSettings();
await page.getByLabel('Light', { exact: true }).check();
assert(await html('theme') === 'light', 'light theme applied');
await page.getByLabel('Dark', { exact: true }).check();
assert(await html('theme') === 'dark', 'dark theme applied');
await page.screenshot({ path: join(shots, 'settings-dark.png') });

// tile size
const w = async () => (await page.locator('.tile').first().boundingBox()).width;
await page.getByLabel('Small', { exact: true }).check();
const ws = await w();
await page.getByLabel('Large', { exact: true }).check();
const wl = await w();
assert(await css('--tile-w') === '210px', 'large tile width variable');
assert(wl > ws, `large tiles (${Math.round(wl)}px) wider than small (${Math.round(ws)}px)`);

// density
const gap = async () => css('--gap');
await page.getByLabel('Compact', { exact: true }).check();
assert(await gap() === '10px' && await html('density') === 'compact', 'compact density applied');
const hCompact = (await page.locator('.tile').first().boundingBox()).height;
await page.getByLabel('Comfortable', { exact: true }).check();
const hComf = (await page.locator('.tile').first().boundingBox()).height;
assert(hCompact < hComf, `compact tiles shorter (${Math.round(hCompact)} < ${Math.round(hComf)})`);

// open-in + focus + start view
await page.getByLabel('A new tab', { exact: true }).check();
await page.getByLabel(/Put the cursor in the search box/).uncheck();
await page.getByLabel('Where I left off', { exact: true }).check();
await page.getByLabel('Small', { exact: true }).check();
await page.getByLabel('Compact', { exact: true }).check();
await done();
assert(await page.locator('.tile-link').first().getAttribute('target') === '_blank', 'tiles open in new tab');
await page.locator('.tile-link').first().focus();

// remember last group
await page.locator('.sidebar').getByRole('button', { name: /Work/ }).first().click();
await page.waitForTimeout(300);

// persistence
await reload();
assert(await html('theme') === 'dark', 'theme persisted after reload');
assert(await html('tile') === 's' && await html('density') === 'compact', 'size and density persisted');
assert(await page.evaluate(() => document.activeElement?.getAttribute('role')) !== 'combobox', 'search NOT auto-focused when disabled');
await openSettings();
assert(await page.getByLabel('A new tab', { exact: true }).isChecked(), 'open-in-new-tab persisted');
assert(!(await page.getByLabel(/Put the cursor in the search box/).isChecked()), 'focus-search=off persisted');
await done();
assert(await page.locator('.section-title').count() === 1, 'start view = last group (one section)');
assert((await page.locator('.section-title').first().innerText()).startsWith('Work'), 'it is the Work group');
await page.screenshot({ path: join(shots, 'settings-small-compact.png') });

// back to "All bookmarks"
await openSettings();
await page.getByLabel('All bookmarks', { exact: true }).check();
await done();
await page.waitForTimeout(300);
await reload();
assert(await page.locator('.sidebar [aria-current=page]').innerText().then((t) => t.startsWith('All bookmarks')), 'start view = all');

// import/export reachable from settings
await openSettings();
await page.getByRole('button', { name: 'Import / Export…' }).click();
await page.getByRole('heading', { name: 'Import and export' }).waitFor();
assert(true, 'Import / Export opens from Settings');

assert(errors.length === 0, 'no console errors ' + errors.join('|'));
await ctx.close();
