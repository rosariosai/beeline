// M2 drag-and-drop test in real Chromium. NODE_PATH=$(npm root -g) node scripts/e2e-dnd.mjs <shots-dir>
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
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const navigations = [];
page.on('request', (r) => r.isNavigationRequest() && !r.url().startsWith('chrome-extension') && navigations.push(r.url()));
await page.goto('chrome://newtab');
await page.waitForSelector('.empty');

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
const add = async (url, title) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
const titles = (scope = '') => page.locator(`${scope} .tile-title`).allInnerTexts();
const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const drag = async (from, to, { dx = 0, dy = 0 } = {}) => {
  const a = await center(from), b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 10, { steps: 3 });
  await page.mouse.move(b.x + dx, b.y + dy, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(350);
};
const tile = (t) => page.locator('.tile', { hasText: t });
const sideRow = (t) => page.locator('.side-row', { hasText: t });

for (const [u, t] of [['a.com', 'Alpha'], ['b.com', 'Bravo'], ['c.com', 'Charlie'], ['d.com', 'Delta']]) await add(u, t);
assert((await titles()).join() === 'Alpha,Bravo,Charlie,Delta', 'seeded 4 ungrouped bookmarks');

// 1. reorder within a section: Delta -> before Alpha
await drag(tile('Delta'), tile('Alpha'), { dx: -30 });
assert((await titles()).join() === 'Delta,Alpha,Bravo,Charlie', 'drag Delta to the front');
assert(navigations.length === 0, 'dragging did not navigate');

// 2. forward move: Delta -> after Charlie
await drag(tile('Delta'), tile('Charlie'), { dx: 30 });
assert((await titles()).join() === 'Alpha,Bravo,Charlie,Delta', 'drag Delta back to the end');

// 3. plain click still opens the site
await tile('Bravo').locator('a').click();
await page.waitForTimeout(500);
assert(navigations.some((u) => new URL(u).hostname === 'b.com'), 'plain click still navigates');
await page.goto('chrome://newtab');
await page.waitForSelector('.tile');

// 4. groups + drop on sidebar
for (const n of ['Work', 'Play']) {
  await page.getByRole('button', { name: '+ New group' }).click();
  await page.keyboard.type(n); await page.keyboard.press('Enter');
}
await page.getByRole('button', { name: /^All bookmarks/ }).click();
await drag(tile('Bravo'), sideRow('Work'));
await page.screenshot({ path: join(shots, '04-after-sidebar-drop.png') });
assert((await sideRow('Work').innerText()).includes('1'), 'dropping a tile on the sidebar group moves it (Work = 1)');
assert((await titles('section[aria-label="Work"]')).join() === 'Bravo', 'Bravo now in the Work section');

// 5. drag into another section, between tiles
await drag(tile('Charlie'), tile('Bravo'), { dx: -20 });
assert((await titles('section[aria-label="Work"]')).join() === 'Charlie,Bravo', 'cross-section drop inserts before target tile');
assert((await titles('section[aria-label="Ungrouped"]')).join() === 'Alpha,Delta', 'source section closed the gap');

// 6. drag back to Ungrouped through the sidebar drop zone
const bravo = tile('Bravo');
const a = await center(bravo);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 12, a.y + 12, { steps: 3 });
const zone = page.locator('.side-drop');
assert(await zone.isVisible(), '"Drop here to ungroup" zone appears while dragging');
const z = await center(zone);
await page.mouse.move(z.x, z.y, { steps: 12 }); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(350);
assert((await titles('section[aria-label="Ungrouped"]')).includes('Bravo'), 'dropped on the ungroup zone');

// 7. reorder groups in the sidebar
const groupNames = () => page.locator('.side-row .side-item .truncate').allInnerTexts();
assert((await groupNames()).join() === 'Work,Play', 'groups start as Work, Play');
await drag(sideRow('Play'), sideRow('Work'), { dy: -8 });
assert((await groupNames()).join() === 'Play,Work', 'dragging a group reorders groups');

// 8. keyboard drag: focus Alpha, Space, ArrowRight, Space
const before = await titles('section[aria-label="Ungrouped"]');
await tile('Alpha').locator('a').focus();
await page.keyboard.press('Space'); await page.waitForTimeout(150);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
await page.keyboard.press('Space'); await page.waitForTimeout(400);
const after = await titles('section[aria-label="Ungrouped"]');
assert(before.join() !== after.join(), `keyboard drag changed order (${before} -> ${after})`);
const nav2 = navigations.length;
await tile('Delta').locator('a').focus();
await page.keyboard.press('Escape');

// 9. persistence
const snapshot = async () => JSON.stringify([await groupNames(), await titles('section[aria-label="Ungrouped"]'), await titles('section[aria-label="Work"]')]);
const s1 = await snapshot();
await page.reload(); await page.waitForSelector('.tile');
assert((await snapshot()) === s1, 'order and groups persisted after reload');
await page.screenshot({ path: join(shots, '05-final.png') });
console.log('navigations:', navigations.length, '(extra after keyboard test:', navigations.length - nav2, ')');
console.log('console/page errors:', errors);
await ctx.close();
