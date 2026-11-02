// M6 import/export test in real Chromium, with REAL chrome.bookmarks (test build) and real files.
// Needs: npm run build && TN_TEST=1 npx vite build --mode chrome
// NODE_PATH=$(npm root -g) node scripts/e2e-data.mjs <shots-dir>
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? '.';
const work = mkdtempSync(join(tmpdir(), 'tn-data-'));
const SQUARE = resolve('tests/fixtures/square.png'), FIREFOX = resolve('tests/fixtures/firefox-export.html');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
const errors = [];

async function launch(dist) {
  const ext = resolve(dist);
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('chrome://newtab');
  await page.waitForSelector('.empty');
  return { ctx, page };
}
const helpers = (page) => ({
  openData: async () => { await page.getByRole('button', { name: '⇅ Import / Export' }).click(); await page.getByRole('heading', { name: 'Import and export' }).waitFor(); },
  tiles: () => page.locator('.tile-title').allInnerTexts(),
  groups: () => page.locator('.side-row .side-item .truncate').allInnerTexts().then((a) => a.filter((t) => !t.startsWith('#'))),
  summary: () => page.locator('.summary').innerText(),
  importBtn: () => page.locator('dialog[open] .dialog-actions .btn--primary'),
  chooseFile: async (path) => { await page.locator('dialog[open] input[type=file]').setInputFiles(path); },
});

