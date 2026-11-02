import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyDiff, getBrowserOverride, getDocLinksSeeded, getExtLinksSeeded, getTopSeeded, loadAll, openDb, saveDocLinksSeeded, saveExtLinksSeeded, saveTopSeeded } from '../data/db';
import { diffState, ensureBrowserTopGroups, ensureDocLinks, ensureExtensionLinks, migrateDocLinks, migrateExtensionLinks } from '../core/ops';
import { dedupeTopGroups } from '../core/topgroups';
import { newId } from '../core/id';
import { isInternalUrl } from '../core/url';
import { detectBrowser, openInternalUrl } from '../browser/api';
import { setCurrentBrowser } from '../core/hidden';
import { App } from './App';
import { gcImages, initImages } from './images';
import { StoreProvider } from './store';
import './styles/app.css';

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    const db = await openDb();
    let { state, settings } = await loadAll(db);
    // Once per browser profile: make sure the three per-browser top groups exist (empty is fine). If you delete one later it stays deleted.
    if (!(await getTopSeeded(db).catch(() => true))) {
      const seeded = ensureBrowserTopGroups(state, newId, Date.now());
      if (seeded !== state) { await applyDiff(db, diffState(state, seeded)); state = seeded; }
      await saveTopSeeded(db).catch(() => undefined);
    }
    // Once per profile: the hidden "Personal extensions" links (delete them if you do not want them; they stay deleted).
    if (!(await getExtLinksSeeded(db).catch(() => true))) {
      const seeded = ensureExtensionLinks(state, Date.now());
      if (seeded !== state) { await applyDiff(db, diffState(state, seeded)); state = seeded; }
      await saveExtLinksSeeded(db).catch(() => undefined);
    }
    // Once per profile: the two "Beeline documentation" bookmarks (visible; delete them if you do not want them).
    if (!(await getDocLinksSeeded(db).catch(() => true))) {
      const seeded = ensureDocLinks(state, Date.now());
      if (seeded !== state) { await applyDiff(db, diffState(state, seeded)); state = seeded; }
      await saveDocLinksSeeded(db).catch(() => undefined);
    }
    { const m = migrateDocLinks(state); if (m !== state) { await applyDiff(db, diffState(state, m)); state = m; } }
    // The Firefox link used to open about:addons; an untouched one now opens the debugging page.
    { const m = migrateExtensionLinks(state); if (m !== state) { await applyDiff(db, diffState(state, m)); state = m; } }
    // Links to browser pages (chrome://, about:) are blocked as normal links: open them through the extension API.
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      const href = a?.getAttribute('href');
      if (!a || !href || !isInternalUrl(href) || e.button !== 0) return;
      e.preventDefault();
      void openInternalUrl(href, a.target === '_blank' || e.ctrlKey || e.metaKey);
    }, true);
    // Duplicates left by an earlier sync (the same "Top ..." group made in two browsers) are merged into one.
    const clean = dedupeTopGroups(state);
    if (clean !== state) { await applyDiff(db, diffState(state, clean)); state = clean; }
    const forced = await getBrowserOverride(db).catch(() => undefined);
    const browser = forced === 'chrome' || forced === 'brave' || forced === 'firefox' ? forced : await detectBrowser();
    setCurrentBrowser(browser);
    initImages(db);
    // Icons that no bookmark uses any more (replaced or deleted last session) are cleaned up here.
    void gcImages(Object.values(state.bookmarks).map((b) => b.icon)).catch(() => undefined);
    root.render(
      <StrictMode>
        <StoreProvider db={db} browser={browser} initialData={state} initialSettings={settings}>
          <App />
        </StoreProvider>
      </StrictMode>,
    );
  } catch (e) {
    console.error(e);
    root.render(<p style={{ padding: 24 }}>Could not open local storage. Private/guest windows may block it.</p>);
  }
}
void boot();
