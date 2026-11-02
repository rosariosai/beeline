import { memo, useState } from 'react';
import type { Bookmark } from '../../core/types';
import { hostnameOf } from '../../core/url';
import { faviconUrl } from '../../browser/api';
import { GLYPHS, LETTER_GLYPH } from '../../core/icons';
import { useImageUrl } from '../images';
import { isPlaceholderFavicon } from '../favicon';

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const colorFor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export function GlyphSvg({ glyph }: { glyph: string }) {
  const g = GLYPHS[glyph];
  if (!g) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden dangerouslySetInnerHTML={{ __html: g.svg }} />
  );
}

type IconBookmark = Pick<Bookmark, 'url' | 'title' | 'icon'>;

export const TileIcon = memo(function TileIcon({ bookmark }: { bookmark: IconBookmark }) {
  const [failed, setFailed] = useState(false);
  const icon = bookmark.icon;
  const imageUrl = useImageUrl(icon.kind === 'image' ? icon.imageId : undefined);
  const host = hostnameOf(bookmark.url);
  const letter = (bookmark.title || host).trim().charAt(0).toUpperCase() || '?';

  if (icon.kind === 'builtin') {
    return (
      <span className="tile-icon" style={{ background: icon.color }} aria-hidden>
        {icon.glyph === LETTER_GLYPH || !GLYPHS[icon.glyph] ? letter : <GlyphSvg glyph={icon.glyph} />}
      </span>
    );
  }
  if (icon.kind === 'image' && imageUrl) {
    return <span className="tile-icon tile-icon--image" aria-hidden><img src={imageUrl} alt="" /></span>;
  }
  const src = icon.kind === 'auto' && !failed ? faviconUrl(bookmark.url) : null;
  if (src) {
    return (
      <span className="tile-icon tile-icon--favicon" aria-hidden>
        <img src={src} alt="" width={56} height={56} loading="lazy" onError={() => setFailed(true)}
          onLoad={(e) => { const img = e.currentTarget; void isPlaceholderFavicon(img).then((p) => p && setFailed(true)); }} />
      </span>
    );
  }
  return <span className="tile-icon" style={{ background: colorFor(host) }} aria-hidden>{letter}</span>;
});
