// Compact layout + hide. NODE_PATH=$(npm root -g) node scripts/e2e-hide.mjs <shots-dir>
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const axeSource = readFileSync(resolve('node_modules/axe-core/axe.min.js'), 'utf8');
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
await page.goto('chrome://newtab');
await page.waitForSelector('.topbar');
const add = async (url, title) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
for (const g of ['Work', 'Summer']) {
  await page.getByRole('button', { name: /New group/ }).click();
  await page.keyboard.type(g); await page.keyboard.press('Enter');
}
await add('https://example.com/a', 'Alpha');          // in Summer (active group)
await page.getByRole('button', { name: /^Work/ }).click();
await add('https://example.org/b', 'Beta');
await add('https://example.net/c', 'Gamma');
await page.getByRole('button', { name: /All bookmarks/ }).click();
await page.waitForTimeout(300);
const tiles = () => page.locator('.tile').count();
assert(await tiles() === 3, '3 tiles shown');

// section background differs from page background
const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.section')).backgroundColor);
assert(bg !== 'rgba(0, 0, 0, 0)', 'group section has a background colour: ' + bg);
await page.screenshot({ path: join(shots, 'tiles.png') });

// compact layout
await page.getByRole('button', { name: '☰ Compact' }).click();
await page.waitForTimeout(200);
assert(await page.evaluate(() => document.documentElement.dataset.layout) === 'compact', 'layout=compact');
const h = await page.locator('.tile').first().evaluate((e) => e.getBoundingClientRect().height);
assert(h < 50, 'compact row is short: ' + Math.round(h));
await page.screenshot({ path: join(shots, 'compact.png') });
await page.reload(); await page.waitForSelector('.topbar');
assert(await page.evaluate(() => document.documentElement.dataset.layout) === 'compact', 'compact survives reload');

// hide one bookmark
await page.getByRole('link', { name: 'Beta' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Hide for 1 month' }).click();
await page.waitForTimeout(200);
assert(await tiles() === 2, 'hidden bookmark disappears');
assert(await page.getByRole('button', { name: /Hidden \(1\)/ }).count() === 1, 'Hidden (1) toggle appears');
// search does not find it
await page.getByRole('combobox').fill('Beta'); await page.waitForTimeout(200);
assert(await page.locator('[role=option]').count() === 0, 'search skips hidden');
await page.getByRole('combobox').fill('');
// show hidden
await page.getByRole('button', { name: /Hidden \(1\)/ }).click();
assert(await tiles() === 3 && await page.locator('.tile--hidden').count() === 1, 'show hidden: dimmed tile back');
await page.screenshot({ path: join(shots, 'hidden-shown.png') });
await page.evaluate(axeSource);
const av = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map((x) => `${x.id}: ${x.nodes.slice(0,3).map((n) => n.target.join(' ')).join(';')}`));
assert(av.length === 0, 'axe: compact + hidden shown ' + av.join('|'));
await page.getByRole('link', { name: /Beta/ }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Unhide' }).click();
await page.waitForTimeout(200);
assert(await page.locator('.tile--hidden').count() === 0, 'unhidden');
await page.getByRole('button', { name: /Hidden/ }).click(); // toggle off (still visible? count 0 + showHidden true)
await page.waitForTimeout(200);

// hide a whole group via sidebar
await page.getByRole('button', { name: 'Actions for group Summer' }).click({ force: true });
await page.getByRole('menuitem', { name: 'Hide group until I unhide it' }).click();
await page.waitForTimeout(200);
assert(await tiles() === 2, 'hidden group hides its bookmark');
assert(await page.locator('.side-item', { hasText: 'Summer' }).count() === 0, 'hidden group leaves the sidebar');
await page.getByRole('button', { name: /Hidden \(2\)/ }).click();
assert(await page.locator('.side-item', { hasText: 'Summer' }).count() === 1, 'group visible again when shown');
await page.getByRole('button', { name: 'Actions for group Summer' }).click({ force: true });
await page.getByRole('menuitem', { name: 'Unhide group' }).click();
await page.waitForTimeout(200);
assert(await tiles() === 3, 'group unhidden, 3 tiles');
// hide from the Edit dialog (make sure hidden items are not being shown first)
if (await page.getByRole('button', { name: /Hidden/ }).count()) { const b = page.getByRole('button', { name: /Hidden/ }); if (await b.getAttribute('aria-pressed') === 'true') await b.click(); }
await page.waitForTimeout(200);
await page.getByRole('link', { name: 'Gamma' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.getByLabel('Visibility').selectOption('forever');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(200);
assert(await tiles() === 2, 'hidden from the Edit dialog (Visibility)');
await page.getByRole('button', { name: /Hidden \(1\)/ }).click();
assert(await tiles() === 3, 'hidden item can be shown again');
await page.getByRole('link', { name: /Gamma/ }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Unhide' }).click();
// hide a group from its heading button
await page.getByRole('button', { name: 'Hide or show group Work' }).click();
await page.getByRole('menuitem', { name: 'Hide group for 1 week' }).click();
await page.waitForTimeout(200);
assert(await page.locator('.section--hidden').count() === 1, 'group hidden from its heading button');
await page.getByRole('button', { name: 'Hide or show group Work' }).click();
await page.getByRole('menuitem', { name: 'Unhide group' }).click();
await page.waitForTimeout(200);
assert(await page.locator('.section--hidden').count() === 0, 'group unhidden from its heading button');
await page.screenshot({ path: join(shots, 'hide-buttons.png') });
assert(errors.length === 0, 'no console errors ' + errors.join('|'));
await ctx.close();
