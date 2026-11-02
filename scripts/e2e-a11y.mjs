// M7: accessibility audit with axe-core + keyboard/focus checks.
// NODE_PATH=$(npm root -g) node scripts/e2e-a11y.mjs <shots-dir>
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSource = readFileSync(resolve('node_modules/axe-core/axe.min.js'), 'utf8');

const ext = resolve(process.env.TN_DIST ?? 'dist/chrome');
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };

const audit = async (label) => {
  await page.evaluate(axeSource);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.failureSummary ?? '').slice(0, 140)) }));
  });
  assert(r.length === 0, `axe: ${label} - ${r.length} violation(s)`);
  for (const v of r) console.error('   ', v.impact, v.id, '-', v.help, '\n      ', v.nodes.join('\n       '));
};

await page.goto('chrome://newtab');
await page.waitForSelector('.topbar');

const setTheme = async (t) => {
  await page.getByRole('button', { name: '⚙ Settings' }).click();
  await page.getByLabel(t, { exact: true }).check();
  await page.getByRole('button', { name: 'Done' }).click();
};

for (const theme of ['Light', 'Dark']) {
  await setTheme(theme);
  await audit(`${theme}: empty state`);
}
await setTheme('Light');

// content
const add = async (url, title, tags, group) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
  if (tags) { await page.getByLabel('Add a tag').fill(tags); await page.getByLabel('Add a tag').press('Enter'); }
  if (group) await page.locator('dialog label', { hasText: 'Group' }).locator('select').selectOption({ label: group });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
};
await page.getByRole('button', { name: /New group/ }).click();
await page.keyboard.type('Work'); await page.keyboard.press('Enter');
await add('https://example.com/a', 'Alpha docs', 'docs', 'Work');
await add('https://example.org/b', 'Beta tool', 'tools');
await add('https://example.net/c', 'Gamma');

for (const theme of ['Light', 'Dark']) {
  await setTheme(theme);
  await page.mouse.move(0, 0);
  await audit(`${theme}: dashboard with groups and tags`);
  // tag filter active
  await page.locator('.side-tag').first().click();
  await audit(`${theme}: tag filter active`);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  // search results
  await page.getByRole('combobox').fill('alpha');
  await page.waitForSelector('.result');
  await audit(`${theme}: search results`);
  await page.getByRole('combobox').fill('');
  // dialogs
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill('https://x.test');
  await audit(`${theme}: add bookmark dialog`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '⚙ Settings' }).click();
  await audit(`${theme}: settings dialog`);
  await page.getByRole('button', { name: 'Import / Export…' }).click();
  await page.getByRole('heading', { name: 'Import and export' }).waitFor();
  await audit(`${theme}: import/export dialog`);
  await page.keyboard.press('Escape');
  // context menu
  await page.locator('.tile').first().click({ button: 'right' });
  await page.waitForSelector('.ctxmenu');
  await audit(`${theme}: context menu`);
  await page.keyboard.press('Escape');
}

// keyboard / focus behaviour
await page.reload(); await page.waitForSelector('.topbar');
// skip link is the first focusable element in the document
assert(await page.evaluate(() => document.querySelector('a[href], button, input, select, [tabindex="0"]')?.classList.contains('skip-link')), 'skip link is first in tab order');
await page.locator('.skip-link').focus();
const box = await page.locator('.skip-link').boundingBox();
assert(box && box.y >= 0, 'skip link becomes visible on focus');
await page.keyboard.press('Enter');
assert(await page.evaluate(() => document.activeElement?.id) === 'main', 'skip link moves focus to the bookmarks area');

// context menu Esc restores focus to the tile menu button
await page.locator('.tile').first().hover();
await page.locator('.tile-menu-btn').first().focus();
await page.keyboard.press('Enter');
await page.waitForSelector('.ctxmenu');
await page.keyboard.press('Escape');
assert(await page.evaluate(() => document.activeElement?.classList.contains('tile-menu-btn')), 'Esc in menu returns focus to its button');
// menu button visible when its tile has keyboard focus
await page.locator('.tile-link').first().focus();
const op = await page.locator('.tile-menu-btn').first().evaluate((el) => getComputedStyle(el).opacity);
assert(op === '1', 'tile menu button visible when tile link is focused');

// minimum target size 24px for interactive controls
const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select')]
  .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).visibility !== 'hidden' && (r.width < 24 || r.height < 24) && !(e instanceof HTMLInputElement && (e.type === 'radio' || e.type === 'checkbox')); })
  .map((e) => e.outerHTML.slice(0, 80)));
assert(small.length === 0, 'all visible controls are at least 24x24 px ' + small.join(' | '));

// narrow window: no horizontal scroll
await page.setViewportSize({ width: 360, height: 740 });
await page.waitForTimeout(200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert(overflow <= 0, `no horizontal scroll at 360px (overflow ${overflow}px)`);
await page.screenshot({ path: join(process.argv[2] ?? '.', 'narrow-360.png') });
await page.setViewportSize({ width: 1280, height: 800 });

// reduced motion
await page.emulateMedia({ reducedMotion: 'reduce' });
const dur = await page.locator('.tile').first().evaluate((el) => getComputedStyle(el).transitionDuration);
assert(dur === '0s', 'reduced motion disables transitions (' + dur + ')');

assert(errors.length === 0, 'no console errors ' + errors.join('|'));
await ctx.close();
