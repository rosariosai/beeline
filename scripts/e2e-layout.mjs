// Empty titles, side-panel toggle, several groups per row. NODE_PATH=$(npm root -g) node scripts/e2e-layout.mjs <shots-dir>
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const axeSource = readFileSync(resolve('node_modules/axe-core/axe.min.js'), 'utf8');
const ext = resolve(process.env.TN_DIST ?? 'dist/chrome');
const shots = process.argv[2] ?? '.';
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium', headless: true, viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
await page.goto('chrome://newtab'); await page.waitForSelector('.topbar');
const add = async (url, title) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  if (title) await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
const openSettings = async () => { await page.getByRole('button', { name: '⚙ Settings' }).click(); await page.getByRole('heading', { name: 'Settings' }).waitFor(); };

// ---- 1) empty titles
await add('https://www.example.com/one', '');
assert(await page.locator('.tile-title').first().innerText() === 'example.com', 'default: empty title becomes the site name');
await openSettings();
await page.getByLabel('When I leave the title empty, use the site name').uncheck();
await page.getByRole('button', { name: 'Done' }).click();
await add('https://www.example.org/two', '');
const tiles = page.locator('.tile');
assert(await tiles.count() === 2, 'two tiles');
const second = tiles.nth(1);
assert(await second.evaluate((e) => e.classList.contains('tile--notitle')), 'flag off: the new tile has no title');
const box = await second.locator('.tile-title').boundingBox();
assert(box && box.width <= 2, 'the empty title takes no visible space (icon only)');
assert(await second.locator('a').getAttribute('title').then((t) => /example\.org/.test(t)), 'hover text still shows the site');
assert(await page.getByRole('button', { name: 'Actions for example.org' }).count() === 1, 'screen readers still get the site name');
await page.screenshot({ path: join(shots, 'notitle.png') });
// editing keeps it empty
await second.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Edit' }).click();
assert(await page.getByLabel('Title').inputValue() === '', 'edit dialog shows an empty title');
await page.getByRole('button', { name: 'Save', exact: true }).click();
assert(await tiles.nth(1).evaluate((e) => e.classList.contains('tile--notitle')), 'saving keeps the title empty');
// compact layout still shows something readable
await page.getByRole('button', { name: '☰ Compact' }).click();
assert((await tiles.nth(1).locator('.tile-title').innerText()) === 'example.org', 'compact rows fall back to the site name');
await page.getByRole('button', { name: '▦ Tiles' }).click();

// ---- 2) side panel toggle
assert(await page.locator('.sidebar').isVisible(), 'side panel visible at first');
await page.getByRole('button', { name: 'Hide the side panel' }).click();
assert(!(await page.locator('.sidebar').isVisible()), 'side panel hidden by the toggle');
const mainX = await page.locator('#main').evaluate((e) => e.getBoundingClientRect().left);
assert(mainX < 10, 'bookmarks use the full width: ' + Math.round(mainX));
await page.reload(); await page.waitForSelector('.topbar');
assert(!(await page.locator('.sidebar').isVisible()), 'choice is remembered after reload');
assert(await page.getByRole('button', { name: 'Show the side panel' }).getAttribute('aria-expanded') === 'false', 'toggle reports aria-expanded=false');
await page.getByRole('button', { name: 'Show the side panel' }).click();
assert(await page.locator('.sidebar').isVisible(), 'side panel back');

// ---- 3) groups side by side
for (const g of ['Work', 'Play', 'Study']) {
  await page.getByRole('button', { name: /New group/ }).click();
  await page.keyboard.type(g); await page.keyboard.press('Enter');
  for (let i = 1; i <= 3; i++) await add(`https://${g.toLowerCase()}${i}.example.com/`, `${g} ${i}`);
}
await page.getByRole('button', { name: /All bookmarks/ }).click();
await page.waitForTimeout(300);
const tops = () => page.locator('.section').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
let t = await tops();
assert(new Set(t.map((x) => x[0])).size === 1, 'one group per row by default (same left edge)');
await page.getByRole('button', { name: '▥ Columns' }).click();
await page.waitForTimeout(200);
t = await tops();
assert(new Set(t.map((x) => x[0])).size >= 2, 'groups sit side by side: ' + JSON.stringify(t));
await page.screenshot({ path: join(shots, 'side-by-side.png') });
await page.reload(); await page.waitForSelector('.topbar'); await page.waitForTimeout(300);
t = await tops();
assert(new Set(t.map((x) => x[0])).size >= 2, 'side-by-side is remembered');
// single group view uses full width
await page.getByRole('button', { name: /^Work/ }).first().click();
assert(await page.locator('.sections--many').count() === 0, 'a single group is not squeezed into a column');
// Settings radio reflects state
await openSettings();
assert(await page.getByLabel('Several side by side, as many as fit').isChecked(), 'Settings shows the same choice');
await page.getByRole('button', { name: 'Done' }).click();
// accessibility
await page.evaluate(axeSource);
const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(';')}`));
assert(v.length === 0, 'axe: ' + v.join('|'));
assert(errors.length === 0, 'no console errors ' + errors.join('|'));
await ctx.close();
