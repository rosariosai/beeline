import { closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type { DataState } from '../core/types';
import { bookmarksIn, moveBookmark, moveGroup, movePreferred, preferredBookmarks, sortedGroups } from '../core/ops';

/** Ids used for drop targets that are not tiles. */
export const SIDE_PREFIX = 'side:';        // sidebar group (drop a bookmark = move into it)
export const GROUP_PREFIX = 'group:';      // sidebar group as a sortable item
export const GROUP_SECTION_PREFIX = 'gsec:'; // a group window in the main area (drag its header handle)
export const LAUNCH_PREFIX = 'launch:';    // Preferred Launchpad item (reorder only)
export const UNGROUPED_SIDE = `${SIDE_PREFIX}ungrouped`;

type Kind = 'bookmark' | 'group' | 'launch';

/**
 * Bookmarks can land on: a tile (insert there), a sidebar group (append) or a section (append).
 * Groups can only land on other groups. Prefer the most specific target under the pointer.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const kind = args.active.data.current?.type as Kind | undefined;
  const containers = args.droppableContainers.filter((c) => {
    const t = c.data.current?.type;
    if (kind === 'launch') return t === 'launch';
    return kind === 'group' ? t === 'group' : t === 'bookmark' || t === 'side' || t === 'section';
  });
  const scoped = { ...args, droppableContainers: containers };
  const hits = pointerWithin(scoped);
  const specific = hits.filter((h) => containers.find((c) => c.id === h.id)?.data.current?.type !== 'section');
  if (specific.length) return specific;
  if (hits.length) return hits;
  return closestCenter({ ...scoped, droppableContainers: containers.filter((c) => c.data.current?.type !== 'section') });
};

/** Translate a finished drag into a pure state update (or null for "nothing to do"). */
export function dropToUpdate(e: DragEndEvent, now: number): ((s: DataState) => DataState) | null {
  const { active, over } = e;
  if (!over) return null;
  const a = active.data.current as { type: Kind; groupId?: string | null } | undefined;
  const o = over.data.current as { type: string; groupId?: string | null } | undefined;
  if (!a || !o) return null;

  if (a.type === 'launch') {
    if (o.type !== 'launch') return null;
    const id = String(active.id).slice(LAUNCH_PREFIX.length);
    const overId = String(over.id).slice(LAUNCH_PREFIX.length);
    return (s) => {
      const a = s.bookmarks[id], b = s.bookmarks[overId];
      if (!a || !b || id === overId) return s;
      const promoted = (x: typeof a) => !!x.groupId && !!s.groups[x.groupId]?.promoted;
      // Two items from the same promoted group: reorder inside that group.
      if (promoted(a) && promoted(b)) {
        if (a.groupId !== b.groupId) return s;
        const list = bookmarksIn(s, a.groupId);
        return moveBookmark(s, id, a.groupId, list.findIndex((x) => x.id === overId), now);
      }
      if (promoted(a) || promoted(b)) return s;
      const order = preferredBookmarks(s).map((x) => x.id);
      const from = order.indexOf(id), to = order.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return s;
      return movePreferred(s, id, arrayMove(order, from, to).indexOf(id));
    };
  }

  if (a.type === 'group') {
    const strip = (v: unknown) => String(v).replace(/^(group:|gsec:)/, '');
    const id = strip(active.id);
    const overId = strip(over.id);
    return (s) => {
      const order = sortedGroups(s).map((g) => g.id);
      const from = order.indexOf(id), to = order.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return s;
      return moveGroup(s, id, arrayMove(order, from, to).indexOf(id));
    };
  }

  const id = String(active.id);
  if (o.type === 'bookmark') {
    const overId = String(over.id);
    return (s) => {
      const target = s.bookmarks[overId];
      if (!target || overId === id) return s;
      const list = bookmarksIn(s, target.groupId);
      const to = list.findIndex((b) => b.id === overId);
      // moveBookmark removes the dragged item first, so index `to` gives arrayMove semantics within a
      // group (forward = after the target, backward = before it) and "insert before target" across groups.
      return moveBookmark(s, id, target.groupId, to, now);
    };
  }
  // sidebar group or section: append to that group
  const groupId = o.groupId ?? null;
  return (s) => moveBookmark(s, id, groupId, bookmarksIn(s, groupId).length, now);
}
