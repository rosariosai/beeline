// "Top Chrome / Top Brave / Top Firefox" can be created in several browsers independently. After a sync a browser may
// then hold two groups with the same name. This merges such duplicates into one. It is deterministic (the oldest group,
// then the smallest id, is kept) so that every browser reaches the same result and nothing ping-pongs through the sync file.
import type { Bookmark, DataState, Group } from './types';
import { BROWSERS } from './types';

const TOP_NAMES = new Set(BROWSERS.map((b) => `top ${b.label}`.toLowerCase()));
const keyOf = (g: Group) => g.name.trim().toLowerCase();
const older = (a: Group, b: Group) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

export function dedupeTopGroups(s: DataState): DataState {
  const byName = new Map<string, Group[]>();
  for (const g of Object.values(s.groups)) if (TOP_NAMES.has(keyOf(g))) byName.set(keyOf(g), [...(byName.get(keyOf(g)) ?? []), g]);
  const dupes = [...byName.values()].filter((l) => l.length > 1);
  if (!dupes.length) return s;
  const groups = { ...s.groups };
  const bookmarks = { ...s.bookmarks };
  for (const list of dupes) {
    list.sort(older);
    const [keep, ...rest] = list;
    const merged: Group = { ...keep };
    for (const d of rest) {
      for (const f of ['color', 'emoji'] as const) if (!merged[f] && d[f]) merged[f] = d[f];
      if (!merged.promoted && d.promoted) merged.promoted = true;
    }
    groups[keep.id] = merged;
    let next = Math.max(-1, ...Object.values(bookmarks).filter((b) => b.groupId === keep.id).map((b) => b.order)) + 1;
    const moving: Bookmark[] = Object.values(bookmarks).filter((b) => rest.some((d) => d.id === b.groupId))
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    for (const b of moving) bookmarks[b.id] = { ...b, groupId: keep.id, order: next++ };
    for (const d of rest) delete groups[d.id];
  }
  return { ...s, groups, bookmarks };
}