// ============================ Context 1: real Chrome bookmarks, tags, icons, exports ============================
{
  const { ctx, page } = await launch('dist/chrome-test');
  const h = helpers(page);
  await page.evaluate(async () => {
    const c = (o) => chrome.bookmarks.create(o);
    await c({ parentId: '1', title: 'GitHub', url: 'https://github.com/' });
    const w = await c({ parentId: '1', title: 'Work' });
    await c({ parentId: w.id, title: 'Jira', url: 'https://jira.example.com/' });
    const d = await c({ parentId: w.id, title: 'Design' });
    await c({ parentId: d.id, title: 'Figma', url: 'https://figma.com/' });
    await c({ parentId: '1', title: 'Bookmarklet', url: 'javascript:alert(1)' });
    await c({ parentId: '2', title: 'Wikipedia', url: 'https://en.wikipedia.org/' });
    await c({ parentId: '2', title: 'GitHub again', url: 'http://www.github.com' });
  });

  // empty state offers import
  assert(await page.getByRole('button', { name: 'Import bookmarks' }).isVisible(), 'empty state offers "Import bookmarks"');
  await page.getByRole('button', { name: 'Import bookmarks' }).click();
  await page.getByRole('button', { name: 'Import my browser bookmarks' }).click();
  await page.locator('.summary').waitFor();
  assert((await page.locator('dialog[open]').innerText()).includes('Found 5 bookmarks'), 'reads the real browser bookmarks (5 web bookmarks)');
  assert((await page.locator('dialog[open]').innerText()).includes('1 link that is not a web page was skipped'), 'javascript: bookmarklet skipped and reported');
  assert((await h.summary()).includes('4 new bookmarks in 4 new groups') && (await h.summary()).includes('1 already here'), 'duplicate inside the import detected: ' + (await h.summary()).replace(/\s+/g, ' '));
  await page.screenshot({ path: join(shots, '14-import-preview.png') });

  // folder selection: untick "Other bookmarks"
  await page.getByRole('checkbox', { name: /Other bookmarks/ }).uncheck();
  assert((await h.summary()).includes('3 new bookmarks in 3 new groups'), 'unticking a folder updates the plan live');
  await h.importBtn().click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await h.tiles()).sort().join() === 'Figma,GitHub,Jira', 'selected folders imported');
  assert((await h.groups()).join() === 'Bookmarks bar,Bookmarks bar / Work,Bookmarks bar / Work / Design', 'folder structure preserved as groups: ' + (await h.groups()).join(' | '));
  assert(await page.getByText('Imported 3 bookmarks and 3 groups.').isVisible(), 'toast reports what was imported');

  // undo the whole import in one step
  await page.getByRole('button', { name: 'Undo' }).click();
  assert((await h.tiles()).length === 0 && (await h.groups()).length === 0, 'Undo removes the whole import');

  // import everything, then again -> idempotent
  await h.openData();
  await page.getByRole('button', { name: 'Import my browser bookmarks' }).click();
  await page.locator('.summary').waitFor();
  await h.importBtn().click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await h.tiles()).length === 4, 'full import adds 4 (duplicate skipped)');
  await h.openData();
  await page.getByRole('button', { name: 'Import my browser bookmarks' }).click();
  await page.locator('.summary').waitFor();
  assert((await h.summary()).includes('0 new') && await h.importBtn().isDisabled(), 'importing again adds nothing (button disabled)');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');

  // decorate: tags, builtin icon, image icon, dark theme
  const edit = async (title) => { await page.locator('.tile', { hasText: title }).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Edit' }).click(); };
  await edit('Figma');
  for (const t of ['design', 'tools']) { await page.getByLabel('Add a tag').fill(t); await page.getByLabel('Add a tag').press('Enter'); }
  await page.getByRole('tab', { name: 'Built-in' }).click();
  await page.getByRole('radio', { name: 'Star' }).click(); await page.getByRole('radio', { name: 'Violet' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await edit('Jira');
  await page.getByRole('tab', { name: 'Image' }).click();
  await page.locator('dialog input[type=file]').setInputFiles(SQUARE);
  await page.waitForSelector('.cropper-view img');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.tile', { hasText: 'Jira' }).locator('.tile-icon--image img').waitFor();
  await page.getByRole('button', { name: '⚙ Settings' }).click(); await page.getByLabel('Dark', { exact: true }).check(); await page.getByRole('button', { name: 'Done' }).click();

  // exports
  await h.openData();
  const [htmlDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download bookmarks (.html)' }).click()]);
  await htmlDl.saveAs(join(work, 'export.html'));
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup (.json)' }).click()]);
  await jsonDl.saveAs(join(work, 'backup.json'));
  assert(/^tilenest-bookmarks-\d{4}-\d\d-\d\d\.html$/.test(htmlDl.suggestedFilename()) && /^tilenest-backup-\d{4}-\d\d-\d\d\.json$/.test(jsonDl.suggestedFilename()), 'sensible download file names');
  assert((await page.locator('dialog[open]').innerText()).includes('Where is my data?'), 'dialog says where data is stored');
  const html = readFileSync(join(work, 'export.html'), 'utf8'), json = JSON.parse(readFileSync(join(work, 'backup.json'), 'utf8'));
  assert(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>') && html.includes('Bookmarks bar / Work / Design') && html.includes('TAGS="design,tools"'), 'HTML export is Netscape format with folders and tags');
  assert(json.app === 'tilenest' && json.bookmarks.length === 4 && json.images.length === 1 && json.settings.theme === 'dark', 'JSON backup has bookmarks, 1 image, settings');
  await ctx.close();
}

// ============================ Context 2: a fresh profile restores from the files ============================
{
  const { ctx, page } = await launch('dist/chrome');
  const h = helpers(page);

  // bad files -> clear errors
  const bad = { 'garbage.html': 'hello world, no bookmarks here', 'broken.json': '{ not json', 'foreign.json': '{"hello":"world"}',
    'newer.json': JSON.stringify({ app: 'tilenest', schemaVersion: 99, bookmarks: [], groups: [], tags: [] }) };
  const wantErr = { 'garbage.html': /No bookmarks were found/, 'broken.json': /not valid JSON/, 'foreign.json': /not a Tilenest backup/, 'newer.json': /newer version/ };
  await page.getByRole('button', { name: 'Import bookmarks' }).click();
  for (const [name, body] of Object.entries(bad)) {
    writeFileSync(join(work, name), body);
    await h.chooseFile(join(work, name));
    await page.getByRole('alert').filter({ hasText: wantErr[name] }).waitFor({ timeout: 5000 }).then(() => assert(true, `clear error for ${name}`), () => assert(false, `error for ${name}`));
  }

  // Firefox-style export: tags, descriptions, entities, unicode, place: link skipped
  await h.chooseFile(FIREFOX);
  await page.locator('.summary').waitFor();
  assert((await page.locator('dialog[open]').innerText()).includes('1 link that is not a web page was skipped'), 'place: link skipped');
  await h.importBtn().click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await h.tiles()).sort().join() === 'Café menu,Get Involved,Help and Tutorials', 'Firefox-style file imported (unicode ok)');
  assert((await h.groups()).join() === 'Mozilla Firefox,Bookmarks Toolbar', 'groups from folder names: ' + (await h.groups()).join(' | '));
  assert(await page.locator('.side-tag', { hasText: 'firefox' }).count() === 1, 'TAGS attribute became tags');
  assert((await page.locator('.tile', { hasText: 'Help and Tutorials' }).locator('.tile-desc').innerText()) === 'Official & friendly help', 'description imported, entities decoded');

  // Chrome HTML export from context 1
  await h.openData();
  await h.chooseFile(join(work, 'export.html'));
  await page.locator('.summary').waitFor();
  await h.importBtn().click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await h.tiles()).length === 7, 'HTML export from the other profile imported (3 + 4)');
  assert(await page.locator('.side-tag', { hasText: 'design' }).count() === 1, 'tags travel through the HTML file');

  // JSON backup, merge mode: everything already here -> nothing to add (idempotent across formats)
  await h.openData();
  await h.chooseFile(join(work, 'backup.json'));
  await page.locator('.summary').waitFor();
  assert((await h.summary()).includes('0 new') && await h.importBtn().isDisabled(), 'backup merge: all 4 already present, nothing added');

  // JSON backup, replace mode
  await page.getByRole('radio', { name: /Replace everything/ }).check();
  assert((await h.summary()).includes('replaces your 7 current bookmarks with the 4'), 'replace mode explains what will happen');
  await h.importBtn().click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await h.tiles()).sort().join() === 'Figma,GitHub,Jira,Wikipedia', 'replace restored exactly the 4 bookmarks of the backup');
  assert(await page.locator('.tile', { hasText: 'Figma' }).locator('.tile-icon svg').count() === 1, 'built-in icon restored');
  const img = page.locator('.tile', { hasText: 'Jira' }).locator('.tile-icon--image img');
  await img.waitFor();
  assert(await img.evaluate((e) => e.complete && e.naturalWidth === 256), 'uploaded image icon restored and renders');
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'settings restored (dark theme)');
  await page.screenshot({ path: join(shots, '15-restored.png') });
  await page.getByRole('button', { name: 'Undo' }).click();
  assert((await h.tiles()).length === 7, 'Undo brings the previous data back');
  await ctx.close();
}

