// Makes 1280x800 store screenshots with sample data. NODE_PATH=$(npm root -g) node scripts/store-shots.mjs <out-dir>
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.'; mkdirSync(out, { recursive: true });
const ext = resolve('dist/chrome');
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const page = await ctx.newPage();
await page.goto('chrome://newtab'); await page.waitForSelector('.topbar');
const group = async (n) => { await page.getByRole('button', { name: /New group/ }).click(); await page.keyboard.type(n); await page.keyboard.press('Enter'); };
const add = async (url, title, g, tags = []) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url); await page.getByLabel('Title').fill(title);
  if (g) await page.locator('dialog label', { hasText: 'Group' }).locator('select').selectOption({ label: g });
  for (const t of tags) { await page.getByLabel('Add a tag').fill(t); await page.getByLabel('Add a tag').press('Enter'); }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
await group('Work'); await group('Reading'); await group('Fun');
const W = [['https://mail.example.com', 'Mail', ['daily']], ['https://calendar.example.com', 'Calendar', ['daily']], ['https://docs.example.com', 'Docs', ['writing']], ['https://tasks.example.com', 'Tasks', ['daily']], ['https://design.example.com', 'Design board', ['design']], ['https://code.example.com', 'Code', ['dev']]];
for (const [u, t, g] of W) await add(u, t, 'Work', g);
for (const [u, t, g] of [['https://news.example.org', 'Daily news', ['daily']], ['https://longreads.example.org', 'Long reads', ['writing']], ['https://papers.example.org', 'Papers', ['dev']], ['https://recipes.example.org', 'Recipes', []]]) await add(u, t, 'Reading', g);
for (const [u, t] of [['https://music.example.net', 'Music'], ['https://video.example.net', 'Video'], ['https://games.example.net', 'Games']]) await add(u, t, 'Fun');
const theme = async (t) => { await page.getByRole('button', { name: '⚙ Settings' }).click(); await page.getByLabel(t, { exact: true }).check(); await page.getByRole('button', { name: 'Done' }).click(); await page.mouse.move(1000, 8); };
await page.locator('.sidebar').getByRole('button', { name: /^All bookmarks/ }).click();
await theme('Light'); await page.screenshot({ path: join(out, '1-dashboard-light.png') });
await theme('Dark'); await page.screenshot({ path: join(out, '2-dashboard-dark.png') });
await page.locator('.side-tag').first().click(); await page.screenshot({ path: join(out, '3-tag-filter-dark.png') });
await page.getByRole('button', { name: 'Clear filters' }).click();
await page.getByRole('combobox').fill('da'); await page.waitForSelector('.result'); await page.screenshot({ path: join(out, '4-search-dark.png') });
await page.getByRole('combobox').fill('');
await page.getByRole('button', { name: '⚙ Settings' }).click(); await page.screenshot({ path: join(out, '5-settings-dark.png') });
await ctx.close();
