import { useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { TabView } from '../../core/tabs';
import { useStore } from '../store';
import { useTabScope } from '../useTabScope';
import { isBookmarkHidden, isHiddenFlag } from '../../core/hidden';
import { groupIdsIn, showsUngrouped } from '../../core/tabs';
import { bookmarksIn, sortedGroups } from '../../core/ops';

/** One tab. Real tabs are drop targets: drop a group from the sidebar to copy it here (right-button drop moves it). */
function TabButton(props: { v: TabView; on: boolean; count: number; onPick(): void }) {
  const { v, on, count } = props;
  const drop = useDroppable({ id: `tab:${v.id}`, disabled: v.kind !== 'tab', data: { type: 'tab', tabId: v.id } });
  return (
    <button ref={drop.setNodeRef} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} {...(v.kind === 'tab' ? { 'data-drop-tab': v.id } : {})}
      className={`tab${on ? ' tab--on' : ''}${drop.isOver ? ' tab--drop' : ''}`} onClick={props.onPick}
      title={`${v.name}: ${count} group${count === 1 ? '' : 's'}${v.kind === 'tab' ? '. Drop a group here to copy it into this tab; right-button drop moves it.' : ''}`}>
      <span className="truncate">{v.name}</span><span className="count">{count}</span>
    </button>
  );
}

/** The tab bar: 2 to 5 tabs, each showing its own set of groups. The pencil opens the tab editor. */
export function TabBar(props: { onEdit(): void }) {
  const { data, settings, updateSettings, setView } = useStore();
  const { views, current } = useTabScope();
  const list = useRef<HTMLDivElement>(null);
  if (!views.length) return null;
  const now = Date.now();
  const ids = sortedGroups(data).map((g) => g.id);
  const countOf = (v: (typeof views)[number]) => {
    const set = groupIdsIn(v, settings.tabs, ids);
    const groups = sortedGroups(data).filter((g) => (settings.showHidden || !isHiddenFlag(g, now)) && (!set || set.has(g.id)));
    const loose = showsUngrouped(v) ? bookmarksIn(data, null).filter((b) => settings.showHidden || !isBookmarkHidden(data, b, now)).length : 0;
    return groups.length + (loose ? 1 : 0);
  };
  const pick = (id: string) => { updateSettings({ activeTabId: id }); setView({ kind: 'all' }); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = Math.max(0, views.findIndex((v) => v.id === current?.id));
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length;
    pick(views[n].id);
    window.setTimeout(() => list.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[n]?.focus(), 0);
  };
  return (
    <div className="tabbar">
      <div className="tabbar-list" role="tablist" aria-label="Tabs" ref={list} onKeyDown={onKey}>
        {views.map((v) => (
          <TabButton key={v.id} v={v} on={v.id === current?.id} count={countOf(v)} onPick={() => pick(v.id)} />
        ))}
      </div>
      <button type="button" className="tab-edit" aria-label="Edit tabs" title="Edit tabs: which groups are in which tab" onClick={props.onEdit}>✎ Edit tabs</button>
    </div>
  );
}
