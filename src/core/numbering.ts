// "TV channel" numbers: every visible bookmark gets a number 1, 2, 3… in the order you see them on the dashboard
// (the Preferred bar first when it is shown, then the groups in their order, Ungrouped last). A bookmark that is in
// both the Preferred bar and a group keeps its first number. Reorder tiles and the numbers follow.
import type { DataState } from './types';
import { bookmarksIn, launchpadBookmarks, sortedGroups } from './ops';
import { isBookmarkHidden, isHiddenFlag } from './hidden';

export function numberBookmarks(s: DataState, o: { launchpadFirst: boolean; showHidden: boolean; now: number; /** Limit to the groups shown (the current tab). null = Ungrouped. */ include?: (groupId: string | null) => boolean }): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string) => { if (!out.has(id)) out.set(id, out.size + 1); };
  if (o.launchpadFirst) for (const b of launchpadBookmarks(s)) if (o.showHidden || !isBookmarkHidden(s, b, o.now, true)) add(b.id);
  for (const g of sortedGroups(s)) {
    if (!o.showHidden && isHiddenFlag(g, o.now)) continue;
    if (o.include && !o.include(g.id)) continue;
    for (const b of bookmarksIn(s, g.id)) if (o.showHidden || !isBookmarkHidden(s, b, o.now)) add(b.id);
  }
  if (!o.include || o.include(null)) for (const b of bookmarksIn(s, null)) if (o.showHidden || !isBookmarkHidden(s, b, o.now)) add(b.id);
  return out;
}
