/** Normalises user input to an http(s) URL, or returns null if it is not a usable web address. */
/** Pages that belong to the browser itself (extensions page, add-ons manager, settings...). */
const INTERNAL = /^(chrome|brave|edge|vivaldi|opera|about):/i;
export const isInternalUrl = (u: string): boolean => INTERNAL.test(u.trim());

export function normalizeUrl(input: string, allowInternal = true): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  if (isInternalUrl(raw)) return !allowInternal ? null : /^about:[^/]/i.test(raw) || /^[a-z]+:\/\/[^/]+/i.test(raw) ? raw : null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/** What to call a bookmark in menus, messages and screen readers when its title is empty. */
export const bookmarkLabel = (b: { title: string; url: string }): string => b.title.trim() || hostnameOf(b.url);
