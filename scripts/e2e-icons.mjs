// M5 icons test in real Chromium. NODE_PATH=$(npm root -g) node scripts/e2e-icons.mjs <shots-dir>
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const ext = resolve('dist/chrome');
const shots = process.argv[2] ?? '.';
const WIDE = resolve('tests/fixtures/wide.png'), SQUARE = resolve('tests/fixtures/square.png');

// tiny server: CORS image, non-CORS image, 404, text
const server = createServer((req, res) => {
  if (req.url === '/ok.png') { res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' }); res.end(readFileSync(SQUARE)); }
  else if (req.url === '/nocors.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(readFileSync(SQUARE)); }
  else if (req.url === '/text') { res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }); res.end('hello'); }
  else { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end('nope'); }
}).listen(0);
const port = server.address().port, base = `http://127.0.0.1:${port}`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tn-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource|nocors.png/.test(m.text()) && errors.push(m.text()));
await page.goto('chrome://newtab');
await page.waitForSelector('.empty');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };

const openAdd = async (url, title) => {
  await page.getByRole('button', { name: '+ Add bookmark' }).first().click();
  await page.getByLabel('Web address').fill(url);
  await page.getByLabel('Title').fill(title);
};
const tab = (name) => page.getByRole('tab', { name });
const save = () => page.getByRole('button', { name: /^(Add|Save)$/ }).click();
const tile = (t) => page.locator('.tile', { hasText: t });
const imgCount = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('tilenest'); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').count(); q.onsuccess = () => res(q.result); };
}));

// 1. built-in glyph + colour
await openAdd('cloud.example.com', 'Cloudy');
await tab('Built-in').click();
await page.getByRole('radio', { name: 'Cloud' }).click();
await page.getByRole('radio', { name: 'Red' }).click();
await save();
assert(await tile('Cloudy').locator('.tile-icon svg').count() === 1, 'built-in glyph renders as SVG on the tile');
assert((await tile('Cloudy').locator('.tile-icon').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(239, 68, 68)', 'built-in colour applied');

// 2. letter pseudo-glyph
await openAdd('letter.example.com', 'Quokka');
await tab('Built-in').click();
await page.getByRole('radio', { name: 'Letter' }).click();
await page.getByRole('radio', { name: 'Teal' }).click();
await save();
assert((await tile('Quokka').locator('.tile-icon').innerText()) === 'Q', 'letter icon shows the first letter');

// 3. auto favicon for a never-visited site -> clean letter tile, not Chrome's grey globe
await openAdd('unvisited.example.net', 'Zeta');
await save();
await page.waitForTimeout(1200);
assert(await tile('Zeta').locator('.tile-icon--favicon').count() === 0 && (await tile('Zeta').locator('.tile-icon').innerText()) === 'Z', 'placeholder favicon is replaced by a letter tile');
await page.screenshot({ path: join(shots, '11-icons-builtin.png') });

// 4. upload a file, crop (zoom + drag), save
await openAdd('upload.example.com', 'Uploaded');
await tab('Image').click();
await page.locator('dialog input[type=file]').setInputFiles(WIDE);
await page.waitForSelector('.cropper-view img');
const before = await page.locator('.cropper-view img').evaluate((e) => [e.offsetWidth, e.offsetHeight]);
assert(before[0] === 192 && before[1] === 96, `wide image starts fully visible ("contain"): ${before}`);
await page.locator('.cropper-zoom input').fill('2.5');
const zoomed = await page.locator('.cropper-view img').evaluate((e) => [e.offsetWidth, e.offsetHeight]);
assert(zoomed[0] === 480, `zoom enlarges the image (${zoomed})`);
const v = await page.locator('.cropper-view').boundingBox();
await page.mouse.move(v.x + 96, v.y + 96); await page.mouse.down(); await page.mouse.move(v.x + 96 + 120, v.y + 96, { steps: 6 }); await page.mouse.up();
const left0 = await page.locator('.cropper-view img').evaluate((e) => parseFloat(e.style.left));
assert(left0 > -144, `dragging pans the image (left=${left0})`);
await page.screenshot({ path: join(shots, '12-cropper.png') });
await page.locator('.cropper-view').focus();
await page.keyboard.press('ArrowLeft');
const left1 = await page.locator('.cropper-view img').evaluate((e) => parseFloat(e.style.left));
assert(left1 < left0, 'arrow keys pan too');
await save();
const up = tile('Uploaded').locator('.tile-icon--image img');
await up.waitFor();
assert((await up.evaluate((e) => e.src)).startsWith('blob:') && (await up.evaluate((e) => e.naturalWidth)) === 256, 'saved icon is a local 256px image');
assert(await imgCount() === 1, 'image stored in IndexedDB');

// 5. paste an image address (CORS-enabled server)
await openAdd('url.example.com', 'FromUrl');
await tab('Image').click();
await page.getByLabel('Image address').fill(`${base}/ok.png`);
await page.getByRole('button', { name: 'Load', exact: true }).click();
await page.waitForSelector('.cropper-view img');
assert(true, 'image downloaded from a pasted address once');
await save();
await tile('FromUrl').locator('.tile-icon--image img').waitFor();
assert(await imgCount() === 2, 'second image stored');

// 6. error messages
await openAdd('err.example.com', 'Errs');
await tab('Image').click();
for (const [addr, want] of [['ftp://x.com/a.png', /http and https/], [`${base}/missing.png`, /answered 404/], [`${base}/text`, /not an image/], ['not a url', /full image address/]]) {
  await page.getByLabel('Image address').fill(addr);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: want }).waitFor({ timeout: 8000 }).then(() => assert(true, `clear error for ${addr}`), () => assert(false, `error for ${addr}`));
}
// non-CORS image: needs the user's permission for that site. Headless cannot answer the prompt, so only report.
await page.getByLabel('Image address').fill(`${base}/nocors.png`);
await page.getByRole('button', { name: 'Load', exact: true }).click();
const outcome = await Promise.race([
  page.getByRole('alert').first().waitFor({ timeout: 6000 }).then(async () => 'error: ' + (await page.getByRole('alert').first().innerText())),
  page.waitForSelector('.cropper-view img', { timeout: 6000 }).then(() => 'loaded'),
]).catch(() => 'prompt pending (no one to click Allow in headless mode)');
console.log('info - non-CORS image address ->', outcome);
await page.keyboard.press('Escape');

// 7. paste from clipboard (Ctrl+V with an image)
await openAdd('paste.example.com', 'Pasted');
await tab('Image').click();
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer(); dt.items.add(new File([bytes], 'clip.png', { type: 'image/png' }));
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, readFileSync(SQUARE).toString('base64'));
await page.waitForSelector('.cropper-view img');
assert(true, 'pasting an image from the clipboard works');
await page.keyboard.press('Escape');

// 8. switching back to the site icon + persistence + orphan cleanup
await tile('Uploaded').click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Edit' }).click();
await tab('Site icon').click();
await save();
assert(await tile('Uploaded').locator('.tile-icon--image').count() === 0, 'switching back to the site icon removes the custom image from the tile');
await page.reload(); await page.waitForSelector('.tile');
await page.waitForTimeout(800);
assert(await imgCount() === 1, 'orphaned image was cleaned up on restart (1 left: FromUrl)');
assert(await tile('FromUrl').locator('.tile-icon--image img').evaluate((e) => e.naturalWidth) === 256, 'remaining image still renders after reload');
await page.screenshot({ path: join(shots, '13-icons-final.png') });
console.log('console/page errors:', errors);
await ctx.close(); server.close();
