// "Tag all" by group name. NODE_PATH=$(npm root -g) node scripts/e2e-taggroup.mjs
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const ext = resolve(process.env.TN_DIST ?? 'dist/chrome');
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
await page.goto('chrome://newtab'); await page.waitForSelector('.topbar');
const add = async (url, title) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url); await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
for (const g of ['News', 'Cloud BK']) { await page.getByRole('button', { name: /New group/ }).click(); await page.keyboard.type(g); await page.keyboard.press('Enter'); }
await add('https://example.com/a', 'Alpha');
await page.getByRole('button', { name: /^News/ }).click();
await add('https://example.org/b', 'Beta'); await add('https://example.net/c', 'Gamma');
await page.getByRole('button', { name: /All bookmarks/ }).click();
await page.getByRole('button', { name: /Tag all bookmarks in News/ }).click();
await page.getByText(/Tagged 2 bookmarks/).waitFor();
assert(await page.locator('.sidebar').getByText('news').count() > 0, 'tag "news" exists (lowercase)');
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(300);
assert(await page.locator('.sidebar').getByText('news', { exact: true }).count() === 0, 'undo removes the tag');
await page.getByRole('button', { name: /Tag all groups/ }).click();
await page.getByText(/Tagged 3 bookmarks, 2 new tags/).waitFor();
assert(await page.locator('.sidebar').getByText('cloud bk').count() > 0, 'tag "cloud bk" exists');
await page.getByRole('button', { name: /Tag all groups/ }).click();
await page.getByText(/Nothing to tag/).waitFor();
assert(true, 'second run does nothing');
assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
await ctx.close();
