// The ONLY module that touches chrome.* / browser.*. Everything else stays browser-agnostic.
type Ext = { runtime?: { getURL(p: string): string } };
const ext: Ext | undefined =
  (globalThis as unknown as { browser?: Ext }).browser ?? (globalThis as unknown as { chrome?: Ext }).chrome;

/**
 * Local favicon URL. Chrome: served from the browser's own cache via the `_favicon` API (no network).
 * Firefox has no equivalent, so we return null and the UI shows a letter tile until the user picks an image.
 */
export function faviconUrl(pageUrl: string, size = 64): string | null {
  if (__TARGET__ !== 'chrome' || !ext?.runtime) return null;
  const base = ext.runtime.getURL('/_favicon/');
  return `${base}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
}

// ---------------- permissions & bookmarks (optional, requested only when needed) ----------------
type Perms = {
  contains(p: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
  request(p: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
};
type ExtFull = { permissions?: Perms; bookmarks?: { getTree(): Promise<unknown[]> } };
const full = ext as unknown as ExtFull | undefined;

/** Must be called from a click handler (browsers require a user gesture to show the prompt). */
export async function requestBookmarksPermission(): Promise<boolean> {
  if (!full?.permissions) return false;
  const want = { permissions: ['bookmarks'] };
  return await full.permissions.request(want); // no await before this: Firefox only accepts it straight from the click (it answers true when already granted)
}

export async function getBrowserBookmarkTree(): Promise<import('../core/importing').BrowserNode[]> {
  if (!full?.bookmarks) throw new Error('This browser does not expose its bookmarks to extensions.');
  return (await full.bookmarks.getTree()) as import('../core/importing').BrowserNode[];
}

/** Ask for access to one website so an image from it can be downloaded once and stored locally. */
export const IS_WEB = __TARGET__ === 'web';

export async function requestOriginAccess(url: string): Promise<boolean> {
  if (IS_WEB) return true; // a web page talks to its own server: no permission needed
  if (!full?.permissions) return false;
  // host only, no port: match patterns cover every port of the host, and a port in a pattern is not reliable across browsers
  const u = new URL(url);
  const want = { origins: [`${u.protocol}//${u.hostname}/*`] };
  return await full.permissions.request(want); // no await before this: Firefox only accepts it straight from the click (it answers true when already granted)
}

/** Version string from the manifest (falls back gracefully outside an extension, e.g. in tests). */
export function extensionVersion(): string {
  try {
    const r = (ext as unknown as { runtime?: { getManifest?(): { version: string } } } | undefined)?.runtime;
    return `v${r?.getManifest?.().version ?? 'dev'}`;
  } catch { return 'vdev'; }
}

/** Which browser runs this page. Brave and Chrome share one build, so Brave is recognised through its own API. */
export async function detectBrowser(): Promise<import('../core/types').BrowserId> {
  if (__TARGET__ === 'firefox' || /\bFirefox\//.test(navigator.userAgent)) return 'firefox';
  try {
    const brave = (navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } }).brave;
    if (brave?.isBrave && (await brave.isBrave())) return 'brave';
  } catch { /* not Brave */ }
  try {
    const brands = (navigator as unknown as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
    if (brands.some((b) => /brave/i.test(b.brand))) return 'brave';
  } catch { /* ignore */ }
  return 'chrome';
}

/**
 * Pages such as chrome://extensions or about:addons cannot be opened with a normal link from an extension page.
 * Returns false when the browser refuses (the caller then tells the user).
 */
export async function openInternalUrl(url: string, inNewTab = false): Promise<boolean> {
  type Tabs = { create(p: { url: string }): Promise<unknown>; update(p: { url: string }): Promise<unknown> };
  const tabs = (ext as unknown as { tabs?: Tabs } | undefined)?.tabs;
  if (!tabs) return false;
  const tries = [url, ...(url.startsWith('brave://') ? [url.replace('brave://', 'chrome://')] : [])];
  for (const u of tries) {
    try { await (inNewTab ? tabs.create({ url: u }) : tabs.update({ url: u })); return true; } catch { /* try the next form */ }
  }
  return false;
}
