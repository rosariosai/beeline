import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GROUP_SECTION_PREFIX } from '../dnd';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Bookmark, DataState } from '../../core/types';
import { SortableTile } from './Tile';
import { isBookmarkHidden } from '../../core/hidden';

// Same Tag objects in the same order -> the memoised tile can skip rendering.
const tagsOf = (data: DataState, b: Bookmark) => b.tagIds.map((id) => data.tags[id]).filter(Boolean);

export const sectionDropId = (groupId: string | null) => `section:${groupId ?? 'ungrouped'}`;

/** Big sections only mount their tiles while near the viewport. Small ones always mount. */
const LAZY_MIN_ITEMS = 24;
const APPROX_TILE_HEIGHT = 200;
const APPROX_ROW_HEIGHT = 44;

/** Stable hue per group so every group keeps its own soft background colour. */
const hueOf = (id: string | null) => {
  let h = 7;
  for (const c of id ?? 'ungrouped') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h * 47) % 360;
};

function useNearViewport(el: React.RefObject<HTMLElement>, enabled: boolean): boolean {
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (!enabled) { setNear(true); return; }
    const target = el.current;
    if (!target || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    // root = the scrolling area, so the margin really extends the detection zone
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: document.getElementById('main'), rootMargin: '900px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, [enabled, el]);
  return near;
}

export function Section(props: {
  groupId: string | null;
  name: string;
  color?: string;
  emoji?: string;
  collapsed?: boolean;
  onToggleCollapse?(): void;
  items: Bookmark[];
  data: DataState;
  tagFilter: string[];
  onMenu(b: Bookmark, p: { x: number; y: number }): void;
  onTag(id: string): void;
  onGroupMenu?(p: { x: number; y: number }): void;
  onTagGroup?(): void;
  newTab: boolean;
  onOpen(id: string): void;
  compact: boolean;
  groupHidden: boolean;
  groupPromoted?: boolean;
  numbers?: Map<string, number>;
  now: number;
}) {
  const { setNodeRef: setSectionRef, isOver } = useDroppable({ id: sectionDropId(props.groupId), data: { type: 'section', groupId: props.groupId } });
  // The whole window can be dragged by its handle and dropped on another window to reorder groups.
  const gid = props.groupId ? GROUP_SECTION_PREFIX + props.groupId : 'gsec:none';
  const groupDrop = useDroppable({ id: gid, disabled: !props.groupId, data: { type: 'group' } });
  const groupDrag = useDraggable({ id: gid, disabled: !props.groupId, data: { type: 'group' } });
  const setNodeRef = (el: HTMLElement | null) => { setSectionRef(el); groupDrop.setNodeRef(el); groupDrag.setNodeRef(el); };
  const body = useRef<HTMLDivElement>(null);
  const height = useRef<number | null>(null);
  const lazy = props.items.length >= LAZY_MIN_ITEMS;
  const near = useNearViewport(body, lazy);
  const mounted = near || !lazy;

  // remember the real height so the placeholder keeps the scroll position stable
  useLayoutEffect(() => { if (mounted && body.current) height.current = body.current.offsetHeight; });

  const placeholderHeight = height.current ?? props.compact ? Math.ceil(props.items.length / 4) * APPROX_ROW_HEIGHT : Math.ceil(props.items.length / 5) * APPROX_TILE_HEIGHT;

  return (
    <section className={`section${props.collapsed ? ' section--collapsed' : ''}${isOver ? ' section--over' : ''}${groupDrop.isOver && !groupDrag.isDragging && groupDrop.active?.data.current?.type === 'group' ? ' section--gover' : ''}${groupDrag.isDragging ? ' section--gdrag' : ''}${props.groupHidden ? ' section--hidden' : ''}`} aria-label={props.name} ref={setNodeRef}
      style={{ '--hue': hueOf(props.groupId), ...(props.color ? { '--gc': props.color } : {}) } as React.CSSProperties}>
      <h2 className="section-title">
        {props.groupId && (
          <button type="button" className="section-grip" ref={groupDrag.setActivatorNodeRef} {...groupDrag.listeners} {...groupDrag.attributes}
            aria-label={`Move group ${props.name}. Press Space, then arrow keys, then Space again.`} title="Drag to move this group">⠿</button>
        )}
        {props.onToggleCollapse && (
          <button className="section-toggle" aria-expanded={!props.collapsed} aria-label={`${props.collapsed ? 'Expand' : 'Collapse'} group ${props.name}`}
            title={props.collapsed ? 'Expand' : 'Collapse'} onClick={props.onToggleCollapse}>{props.collapsed ? '▸' : '▾'}</button>
        )}{props.emoji && <span className="section-emoji" aria-hidden>{props.emoji}</span>}{props.name} <span className="count">{props.items.length}</span>{props.groupPromoted ? <span className="tile-badge">★ in Preferred</span> : props.groupHidden && <span className="tile-badge">hidden</span>}
        {props.onTagGroup && props.groupId && props.items.length > 0 && (
          <button className="btn btn--sm section-menu" aria-label={`Tag all bookmarks in ${props.name} with “${props.name.toLocaleLowerCase()}”`}
            title={`Give every bookmark in this group the tag “${props.name.toLocaleLowerCase()}”`} onClick={props.onTagGroup}>
            <span aria-hidden>🏷</span><span className="lbl"> Tag all</span>
          </button>
        )}
        {props.onGroupMenu && props.groupId && (
          <button className="btn btn--sm section-menu" aria-haspopup="menu" aria-label={`Hide or show group ${props.name}`}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); props.onGroupMenu?.({ x: r.left, y: r.bottom + 4 }); }}>
            <span aria-hidden>{props.groupHidden ? '👁' : '🙈'}</span><span className="lbl">{props.groupHidden ? ' Unhide…' : ' Hide…'}</span>
          </button>
        )}</h2>
      <SortableContext items={mounted && !props.collapsed ? props.items.map((b) => b.id) : []} strategy={rectSortingStrategy}>
        {props.collapsed ? null : props.items.length === 0 ? (
          <p className="hint dropzone">This group is empty. Drag a bookmark here, or use “+ Add bookmark”.</p>
        ) : (
          <div ref={body} style={mounted ? undefined : { height: placeholderHeight }}>
            {mounted && (
              <div className="grid">
                {props.items.map((b) => (
                  <SortableTile key={b.id} bookmark={b} tags={tagsOf(props.data, b)} activeTagIds={props.tagFilter}
                    onMenu={props.onMenu} onTag={props.onTag} newTab={props.newTab} onOpen={props.onOpen}
                    hidden={props.groupHidden || isBookmarkHidden(props.data, b, props.now)} num={props.numbers?.get(b.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </SortableContext>
    </section>
  );
}
