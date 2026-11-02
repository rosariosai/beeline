import { useEffect, useRef, useState } from 'react';
import type { IconSpec } from '../../core/types';
import { GLYPHS, ICON_COLORS, ICON_COLOR_NAMES, LETTER_GLYPH } from '../../core/icons';
import { cropRect, fetchImageBlob, loadImageFromBlob, renderCrop, saveImageBlob, type Crop, type LoadedImage } from '../images';
import { Cropper } from './Cropper';
import { GlyphSvg, TileIcon } from './TileIcon';

export type IconDraft =
  | { kind: 'auto' }
  | { kind: 'builtin'; glyph: string; color: string }
  | { kind: 'image'; imageId?: string; pending?: { image: LoadedImage; crop: Crop } };

export const draftFromIcon = (i: IconSpec): IconDraft =>
  i.kind === 'image' ? { kind: 'image', imageId: i.imageId } : i.kind === 'builtin' ? { ...i } : { kind: 'auto' };

/** Turn the editor state into a stored icon (cropping and saving a new image if needed). */
export async function resolveIcon(d: IconDraft): Promise<IconSpec> {
  if (d.kind === 'auto') return { kind: 'auto' };
  if (d.kind === 'builtin') return { kind: 'builtin', glyph: d.glyph, color: d.color };
  if (d.pending) return { kind: 'image', imageId: await saveImageBlob(await renderCrop(d.pending.image, d.pending.crop)) };
  return d.imageId ? { kind: 'image', imageId: d.imageId } : { kind: 'auto' };
}

/** Live thumbnail of exactly what will be saved. */
function CropPreview({ image, crop }: { image: LoadedImage; crop: Crop }) {
  const r = cropRect(image.w, image.h, crop);
  return (
    <span className="tile-icon tile-icon--image" aria-hidden style={{ position: 'relative' }}>
      <img src={image.src} alt="" style={{ position: 'absolute', maxWidth: 'none', objectFit: 'fill', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
    </span>
  );
}

const TABS = [['auto', 'Site icon'], ['image', 'Image'], ['builtin', 'Built-in']] as const;

export function IconEditor(props: { url: string; title: string; value: IconDraft; onChange(v: IconDraft): void }) {
  const { value, onChange } = props;
  const [urlText, setUrlText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const last = useRef<{ builtin: IconDraft & { kind: 'builtin' } }>({ builtin: { kind: 'builtin', glyph: 'star', color: ICON_COLORS[0] } });
  if (value.kind === 'builtin') last.current.builtin = value;

  const takeBlob = async (blob: Blob) => {
    setBusy(true); setError('');
    try {
      const image = await loadImageFromBlob(blob);
      onChange({ kind: 'image', imageId: value.kind === 'image' ? value.imageId : undefined, pending: { image, crop: { zoom: 1, ox: 0, oy: 0 } } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load that image.'); }
    finally { setBusy(false); }
  };

  // Ctrl+V with an image on the clipboard
  useEffect(() => {
    if (value.kind !== 'image') return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); void takeBlob(f); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const fromUrl = async () => {
    setBusy(true); setError('');
    try { await takeBlob(await fetchImageBlob(urlText)); setUrlText(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not download that image.'); setBusy(false); }
  };

  const setTab = (k: 'auto' | 'image' | 'builtin') => {
    setError('');
    if (k === 'auto') onChange({ kind: 'auto' });
    else if (k === 'builtin') onChange(last.current.builtin);
    else onChange(value.kind === 'image' ? value : { kind: 'image' });
  };

  const previewIcon: IconSpec = value.kind === 'image' ? (value.imageId ? { kind: 'image', imageId: value.imageId } : { kind: 'auto' }) : value.kind === 'builtin' ? value : { kind: 'auto' };

  return (
    <fieldset className="iconeditor">
      <legend className="field-label">Icon</legend>
      <div className="iconeditor-head">
        <div className="iconeditor-preview" style={{ ['--icon' as string]: '64px' }}>
          {value.kind === 'image' && value.pending
            ? <CropPreview image={value.pending.image} crop={value.pending.crop} />
            : <TileIcon bookmark={{ url: props.url || 'https://example.com', title: props.title, icon: previewIcon }} />}
        </div>
        <div className="tabs" role="tablist" aria-label="Icon type">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={value.kind === k} className={`tab${value.kind === k ? ' tab--on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      {value.kind === 'auto' && <p className="hint">Uses the website's own icon from your browser. If the browser has none yet, a coloured letter is shown.</p>}

      {value.kind === 'image' && (
        <div className="iconeditor-panel">
          {value.pending ? (
            <Cropper image={value.pending.image} crop={value.pending.crop}
              onChange={(crop) => onChange({ ...value, pending: { image: value.pending!.image, crop } })} />
          ) : (
            <div className="dropzone dropzone--file"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void takeBlob(f); }}>
              <p>{value.imageId ? 'Your image is set. Drop, paste or choose another to replace it.' : 'Drop an image here, paste one with Ctrl+V, or'}</p>
              <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>Choose file…</button>
              <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose an image file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeBlob(f); e.target.value = ''; }} />
            </div>
          )}
          {value.pending && (
            <button type="button" className="btn btn--sm" onClick={() => onChange({ kind: 'image', imageId: value.imageId })}>Choose a different image</button>
          )}
          {!value.pending && (
            <div className="urlrow">
              <input value={urlText} onChange={(e) => setUrlText(e.target.value)} placeholder="…or paste an image address (https://…)" aria-label="Image address"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (urlText.trim()) void fromUrl(); } }} />
              <button type="button" className="btn" disabled={busy || !urlText.trim()} onClick={() => void fromUrl()}>{busy ? 'Loading…' : 'Load'}</button>
            </div>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
          <p className="hint">The image is copied into this browser, so it keeps working offline.</p>
        </div>
      )}

      {value.kind === 'builtin' && (
        <div className="iconeditor-panel">
          <div className="glyphs" role="radiogroup" aria-label="Icon shape">
            <button type="button" role="radio" aria-checked={value.glyph === LETTER_GLYPH} aria-label="Letter" title="Letter"
              className={`glyph${value.glyph === LETTER_GLYPH ? ' glyph--on' : ''}`} onClick={() => onChange({ ...value, glyph: LETTER_GLYPH })}>Aa</button>
            {Object.entries(GLYPHS).map(([id, g]) => (
              <button key={id} type="button" role="radio" aria-checked={value.glyph === id} aria-label={g.label} title={g.label}
                className={`glyph${value.glyph === id ? ' glyph--on' : ''}`} onClick={() => onChange({ ...value, glyph: id })}><GlyphSvg glyph={id} /></button>
            ))}
          </div>
          <div className="swatches" role="radiogroup" aria-label="Icon colour">
            {ICON_COLORS.map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={value.color === c} aria-label={ICON_COLOR_NAMES[i]} title={ICON_COLOR_NAMES[i]}
                className={`swatch${value.color === c ? ' swatch--on' : ''}`} style={{ background: c }} onClick={() => onChange({ ...value, color: c })} />
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}
