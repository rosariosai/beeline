import { useEffect, useRef } from 'react';
import { MAX_ZOOM, MIN_ZOOM, cropRect, type Crop, type LoadedImage } from '../images';

const V = 192; // viewport size in px
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Drag to move, slider / mouse wheel / + - keys to zoom, arrow keys to move.
 * Zoom 1 shows the whole image; zoom in to select just the part you want. The rounded square is the tile icon.
 */
export function Cropper(props: { image: LoadedImage; crop: Crop; onChange(c: Crop): void }) {
  const { image, crop, onChange } = props;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const live = useRef(crop);
  live.current = crop;
  const r = cropRect(image.w, image.h, crop);

  const set = (c: Partial<Crop>) => {
    const next = { ...live.current, ...c };
    next.zoom = clamp(next.zoom, MIN_ZOOM, MAX_ZOOM);
    next.ox = clamp(next.ox, -1, 1);
    next.oy = clamp(next.oy, -1, 1);
    onChange(next);
  };

  // wheel needs a non-passive listener to stop the dialog from scrolling
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); set({ zoom: live.current.zoom * (1 - e.deltaY * 0.002) }); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  return (
    <div className="cropper">
      <div ref={box} className="cropper-view" style={{ width: V, height: V }} tabIndex={0} role="group"
        aria-label="Icon position. Drag or use the arrow keys to move the image, plus and minus to zoom."
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = (e.clientX - drag.current.x) / V, dy = (e.clientY - drag.current.y) / V;
          drag.current = { x: e.clientX, y: e.clientY };
          set({ ox: live.current.ox + dx, oy: live.current.oy + dy });
        }}
        onPointerUp={() => { drag.current = null; }}
        onKeyDown={(e) => {
          const step = 0.04;
          const map: Record<string, Partial<Crop>> = {
            ArrowLeft: { ox: crop.ox - step }, ArrowRight: { ox: crop.ox + step },
            ArrowUp: { oy: crop.oy - step }, ArrowDown: { oy: crop.oy + step },
            '+': { zoom: crop.zoom * 1.1 }, '=': { zoom: crop.zoom * 1.1 }, '-': { zoom: crop.zoom / 1.1 },
          };
          if (map[e.key]) { e.preventDefault(); set(map[e.key]); }
        }}>
        <img src={image.src} alt="" draggable={false}
          style={{ left: r.x * V, top: r.y * V, width: r.w * V, height: r.h * V }} />
      </div>
      <label className="cropper-zoom">Zoom
        <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={crop.zoom}
          onChange={(e) => set({ zoom: Number(e.target.value) })} />
      </label>
      <button type="button" className="btn btn--sm" onClick={() => onChange({ zoom: 1, ox: 0, oy: 0 })}>Reset</button>
    </div>
  );
}
