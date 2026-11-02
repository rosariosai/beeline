// M4 search test in real Chromium. NODE_PATH=$(npm root -g) node scripts/e2e-search.mjs <shots-dir>
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
// External sites are stubbed so "open the bookmark" can be verified offline.
await ctx.route(/^https?:\/\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>stub' }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
await page.goto('chrome://newtab');
await page.waitForSelector('.empty');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };

const newGroup = async (n) => { await page.getByRole('button', { name: '+ New group' }).click(); await page.keyboard.type(n); await page.keyboard.press('Enter'); };
const add = async (url, title, { tags = [], group = '', desc = '' } = {}) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
  if (desc) await page.getByLabel(/Short label/).fill(desc);
  if (group) await page.locator('dialog label', { hasText: 'Group' }).locator('select').selectOption({ label: group });
  for (const t of tags) { await page.getByLabel('Add a tag').fill(t); await page.getByLabel('Add a tag').press('Enter'); }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
await newGroup('Work'); await newGroup('Léisure');
await page.getByRole('button', { name: /^All bookmarks/ }).click();
await add('figma.com', 'Figma', { group: 'Work', tags: ['design', 'tools'] });
await add('github.com', 'GitHub', { group: 'Work', tags: ['code'] });
await add('dribbble.com', 'Dribbble', { group: 'Léisure', tags: ['Design'] });
await add('cafe.example.org/menu', 'Café Müller', { group: 'Léisure', desc: 'best espresso in town' });
await add('news.ycombinator.com', 'Hacker News', { tags: ['news', 'code'] });

const box = page.getByRole('combobox', { name: 'Search bookmarks' });
const rows = () => page.locator('.result');
const titles = () => page.locator('.result-title').allInnerTexts();

// focus shortcuts
await page.locator('.main').click({ position: { x: 600, y: 600 } });
await page.keyboard.press('/');
assert(await box.evaluate((el) => el === document.activeElement), '"/" focuses the search box');
assert(await box.inputValue() === '', '"/" is not typed into the box');
await page.locator('.main').click({ position: { x: 600, y: 600 } });
await page.keyboard.press('Control+k');
assert(await box.evaluate((el) => el === document.activeElement), 'Ctrl+K focuses the search box');

// basic search + ranking
await box.fill('design');
assert(await rows().count() === 2, '"design" -> 2 results (tag matches)');
assert(await page.getByRole('listbox', { name: 'Search results' }).isVisible(), 'results listbox is shown');
assert((await rows().first().getAttribute('aria-selected')) === 'true', 'first result preselected');
assert(await page.locator('.dashboard-sections, section.section').count() === 0, 'dashboard sections hidden while searching');
await page.screenshot({ path: join(shots, '09-search.png') });

// arrow keys + aria-activedescendant
await box.press('ArrowDown');
assert((await rows().nth(1).getAttribute('aria-selected')) === 'true', 'ArrowDown moves selection');
const activeId = await box.getAttribute('aria-activedescendant');
assert(activeId === (await rows().nth(1).getAttribute('id')), 'aria-activedescendant tracks selection');
await box.press('ArrowDown');
assert((await rows().nth(1).getAttribute('aria-selected')) === 'true', 'selection stops at the last result');
await box.press('ArrowUp'); await box.press('ArrowUp');
assert((await rows().first().getAttribute('aria-selected')) === 'true', 'ArrowUp stops at the first result');

// matching on every field
const q = async (text) => { await box.fill(text); return (await titles()).join('|'); };
assert((await q('ycombinator')) === 'Hacker News', 'matches URL host');
assert((await q('muller')) === 'Café Müller', 'accent-insensitive: muller -> Müller');
assert((await q('cafe')) === 'Café Müller', 'accent-insensitive: cafe -> Café');
assert((await q('espresso')) === 'Café Müller', 'matches short label');
assert(await page.locator('.result mark').count() > 0, 'matched text is highlighted');
assert((await q('leisure')).split('|').sort().join() === 'Café Müller,Dribbble', 'matches group name (accent-insensitive)');
assert((await q('#code')).split('|').sort().join() === 'GitHub,Hacker News', '#code searches tags only');
assert((await q('work design')) === 'Figma', 'multiple words must all match');
assert((await q('zzzz')) === '' && await page.getByText('No bookmarks match').isVisible(), 'no-results message');

// Escape: clear, then blur
await box.fill('figma');
await box.press('Escape');
assert(await box.inputValue() === '' && await page.locator('section.section').count() >= 1, 'Escape clears search and restores the dashboard');
await box.press('Escape');
assert(await box.evaluate((el) => el !== document.activeElement), 'second Escape leaves the box');

// "/" does not hijack typing in dialogs
await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
await page.getByLabel('Web address').fill('example.com');
await page.getByLabel('Web address').press('/');
assert((await page.getByLabel('Web address').inputValue()) === 'example.com/', '"/" types normally inside a dialog field');
await page.keyboard.press('Escape');

// sidebar navigation leaves search; tag filter combines with search
await box.fill('o');
await page.locator('.side-row', { hasText: 'Work' }).locator('.side-item').click();
assert(await box.inputValue() === '', 'choosing a group clears the search');
await page.locator('.side-row', { hasText: '# code' }).locator('.side-tag').click();
await box.fill('hub');
assert((await titles()).join() === 'GitHub', 'search respects the active tag filter');
await page.getByRole('button', { name: 'Clear filters' }).click();

// Enter opens the selected result (same tab); mouse hover selects; click opens
await box.fill('dribbble');
await box.press('Enter');
await page.waitForURL('https://dribbble.com/');
assert(true, 'Enter opens the selected bookmark');
await page.goto('chrome://newtab'); await page.waitForSelector('.tile');
await box.fill('design');
await rows().nth(1).hover();
assert((await rows().nth(1).getAttribute('aria-selected')) === 'true', 'hover moves selection');
const [popup] = await Promise.all([ctx.waitForEvent('page'), box.press('Control+Enter')]);
await popup.waitForLoadState();
assert(/figma|dribbble/.test(popup.url()), 'Ctrl+Enter opens in a new tab (' + popup.url() + ')');
await page.screenshot({ path: join(shots, '10-search-after.png') });
console.log('console/page errors:', errors);
await ctx.close();