// ============================ Context 3: scale ============================
{
  const { ctx, page } = await launch('dist/chrome');
  const h = helpers(page);
  let body = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n';
  for (let f = 0; f < 40; f++) {
    body += `<DT><H3>Folder ${f}</H3>\n<DL><p>\n`;
    for (let i = 0; i < 50; i++) body += `<DT><A HREF="https://site${f}-${i}.example.com/page" TAGS="t${i % 7}">Site ${f}-${i}</A>\n`;
    body += '</DL><p>\n';
  }
  writeFileSync(join(work, 'big.html'), body + '</DL><p>\n');
  await page.getByRole('button', { name: 'Import bookmarks' }).click();
  const t0 = Date.now();
  await h.chooseFile(join(work, 'big.html'));
  await page.locator('.summary').waitFor();
  const tParse = Date.now() - t0;
  assert((await h.summary()).includes('2000 new bookmarks in 40 new groups'), `2,000 bookmarks parsed and planned in ${tParse} ms`);
  const t1 = Date.now();
  await h.importBtn().click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.waitForSelector('.tile');
  const tImport = Date.now() - t1;
  assert(tImport < 3000, `imported 2,000 bookmarks and showed the first tiles in ${tImport} ms (under 3 s)`);
  assert((await page.locator('.side-item', { hasText: 'All bookmarks' }).innerText()).includes('2000'), 'sidebar counts 2000 bookmarks');
  assert(await page.locator('.tile').count() < 400, `only tiles near the viewport are mounted (${await page.locator('.tile').count()} of 2000)`);
  await page.locator('.main').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.locator('.tile', { hasText: 'Site 39-49' }).waitFor({ timeout: 5000 }).then(() => assert(true, 'scrolling to the end mounts the last folder'), () => assert(false, 'last folder never mounted'));
  assert(await page.locator('.tile').count() < 400, 'far-away folders unmount again');
  await page.locator('.main').evaluate((el) => { el.scrollTop = 0; });
  const t2 = Date.now();
  await page.getByRole('combobox', { name: 'Search bookmarks' }).fill('site17-4');
  await page.locator('.result').first().waitFor();
  const tSearch = Date.now() - t2;
  assert(tSearch < 1500, `search over 2,000 bookmarks answers in ${tSearch} ms`);
  await page.getByRole('combobox', { name: 'Search bookmarks' }).fill('');
  await page.getByRole('button', { name: 'Undo' }).click().catch(() => {});
  // re-import idempotent at scale
  await h.openData();
  await h.chooseFile(join(work, 'big.html'));
  await page.locator('.summary').waitFor();
  assert((await h.summary()).includes('0 new') || await h.importBtn().isDisabled(), 're-importing the 2,000 adds nothing (or was undone)');
  await ctx.close();
}
console.log('console/page errors:', errors);
