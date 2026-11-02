// Copy the browser's local site icons into Beeline as stored images, so they travel in backups and sync files and
// show in browsers that have no local icon cache (Firefox). Nothing is downloaded from the internet: the icons come
// from the browser's own favicon cache (Chrome and Brave only).
import type { Bookmark, DataState } from '../core/types';
import { faviconUrl } from '../browser/api';
import { hostnameOf } from '../core/url';
import { isPlaceholderFavicon } from './favicon';
import { saveImageBlob } from './images';

export const canSaveFavicons = () => faviconUrl('https://example.com/') !== null;

async function iconBlob(pageUrl: string): Promise<Blob | null> {
  const src = faviconUrl(pageUrl, 64);
  if (!src) return null;
  const img = new Image();
  const ok = await new Promise<boolean>((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = src; });
  if (!ok || !img.naturalWidth) return null;
  if (await isPlaceholderFavicon(img)) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  c.getContext('2d')!.drawImage(img, 0, 0, 64, 64);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

export interface FaviconResult { saved: number; missing: number; map: Map<string, string> }

/** Returns bookmark id -> new image id for every automatic-icon bookmark whose icon could be copied. */
export async function collectFavicons(data: DataState, onProgress?: (done: number, total: number) => void): Promise<FaviconResult> {
  const todo = Object.values(data.bookmarks).filter((b) => b.icon.kind === 'auto');
  const byHost = new Map<string, Promise<string | null>>(); // one stored image per site
  const map = new Map<string, string>();
  let done = 0, missing = 0, next = 0;
  const one = async (b: Bookmark) => {
    const host = hostnameOf(b.url) || b.url;
    if (!byHost.has(host)) byHost.set(host, iconBlob(b.url).then((blob) => (blob ? saveImageBlob(blob) : null)).catch(() => null));
    const id = await byHost.get(host)!;
    if (id) map.set(b.id, id); else missing++;
    onProgress?.(++done, todo.length);
  };
  await Promise.all(Array.from({ length: 6 }, async () => { while (next < todo.length) await one(todo[next++]); }));
  return { saved: map.size, missing, map };
}
