import { tagGroupsByName } from '../../core/tags';
import { useEffect, useRef, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TagList } from './TagList';
import { GROUP_PREFIX, SIDE_PREFIX, UNGROUPED_SIDE } from '../dnd';
import { addGroup, setGroupBrowsers, bookmarksIn, deleteGroup, renameGroup, setAllCollapsed, setGroupCollapsed, sortedGroups, launchpadBookmarks, setGroupPromoted } from '../../core/ops';
import { newId } from '../../core/id';
import { isBookmarkHidden, isGroupHiddenForReal, isHiddenFlag, isOtherBrowserGroup, setGroupHidden, HIDE_CHOICES, untilFor } from '../../core/hidden';
import { useStore } from '../store';
import { ContextMenu } from './ContextMenu';
import { useTabScope } from '../useTabScope';
import { tabMenuItems } from '../tabMenu';
import { moveGroupToTab, toggleGroupInTab } from '../../core/tabs';

function RenameInput(props: { initial: string; onDone(name: string | null): void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="rename-input" defaultValue={props.initial} aria-label="Group name"
      onBlur={(e) => props.onDone(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onDone(e.currentTarget.value);
        if (e.key === 'Escape') props.onDone(null);
      }} />
  );
}

/** One sidebar group: sortable (reorder groups) and a drop target (drop a bookmark to move it in). */
function GroupRow(props: { id: string; children: (h: { handle: object }) => React.ReactNode; onContextMenu(e: React.MouseEvent): void; onMouseDown?(e: React.MouseEvent): void }) {
  const sortable = useSortable({ id: GROUP_PREFIX + props.id, data: { type: 'group' } });
  const drop = useDroppable({ id: SIDE_PREFIX + props.id, data: { type: 'side', groupId: props.id } });
  return (
    <div ref={(el) => { sortable.setNodeRef(el); drop.setNodeRef(el); }}
      className={`side-row${drop.isOver ? ' side-row--over' : ''}${sortable.isDragging ? ' side-row--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      onContextMenu={props.onContextMenu} onMouseDown={props.onMouseDown}>
      {props.children({ handle: { ref: sortable.setActivatorNodeRef, ...sortable.listeners, 'aria-describedby': sortable.attributes['aria-describedby'] } })}
    </div>
  );
}

function UngroupedDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: UNGROUPED_SIDE, data: { type: 'side', groupId: null } });
  return <div ref={setNodeRef} className={`side-drop${isOver ? ' side-row--over' : ''}`}>Drop here to ungroup</div>;
}

export function Sidebar(props: { bookmarkDragging: boolean; onStyleGroup(id: string): void }) {
  const { data, view, setView, commit, settings, notify, browser, updateSettings, advanced } = useStore();
  const tabScope = useTabScope();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const now = Date.now();
  const showHidden = settings.showHidden;
  const everyGroup = sortedGroups(data);
  const inTabCount = everyGroup.filter((g) => tabScope.includes(g.id)).length;
  const groups = everyGroup.filter((g) => (showHidden || !isHiddenFlag(g, now)) && tabScope.includes(g.id));
  const countIn = (gid: string) => bookmarksIn(data, gid).filter((b) => showHidden || !isBookmarkHidden(data, b, now)).length;
  const total = Object.values(data.bookmarks).filter((b) => (showHidden || !isBookmarkHidden(data, b, now)) && tabScope.includes(b.groupId && data.groups[b.groupId] ? b.groupId : null)).length;
  const tabName = tabScope.current && tabScope.current.kind !== 'all' ? tabScope.current.name : null;

  const preferredCount = launchpadBookmarks(data).filter((b) => showHidden || !isBookmarkHidden(data, b, now, true)).length;

  const createGroup = () => {
    const id = newId();
    commit((s) => addGroup(s, 'New group', id, Date.now()));
    // A group made while a tab is open starts in that tab, so it does not vanish from view.
    if (tabScope.current?.kind === 'tab') updateSettings({ tabs: toggleGroupInTab(settings.tabs, tabScope.current.id, id, true) });
    setView({ kind: 'group', id });
    setRenamingId(id);
  };

  const tagGroups = (ids: string[] | null) => {
    const r = tagGroupsByName(data, ids, Date.now(), newId);
    if (!r.tagged) { notify('Nothing to tag: every bookmark already has its group tag.'); return; }
    commit(() => r.state, `Tagged ${r.tagged} bookmark${r.tagged === 1 ? '' : 's'}${r.created ? `, ${r.created} new tag${r.created === 1 ? '' : 's'}` : ''}.`);
  };

  // Right-button drag of a group onto a tab = MOVE it there (out of the tab you are on). Left-button drag copies (see App).
  const [ghost, setGhost] = useState<{ x: number; y: number; name: string } | null>(null);
  const startRightDrag = (e: React.MouseEvent, gid: string) => {
    if (e.button !== 2 || !tabScope.views.some((v) => v.kind === 'tab')) return;
    const sx = e.clientX, sy = e.clientY, name = data.groups[gid]?.name ?? '';
    const from = tabScope.current?.kind === 'tab' ? tabScope.current.id : null;
    const tabs = settings.tabs;
    let active = false;
    let hover: HTMLElement | null = null;
    const tabAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-tab]') ?? null;
    const move = (ev: MouseEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        active = true; setMenu(null); document.body.classList.add('tab-dragging');
      }
      setGhost({ x: ev.clientX, y: ev.clientY, name });
      const t = tabAt(ev.clientX, ev.clientY);
      if (t !== hover) { hover?.classList.remove('tab--drop'); t?.classList.add('tab--drop'); hover = t; }
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move, true); window.removeEventListener('mouseup', up, true);
      hover?.classList.remove('tab--drop'); document.body.classList.remove('tab-dragging'); setGhost(null);
      if (!active) return;
      // The browser opens its context menu after a right-button release: swallow that one.
      const swallow = (c: Event) => { c.preventDefault(); c.stopPropagation(); };
      window.addEventListener('contextmenu', swallow, true);
      window.setTimeout(() => window.removeEventListener('contextmenu', swallow, true), 400);
      const to = tabAt(ev.clientX, ev.clientY)?.dataset.dropTab;
      if (!to || to === from) return;
      const next = moveGroupToTab(tabs, gid, to, from);
      if (next === tabs) return;
      updateSettings({ tabs: next });
      notify(`Moved “${name}” to “${tabs.find((t) => t.id === to)?.name}”${from ? ` (out of “${tabs.find((t) => t.id === from)?.name}”)` : ''}.`);
    };
    window.addEventListener('mousemove', move, true); window.addEventListener('mouseup', up, true);
  };

  const finishRename = (id: string, name: string | null) => {
    setRenamingId(null);
    if (name !== null) commit((s) => renameGroup(s, id, name));
  };

  return (
    <nav className="sidebar" id="sidebar" aria-label="Groups and tags">
      <button className="side-item side-item--top" aria-current={view.kind === 'all' ? 'page' : undefined} onClick={() => setView({ kind: 'all' })}>
        <span>{tabName ? `All in “${tabName}”` : 'All bookmarks'}</span><span className="count">{total}</span>
      </button>
      <button className="side-item side-item--top" aria-current={view.kind === 'preferred' ? 'page' : undefined} onClick={() => setView({ kind: 'preferred' })}>
        <span><span className="launch-star" aria-hidden>★</span> Preferred</span><span className="count">{preferredCount}</span>
      </button>
      <h2 className="side-heading">Groups <span className="side-total" title={`${everyGroup.length} group${everyGroup.length === 1 ? '' : 's'} in total${inTabCount !== everyGroup.length ? `, ${inTabCount} in this tab` : ''}`}>{inTabCount !== everyGroup.length ? `${inTabCount} of ${everyGroup.length}` : everyGroup.length}</span></h2>
      <SortableContext items={groups.map((g) => GROUP_PREFIX + g.id)}
        strategy={props.bookmarkDragging ? () => null : verticalListSortingStrategy}>
        {groups.map((g) => (
          <GroupRow key={g.id} id={g.id} onMouseDown={(e) => startRightDrag(e, g.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, groupId: g.id }); }}>
            {({ handle }) => renamingId === g.id ? (
              <RenameInput initial={g.name} onDone={(n) => finishRename(g.id, n)} />
            ) : (
              <>
                <button className="side-item" aria-current={view.kind === 'group' && view.id === g.id ? 'page' : undefined}
                  onClick={() => setView({ kind: 'group', id: g.id })} onDoubleClick={() => setRenamingId(g.id)} {...handle}>
                  <span className="truncate">{g.color && <span className="side-dot" style={{ background: g.color }} aria-hidden />}{g.emoji && <span className="side-emoji" aria-hidden>{g.emoji} </span>}{g.name}{g.promoted ? <span className="tile-badge">★ in Preferred</span> : isHiddenFlag(g, now) && <span className="tile-badge">hidden</span>}</span><span className="count">{countIn(g.id)}</span>
                </button>
                <button className="side-more" aria-label={`Actions for group ${g.name}`} aria-haspopup="menu"
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, groupId: g.id }); }}>⋯</button>
              </>
            )}
          </GroupRow>
        ))}
      </SortableContext>
      {props.bookmarkDragging && <UngroupedDrop />}
      <button className="side-item side-add" onClick={createGroup}>+ New group</button>
      {advanced && groups.length > 0 && (
        <button className="side-item side-add" onClick={() => commit((s) => setAllCollapsed(s, !groups.every((g) => g.collapsed)))}
          title="Collapse or expand every group on the dashboard">{groups.every((g) => g.collapsed) ? '▸ Expand all groups' : '▾ Collapse all groups'}</button>
      )}
      {advanced && <button className="side-item side-add" onClick={() => tagGroups(null)}
        title="Give every bookmark the lowercase name of its group as a tag">🏷 Tag all groups</button>}
      {advanced && <TagList />}

      {ghost && <div className="group-overlay tab-ghost" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>⠿ {ghost.name}</div>}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Rename', onSelect: () => setRenamingId(menu.groupId) },
          { label: data.groups[menu.groupId]?.collapsed ? 'Expand group' : 'Collapse group', onSelect: () => commit((s) => setGroupCollapsed(s, menu.groupId)) },
          { label: advanced ? 'Colour, icon, browsers…' : 'Colour and icon…', onSelect: () => props.onStyleGroup(menu.groupId) },
          ...tabMenuItems(settings, updateSettings, menu.groupId),
          ...(!advanced ? [] : [{ label: data.groups[menu.groupId]?.promoted ? 'Remove group from Preferred' : '★ Promote group to Preferred',
            onSelect: () => commit((s) => setGroupPromoted(s, menu.groupId, !s.groups[menu.groupId]?.promoted)) },
          ...(data.groups[menu.groupId] && isOtherBrowserGroup(data.groups[menu.groupId])
            ? [{ label: 'Also show in this browser', onSelect: () => commit((s) => setGroupBrowsers(s, menu.groupId, [...(s.groups[menu.groupId]?.browsers ?? []), browser])) }]
            : data.groups[menu.groupId] && isGroupHiddenForReal(data.groups[menu.groupId], now)
            ? [{ label: 'Unhide group', onSelect: () => commit((s) => setGroupHidden(s, menu.groupId, false, null)) }]
            : [{ label: 'Hide group…', children: HIDE_CHOICES.map((c) => ({
                label: c.label.replace('Hide', 'Hide group'),
                onSelect: () => commit((s) => setGroupHidden(s, menu.groupId, true, untilFor(c.days, Date.now())),
                  'Group hidden. Find it again under 👁 Hidden.'),
              })) }]),
          { label: `Tag all with “${(data.groups[menu.groupId]?.name ?? '').toLocaleLowerCase()}”`, onSelect: () => tagGroups([menu.groupId]) }]),
          { label: 'Delete group', danger: true,
            onSelect: () => commit((s) => deleteGroup(s, menu.groupId, Date.now()), 'Group deleted. Its bookmarks moved to Ungrouped.') },
        ]} />
      )}
    </nav>
  );
}
