// Local icon images: storage, loading, cropping. Images are copied into IndexedDB once and shown from
// there. Nothing is ever loaded from a remote address when the dashboard renders.
import { useEffect, useState } from 'react';
import type { ExportImage } from '../core/exporting';
import { deleteImages, getAllImages, getImage, listImageIds, putImage, type Db } from '../data/db';
import { newId } from '../core/id';
import { requestOriginAccess } from '../browser/api';
import type { IconSpec } from '../core/types';

let db: Db | null = null;
export const initImages = (d: Db) => { db = d; };
const need = (): Db => { if (!db) throw new Error('images not initialised'); return db; };

const urls = new Map<string, Promise<string | null>>();
export function imageUrl(id: string): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = getImage(need(), id).then((rec) => (rec ? URL.createObjectURL(rec.blob) : null));
    urls.set(id, p);
  }
  return p;
}

export function useImageUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (id) void imageUrl(id).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [id]);
  return url;
}

export async function saveImageBlob(blob: Blob): Promise<string> {
  const id = newId();
  await putImage(need(), { id, blob, mime: blob.type || 'image/png' });
  return id;
}

/** Remove stored images no bookmark refers to. Run once at startup (undo only lives within a session). */
export async function gcImages(icons: IconSpec[]): Promise<number> {
  const used = new Set(icons.flatMap((i) => (i.kind === 'image' ? [i.imageId] : [])));
  const orphans = (await listImageIds(need())).filter((id) => !used.has(id));
  if (orphans.length) await deleteImages(need(), orphans);
  return orphans.length;
}

// ---- backup helpers ----
const toDataUrl = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

export async function exportAllImages(): Promise<ExportImage[]> {
  const recs = await getAllImages(need());
  return Promise.all(recs.map(async (r) => ({ id: r.id, mime: r.mime, dataUrl: await toDataUrl(r.blob) })));
}

export async function importImages(list: ExportImage[]): Promise<void> {
  for (const i of list) {
    const blob = await (await fetch(i.dataUrl)).blob();
    await putImage(need(), { id: i.id, blob, mime: i.mime });
    urls.delete(i.id);
  }
}

// ---- loading + cropping ----
export interface LoadedImage { img: HTMLImageElement; src: string; w: number; h: number }

export async function loadImageFromBlob(blob: Blob): Promise<LoadedImage> {
  if (!/^image\//.test(blob.type)) throw new Error('That file is not an image.');
  if (blob.size > 15 * 1024 * 1024) throw new Error('That image is larger than 15 MB.');
  const src = URL.createObjectURL(blob);
  const img = new Image();
  img.src = src;
  try { await img.decode(); } catch { URL.revokeObjectURL(src); throw new Error('That image could not be read.'); }
  // SVGs without a size report 0: give them a sensible one.
  return { img, src, w: img.naturalWidth || 256, h: img.naturalHeight || 256 };
}

/** Download an image once. Needs the site's CORS approval, or the user's permission for that site. */
export async function fetchImageBlob(url: string): Promise<Blob> {
  let u: URL;
  try { u = new URL(url.trim()); } catch { throw new Error('Enter a full image address, starting with https://'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https addresses are supported.');
  const attempt = async () => {
    const r = await fetch(u.toString(), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`The site answered ${r.status}.`);
    const b = await r.blob();
    if (!/^image\//.test(b.type)) throw new Error('That address is not an image.');
    return b;
  };
  try {
    return await attempt();
  } catch (first) {
    if (first instanceof Error && /answered|not an image/.test(first.message)) throw first;
    // Blocked by the browser (no CORS): ask once for permission to read from that site, then retry.
    const granted = await requestOriginAccess(u.toString()).catch(() => false);
    if (!granted) throw new Error(`That site does not allow downloading its image directly. Allow access to ${u.hostname} when asked, or save the image and use "Choose file".`);
    return attempt();
  }
}

export interface Crop { zoom: number; ox: number; oy: number }
export const MIN_ZOOM = 1, MAX_ZOOM = 5;

/** Geometry shared by the on-screen cropper and the final render. Units: fraction of the square viewport. */
export function cropRect(w: number, h: number, c: Crop) {
  const s = Math.min(1 / w, 1 / h) * c.zoom; // zoom 1 = whole image visible ("contain")
  const dw = w * s, dh = h * s;
  return { x: 0.5 + c.ox - dw / 2, y: 0.5 + c.oy - dh / 2, w: dw, h: dh };
}

export function renderCrop(l: LoadedImage, c: Crop, size = 256): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const r = cropRect(l.w, l.h, c);
  ctx.drawImage(l.img, r.x * size, r.y * size, r.w * size, r.h * size);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the image.'))), 'image/png'));
}
