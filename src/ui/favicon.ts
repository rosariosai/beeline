// Chrome's local favicon service answers with a generic globe for sites it has never seen.
// We detect that globe (by comparing pixels with the answer for a site that cannot exist) so the
// tile can show a clean letter tile instead.
import { faviconUrl } from '../browser/api';

const N = 16;
// One shared canvas: creating one per icon was a measurable cost with thousands of bookmarks.
let shared: CanvasRenderingContext2D | null = null;
const sample = (img: HTMLImageElement): Uint8ClampedArray => {
  if (!shared) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    shared = c.getContext('2d', { willReadFrequently: true })!;
  }
  shared.clearRect(0, 0, N, N);
  shared.drawImage(img, 0, 0, N, N);
  return shared.getImageData(0, 0, N, N).data;
};

let reference: Promise<Uint8ClampedArray | null> | null = null;
function getReference(): Promise<Uint8ClampedArray | null> {
  reference ??= new Promise((res) => {
    const url = faviconUrl('https://tilenest-never-visited.invalid/');
    if (!url) return res(null);
    const img = new Image();
    img.onload = () => { try { res(sample(img)); } catch { res(null); } };
    img.onerror = () => res(null);
    img.src = url;
  });
  return reference;
}

/** True when `img` looks like the browser's placeholder rather than a real site icon. */
export async function isPlaceholderFavicon(img: HTMLImageElement): Promise<boolean> {
  const ref = await getReference();
  if (!ref) return false;
  let cur: Uint8ClampedArray;
  try { cur = sample(img); } catch { return false; }
  let diff = 0;
  for (let i = 0; i < cur.length; i++) diff += Math.abs(cur[i] - ref[i]);
  return diff / cur.length < 6; // mean per-channel difference
}
