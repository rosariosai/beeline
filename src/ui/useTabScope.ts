import { useCallback, useMemo } from 'react';
import { useStore } from './store';
import { sortedGroups, bookmarksIn } from '../core/ops';
import { activeTabView, groupIdsIn, showsUngrouped, tabViews } from '../core/tabs';

/** Which tab is on and which groups it shows. No tabs = everything is shown and `views` is empty. */
export function useTabScope() {
  const { data, settings } = useStore();
  const { tabs, showAllTab, activeTabId } = settings;
  const scope = useMemo(() => {
    const ids = sortedGroups(data).map((g) => g.id);
    const views = tabViews(tabs, showAllTab, ids, bookmarksIn(data, null).length > 0);
    const current = activeTabView(views, activeTabId);
    return { views, current, set: groupIdsIn(current, tabs, ids), ungrouped: showsUngrouped(current) };
  }, [data, tabs, showAllTab, activeTabId]);
  /** Is this group (null = Ungrouped) shown in the current tab? */
  const includes = useCallback((groupId: string | null) => (groupId === null ? scope.ungrouped : !scope.set || scope.set.has(groupId)), [scope]);
  return { ...scope, includes };
}
