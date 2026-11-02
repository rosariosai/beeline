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
function GroupRow(props: { id: string; children: (h: { handle: object }) => React.ReactNode; onContextMenu(e: React.MouseEvent): void }) {
  const sortable = useSortable({ id: GROUP_PREFIX + props.id, data: { type: 'group' } });
  const drop = useDroppable({ id: SIDE_PREFIX + props.id, data: { type: 'side', groupId: props.id } });
  return (
    <div ref={(el) => { sortable.setNodeRef(el); drop.setNodeRef(el); }}
      className={`side-row${drop.isOver ? ' side-row--over' : ''}${sortable.isDragging ? ' side-row--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      onContextMenu={props.onContextMenu}>
      {props.children({ handle: { ref: sortable.setActivatorNodeRef, ...sortable.listeners, 'aria-describedby': sortable.attributes['aria-describedby'] } })}
    </div>
  );
}

function UngroupedDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: UNGROUPED_SIDE, data: { type: 'side', groupId: null } });
  return <div ref={setNodeRef} className={`side-drop${isOver ? ' side-row--over' : ''}`}>Drop here to ungroup</div>;
}

export function Sidebar(props: { bookmarkDragging: boolean; onStyleGroup(id: string): void }) {
  const { data, view, setView, commit, settings, notify, browser } = useStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const now = Date.now();
  const showHidden = settings.showHidden;
  const groups = sortedGroups(data).filter((g) => showHidden || !isHiddenFlag(g, now));
  const countIn = (gid: string) => bookmarksIn(data, gid).filter((b) => showHidden || !isBookmarkHidden(data, b, now)).length;
  const total = Object.values(data.bookmarks).filter((b) => showHidden || !isBookmarkHidden(data, b, now)).length;

  const preferredCount = launchpadBookmarks(data).filter((b) => showHidden || !isBookmarkHidden(data, b, now, true)).length;

  const createGroup = () => {
    const id = newId();
    commit((s) => addGroup(s, 'New group', id, Date.now()));
    setView({ kind: 'group', id });
    setRenamingId(id);
  };

  const tagGroups = (ids: string[] | null) => {
    const r = tagGroupsByName(data, ids, Date.now(), newId);
    if (!r.tagged) { notify('Nothing to tag: every bookmark already has its group tag.'); return; }
    commit(() => r.state, `Tagged ${r.tagged} bookmark${r.tagged === 1 ? '' : 's'}${r.created ? `, ${r.created} new tag${r.created === 1 ? '' : 's'}` : ''}.`);
  };

  const finishRename = (id: string, name: string | null) => {
    setRenamingId(null);
    if (name !== null) commit((s) => renameGroup(s, id, name));
  };

  return (
    <nav className="sidebar" id="sidebar" aria-label="Groups and tags">
      <button className="side-item side-item--top" aria-current={view.kind === 'all' ? 'page' : undefined} onClick={() => setView({ kind: 'all' })}>
        <span>All bookmarks</span><span className="count">{total}</span>
      </button>
      <button className="side-item side-item--top" aria-current={view.kind === 'preferred' ? 'page' : undefined} onClick={() => setView({ kind: 'preferred' })}>
        <span><span className="launch-star" aria-hidden>★</span> Preferred</span><span className="count">{preferredCount}</span>
      </button>
      <h2 className="side-heading">Groups</h2>
      <SortableContext items={groups.map((g) => GROUP_PREFIX + g.id)}
        strategy={props.bookmarkDragging ? () => null : verticalListSortingStrategy}>
        {groups.map((g) => (
          <GroupRow key={g.id} id={g.id}
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
      {groups.length > 0 && (
        <button className="side-item side-add" onClick={() => commit((s) => setAllCollapsed(s, !groups.every((g) => g.collapsed)))}
          title="Collapse or expand every group on the dashboard">{groups.every((g) => g.collapsed) ? '▸ Expand all groups' : '▾ Collapse all groups'}</button>
      )}
      <button className="side-item side-add" onClick={() => tagGroups(null)}
        title="Give every bookmark the lowercase name of its group as a tag">🏷 Tag all groups</button>
      <TagList />

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Rename', onSelect: () => setRenamingId(menu.groupId) },
          { label: data.groups[menu.groupId]?.collapsed ? 'Expand group' : 'Collapse group', onSelect: () => commit((s) => setGroupCollapsed(s, menu.groupId)) },
          { label: 'Colour, icon, browsers…', onSelect: () => props.onStyleGroup(menu.groupId) },
          { label: data.groups[menu.groupId]?.promoted ? 'Remove group from Preferred' : '★ Promote group to Preferred',
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
          { label: `Tag all with “${(data.groups[menu.groupId]?.name ?? '').toLocaleLowerCase()}”`, onSelect: () => tagGroups([menu.groupId]) },
          { label: 'Delete group', danger: true,
            onSelect: () => commit((s) => deleteGroup(s, menu.groupId, Date.now()), 'Group deleted. Its bookmarks moved to Ungrouped.') },
        ]} />
      )}
    </nav>
  );
}
