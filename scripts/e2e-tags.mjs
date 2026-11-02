// M3 tags test in real Chromium. NODE_PATH=$(npm root -g) node scripts/e2e-tags.mjs <shots-dir>
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
await page.goto('chrome://newtab');
await page.waitForSelector('.empty');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };

const add = async (url, title, tags) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
  for (const t of tags) { await page.getByLabel('Add a tag').fill(t); await page.getByLabel('Add a tag').press('Enter'); }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
const titles = () => page.locator('.tile-title').allInnerTexts();
const sideTags = () => page.locator('.side-tag .truncate').allInnerTexts();
const side = (name) => page.locator('.side-row', { hasText: `# ${name}` });
const tile = (t) => page.locator('.tile', { hasText: t });

await add('a.com', 'Alpha', ['Design', 'tools']);
await add('b.com', 'Bravo', ['design', 'News']);   // 'design' must reuse 'Design'
await add('c.com', 'Charlie', []);
await add('d.com', 'Delta', ['x1', 'x2', 'x3', 'x4']);

assert((await sideTags()).join() === '# Design,# News,# tools,# x1,# x2,# x3,# x4', 'tags created once each, sorted, case-insensitive reuse');
assert((await side('Design').innerText()).includes('2'), 'Design used by 2 bookmarks');
assert(await tile('Alpha').getByText('Design', { exact: true }).isVisible(), 'chips visible on the tile');
assert((await tile('Delta').locator('.tag-more').innerText()) === '+2', 'extra tags collapse to "+2"');
assert(await tile('Charlie').locator('.tile-tags').count() === 0, 'untagged tile has no chip row');
await page.screenshot({ path: join(shots, '06-tags.png') });

// filter from sidebar (AND)
await side('Design').locator('.side-tag').click();
assert((await titles()).join() === 'Alpha,Bravo', 'filter Design -> 2 tiles');
assert(await page.getByRole('region', { name: 'Active tag filters' }).isVisible(), 'filter bar shown');
await side('tools').locator('.side-tag').click();
assert((await titles()).join() === 'Alpha', 'Design + tools narrows (AND) to 1');
await side('News').locator('.side-tag').click();
assert(await page.getByText('No bookmarks have all of these tags').isVisible(), 'empty result message');
await page.getByRole('button', { name: 'Clear filters' }).click();
assert((await titles()).length === 4, 'Clear filters shows all');

// filter by clicking a chip on a tile
await tile('Bravo').getByRole('button', { name: 'News' }).click();
assert((await titles()).join() === 'Bravo', 'clicking a tile chip filters');
await page.getByRole('button', { name: 'Remove filter News' }).click();
assert((await titles()).length === 4, 'removing the filter chip resets');

// edit: remove a tag, add a new one; persisted
await tile('Alpha').click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.getByRole('button', { name: 'Remove tag tools' }).click();
await page.getByLabel('Add a tag').fill('#Work, ');   // comma commits, '#' stripped
await page.getByRole('button', { name: 'Save' }).click();
assert((await side('tools').innerText()).includes('0'), 'tools now unused (count 0, tag kept)');
assert(await side('Work').count() === 1, 'new tag Work created ("#" stripped, comma commits)');

// rename
await side('Work').click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Rename tag' }).click();
await page.keyboard.press('Control+a'); await page.keyboard.type('Job'); await page.keyboard.press('Enter');
assert(await tile('Alpha').getByText('Job', { exact: true }).isVisible(), 'rename reflected on tiles');

// rename onto an existing name merges
await side('Job').click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Rename tag' }).click();
await page.keyboard.press('Control+a'); await page.keyboard.type('news'); await page.keyboard.press('Enter');
assert((await sideTags()).filter((t) => /news|job/i.test(t)).join() === '# News', 'renaming to an existing tag merges them');
assert((await side('News').innerText()).includes('2'), 'merged tag counts both bookmarks');

// delete + undo
await side('News').click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Delete tag' }).click();
assert(await side('News').count() === 0, 'tag deleted');
assert(await tile('Bravo').getByText('News', { exact: true }).count() === 0, 'removed from bookmarks');
await page.getByRole('button', { name: 'Undo' }).click();
assert(await side('News').count() === 1 && await tile('Bravo').getByText('News', { exact: true }).isVisible(), 'undo restores tag and assignments');

// persistence + keyboard (Enter in tag field must not submit the dialog)
await page.reload(); await page.waitForSelector('.tile');
assert((await side('Design').innerText()).includes('2'), 'tags persisted after reload');
await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
await page.getByLabel('Web address').fill('e.com');
await page.getByLabel('Add a tag').fill('keyb'); await page.getByLabel('Add a tag').press('Enter');
assert(await page.locator('dialog[open]').count() === 1, 'Enter in tag field adds a chip, does not submit');
assert(await page.getByRole('button', { name: 'Remove tag keyb' }).isVisible(), 'chip added with Enter');
await page.keyboard.press('Escape');

// filtering + drag still coherent: sections hide when empty
await side('Design').locator('.side-tag').click();
assert((await page.locator('section').count()) === 1, 'only sections with matches are shown while filtering');
await page.screenshot({ path: join(shots, '07-filtered.png') });
console.log('console/page errors:', errors);
await ctx.close();
