import { forwardRef, memo, type CSSProperties, type HTMLAttributes } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Bookmark, Tag } from '../../core/types';
import { TileIcon } from './TileIcon';
import { bookmarkLabel } from '../../core/url';

type MenuPos = { x: number; y: number };

/** Presentational tile. Also used (without handlers) inside the DragOverlay. */
export const TileView = forwardRef<HTMLDivElement, {
  bookmark: Bookmark;
  onMenu?(p: MenuPos): void;
  linkProps?: HTMLAttributes<HTMLAnchorElement> & { ref?: (el: HTMLElement | null) => void };
  tags?: Tag[];
  activeTagIds?: string[];
  onTag?(id: string): void;
  newTab?: boolean;
  onOpen?(id: string): void;
  overlay?: boolean;
  dragging?: boolean;
  hidden?: boolean;
  num?: number;
  style?: CSSProperties;
}>(function TileView({ bookmark: b, onMenu, linkProps, tags = [], activeTagIds = [], onTag, newTab, onOpen, overlay, dragging, hidden, num, style }, ref) {
  return (
    <div ref={ref} style={style} className={`tile${dragging ? ' tile--ghost' : ''}${overlay ? ' tile--overlay' : ''}${hidden ? ' tile--hidden' : ''}${b.preferred ? ' tile--preferred' : ''}${b.title.trim() ? '' : ' tile--notitle'}`}
      onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); } : undefined}>
      <a className="tile-link" href={b.url} title={b.description ? `${bookmarkLabel(b)} — ${b.description}\n${b.url}` : `${bookmarkLabel(b)}\n${b.url}`} draggable={false} onClick={onOpen ? () => onOpen(b.id) : undefined} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})} {...linkProps}>
        <TileIcon bookmark={b} />
        <span className={`tile-title${b.title.trim() ? '' : ' tile-title--auto'}`}>{bookmarkLabel(b)}</span>{hidden && <span className="tile-badge">hidden</span>}
        {b.description && <span className="tile-desc">{b.description}</span>}
      </a>
      {num !== undefined && <span className="num-badge" aria-label={`Number ${num}`}>{num}</span>}
      {b.preferred && <span className="tile-star" title="Preferred" role="img" aria-label="Preferred">★</span>}
      {tags.length > 0 && (
        <ul className="tile-tags" aria-label={`Tags: ${tags.map((t) => t.name).join(', ')}`}>
          {tags.slice(0, 2).map((t) => (
            <li key={t.id}>
              {onTag ? (
                <button className={`tag-chip${activeTagIds.includes(t.id) ? ' tag-chip--on' : ''}`} onClick={() => onTag(t.id)}
                  title={`Filter by ${t.name}`}>{t.name}</button>
              ) : <span className="tag-chip">{t.name}</span>}
            </li>
          ))}
          {tags.length > 2 && <li className="tag-more" title={tags.slice(2).map((t) => t.name).join(', ')}>+{tags.length - 2}</li>}
        </ul>
      )}
      {onMenu && (
        <button className="tile-menu-btn" aria-label={`Actions for ${bookmarkLabel(b)}`} aria-haspopup="menu"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu({ x: r.left, y: r.bottom + 4 }); }}>
          ⋯
        </button>
      )}
    </div>
  );
});

/**
 * Draggable tile. Drag with the mouse (after moving 6px, so plain clicks still open the site)
 * or with the keyboard: focus the tile, press Space, use arrow keys, Space again to drop, Esc to cancel.
 * Enter keeps opening the link.
 *
 * Memoised on purpose: with thousands of bookmarks, re-rendering every tile on every store change is slow.
 * So everything it needs arrives as stable props (the parent passes the same functions and records).
 */
export const SortableTile = memo(function SortableTile(props: {
  bookmark: Bookmark;
  tags: Tag[];
  activeTagIds: string[];
  onMenu(b: Bookmark, p: MenuPos): void;
  onTag(id: string): void;
  newTab: boolean;
  onOpen(id: string): void;
  hidden: boolean;
  num?: number;
}) {
  const { bookmark, onMenu } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmark.id,
    data: { type: 'bookmark', groupId: bookmark.groupId },
  });
  return (
    <TileView
      ref={setNodeRef}
      bookmark={bookmark}
      onMenu={(p) => onMenu(bookmark, p)}
      tags={props.tags}
      activeTagIds={props.activeTagIds}
      onTag={props.onTag}
      newTab={props.newTab}
      onOpen={props.onOpen}
      hidden={props.hidden}
      num={props.num}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      linkProps={{ ref: setActivatorNodeRef, ...listeners, 'aria-describedby': attributes['aria-describedby'] }}
    />
  );
}, (a, b) =>
  a.bookmark === b.bookmark && a.newTab === b.newTab && a.hidden === b.hidden && a.num === b.num && a.onMenu === b.onMenu && a.onTag === b.onTag && a.onOpen === b.onOpen && a.activeTagIds === b.activeTagIds &&
  a.tags.length === b.tags.length && a.tags.every((t, i) => t === b.tags[i]));
