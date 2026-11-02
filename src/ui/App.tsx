import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Bookmark } from '../core/types';
import { DRAG_CONFIG } from './dragConfig';
import { matchesTags, ensureTags, tagGroupsByName } from '../core/tags';
import { buildIndex, search } from '../core/search';
import { addBookmark, bookmarksIn, deleteBookmark, duplicateBookmark, movePreferred, oftenUsed, setGroupBrowsers, setGroupCollapsed, preferredBookmarks, launchpadBookmarks, setGroupPromoted, setPreferred, sortedGroups, updateBookmark } from '../core/ops';
import { newId } from '../core/id';
import { numberBookmarks } from '../core/numbering';
import { ViewMenu } from './components/ViewMenu';
import { bookmarkLabel, isInternalUrl } from '../core/url';
import { openInternalUrl } from '../browser/api';
import { isGroupHiddenForReal, isOtherBrowserGroup, setGroupHidden, isBookmarkHidden, isHiddenFlag, hiddenCount, setBookmarkHidden, HIDE_CHOICES, untilFor } from '../core/hidden';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { BeeLogo } from './components/BeeLogo';
import { TileView, SortableTile } from './components/Tile';
import { Section } from './components/Section';
import { Launchpad } from './components/Launchpad';
import { GroupStyleDialog } from './components/GroupStyleDialog';
import { useSync } from './sync';
import { collisionDetection, dropToUpdate, GROUP_PREFIX } from './dnd';
import { BookmarkDialog, type BookmarkFormValue } from './components/BookmarkDialog';
import { ContextMenu } from './components/ContextMenu';
import { SearchBox } from './components/SearchBox';
import { DataDialog } from './components/DataDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SearchResults, resultId } from './components/SearchResults';

type Dialog = { editing: Bookmark | null } | null;

export function App() {
  const { data, settings, view, tagFilter, toggleTag, clearTags, query, setQuery, toast, commit, dismissToast, updateSettings, notify, trackOpen, browser } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; bookmark: Bookmark } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const sync = useSync();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [styleGroupId, setStyleGroupId] = useState<string | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtn = useRef<HTMLButtonElement>(null);
  const newTab = settings.openIn === 'new';
  const [dragging, setDragging] = useState<{ type: 'bookmark' | 'group' | 'launch'; id: string } | null>(null);

  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => { setDrawerOpen(false); }, [view]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const openMenu = useCallback((bm: Bookmark, p: { x: number; y: number }) => setMenu({ ...p, bookmark: bm }), []);

  const sensors = useSensors(
    // Mouse: 6px threshold, so a plain click still opens the site and a drag starts after a small movement.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch (phone): press and hold to lift; moving more than 8px before that is a normal scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: DRAG_CONFIG.LONG_PRESS_MS, tolerance: DRAG_CONFIG.SLOP_THRESHOLD_PX } }),
    // Keyboard: Space lifts/drops, arrows move, Esc cancels. Enter is left alone so links still open.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
  const nameOf = (id: string | number) => {
    const sid = String(id);
    if (sid.startsWith('gsec:')) return data.groups[sid.slice(5)]?.name ?? 'group';
    if (sid.startsWith(GROUP_PREFIX)) return data.groups[sid.slice(GROUP_PREFIX.length)]?.name ?? 'group';
    if (sid.startsWith('launch:')) return data.bookmarks[sid.slice(7)] ? bookmarkLabel(data.bookmarks[sid.slice(7)]) : 'item';
    if (sid.startsWith('side:')) return data.groups[sid.slice(5)]?.name ?? 'Ungrouped';
    if (sid.startsWith('section:')) return data.groups[sid.slice(8)]?.name ?? 'Ungrouped';
    return (data.bookmarks[sid] ? bookmarkLabel(data.bookmarks[sid]) : 'item');
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}. Use arrow keys to move, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${nameOf(active.id)} on ${nameOf(over.id)}.` : `Dropped ${nameOf(active.id)}.`),
    onDragCancel: ({ active }) => `Cancelled moving ${nameOf(active.id)}.`,
  };
  const onDragStart = (e: DragStartEvent) => {
    try { if (e.activatorEvent?.type === 'touchstart') navigator.vibrate?.(10); } catch { /* no haptics */ }
    return startDrag(e);
  };
  const startDrag = (e: DragStartEvent) =>
    setDragging({ type: e.active.data.current?.type === 'group' ? 'group' : e.active.data.current?.type === 'launch' ? 'launch' : 'bookmark', id: String(e.active.id) });
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const fn = dropToUpdate(e, Date.now());
    if (fn) commit(fn);
  };

  // ---- search ----
  const searchRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState(0);
  const index = useMemo(() => buildIndex(data), [data]);
  const searching = query.trim().length > 0;
  // TV-style numbers: bookmark n in the order you see them (Preferred bar first). Typing a number finds that bookmark.
  const numbering = useMemo(
    () => numberBookmarks(data, { launchpadFirst: settings.showLaunchpad, showHidden: settings.showHidden, now: Date.now() }),
    [data, settings.showLaunchpad, settings.showHidden],
  );
  const results = useMemo(
    () => {
      if (!searching) return [];
      const found = search(index, query).map((h) => data.bookmarks[h.id]).filter((b) => b && matchesTags(b, tagFilter) && (settings.showHidden || !isBookmarkHidden(data, b, Date.now(), true)));
      const q = query.trim();
      if (/^\d{1,5}$/.test(q)) {
        const n = Number(q);
        const hit = [...numbering].find(([, v]) => v === n);
        if (hit && data.bookmarks[hit[0]]) return [data.bookmarks[hit[0]], ...found.filter((b) => b.id !== hit[0])];
      }
      return found;
    },
    [searching, index, query, data, tagFilter, settings.showHidden, numbering],
  );
  useEffect(() => setSel(0), [query]);
  const selected = Math.min(sel, Math.max(0, results.length - 1));

  const open = (b: Bookmark, inNewTab: boolean) => {
    trackOpen(b.id);
    if (isInternalUrl(b.url)) { void openInternalUrl(b.url, inNewTab).then((ok) => { if (!ok) notify(`This browser does not let extensions open ${b.url}. Type it in the address bar.`); }); return; }
    if (inNewTab) window.open(b.url, '_blank', 'noopener');
    else window.location.assign(b.url);
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(selected + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(selected - 1, 0)); }
    else if (e.key === 'Enter' && results[selected]) { e.preventDefault(); open(results[selected], newTab !== (e.ctrlKey || e.metaKey || e.shiftKey)); }
    else if (e.key === 'Escape') { if (query) setQuery(''); else e.currentTarget.blur(); }
  };
  // "/" or Ctrl/Cmd+K focuses search (unless you are typing in a field or a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const isK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
      if (!isK && !isSlash) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const total = Object.keys(data.bookmarks).length;
  const groups = sortedGroups(data);
  const activeGroupId = view.kind === 'group' ? view.id : null;

  const filtering = tagFilter.length > 0;
  const now = Date.now();
  const showHidden = settings.showHidden;
  const hiddenN = hiddenCount(data, now);
  const pick = (gid: string | null) =>
    bookmarksIn(data, gid).filter((b) => matchesTags(b, tagFilter) && (showHidden || !isBookmarkHidden(data, b, now)));
  const visible = (b: Bookmark) => showHidden || !isBookmarkHidden(data, b, now);
  const preferredList = useMemo(() => launchpadBookmarks(data).filter((b) => showHidden || !isBookmarkHidden(data, b, now, true)), [data, showHidden, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const oftenList = useMemo(() => (settings.showOften ? oftenUsed(data).filter(visible) : []), [data, showHidden, settings.showOften, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const showLaunchpad = settings.showLaunchpad && !searching && !filtering && view.kind !== 'preferred' && total > 0;
  const viewGroupHidden = view.kind === 'group' && !showHidden && !!data.groups[view.id] && isHiddenFlag(data.groups[view.id], now);
  const sections =
    view.kind === 'preferred' ? []
    : view.kind === 'group'
      ? (viewGroupHidden ? [] : [{ id: view.id as string | null, name: data.groups[view.id]?.name ?? '', items: pick(view.id) }])
      : [
          ...groups.filter((g) => showHidden || !isHiddenFlag(g, now)).map((g) => ({ id: g.id as string | null, name: g.name, items: pick(g.id) })),
          { id: null as string | null, name: 'Ungrouped', items: pick(null) },
        ].filter((s) => s.items.length > 0);
  // In the flat view a bookmark already shown in the Preferred bar is not repeated below it.
  const rawItems = settings.groupsPerRow === 'raw'
    ? sections.flatMap((sec) => (filtering && sec.items.length === 0 ? [] : sec.items.filter((b) => !(showLaunchpad && preferredList.some((p) => p.id === b.id))).map((b) => ({ b, hid: (sec.id !== null && !!data.groups[sec.id] && isHiddenFlag(data.groups[sec.id], now)) || isBookmarkHidden(data, b, now) }))))
    : [];
  const visibleSections = filtering ? sections.filter((sec) => sec.items.length > 0) : sections;
  const shown = sections.reduce((n, s) => n + s.items.length, 0);

  const tagGroup = (groupId: string) => {
    const r = tagGroupsByName(data, [groupId], Date.now(), newId);
    commit(() => r.state, r.tagged ? `Tagged ${r.tagged} bookmark${r.tagged === 1 ? '' : 's'} with “${data.groups[groupId]?.name.toLocaleLowerCase()}”.` : undefined);
    if (!r.tagged) notify('Every bookmark in this group already has that tag.');
  };

  const save = (v: BookmarkFormValue) => {
    const editing = dialog?.editing;
    const { tagNames, hide, preferred, ...fields } = v;
    const newBmId = newId();
    commit((s) => {
      const now = Date.now();
      const { state, ids } = ensureTags(s, tagNames, now, newId);
      const next = editing
        ? updateBookmark(state, editing.id, { ...fields, tagIds: ids }, now)
        : addBookmark(state, { ...fields, tagIds: ids }, newBmId, now);
      const id = editing ? editing.id : newBmId;
      const starred = setPreferred(next, id, preferred, now);
      if (hide === undefined) return starred;
      return setBookmarkHidden(starred, id, hide !== 'show', hide === 'show' || hide === 'forever' ? null : untilFor(hide, now), now);
    });
    setDialog(null);
  };

  return (
    <div className={`app${settings.sidebar ? '' : ' app--nosidebar'}${drawerOpen ? ' app--drawer' : ''}`}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to bookmarks</a>
      <header className={`topbar${query ? ' topbar--searching' : ''}`}>
        <button className="btn btn--icon" aria-expanded={narrow ? drawerOpen : settings.sidebar} aria-controls="sidebar"
          aria-label={(narrow ? drawerOpen : settings.sidebar) ? 'Hide the side panel' : 'Show the side panel'} title="Show or hide groups and tags"
          onClick={() => (narrow ? setDrawerOpen((v) => !v) : updateSettings({ sidebar: !settings.sidebar }))}>☰</button>
        <h1 className="brand" aria-label="Beeline"><BeeLogo /><span className="wordmark" aria-hidden="true">b<i>ee</i>Line</span></h1>
        <SearchBox ref={searchRef} value={query} onChange={setQuery} onKeyDown={onSearchKey}
          expanded={searching} autoFocus={settings.focusSearch} activeId={searching && results.length ? resultId(selected) : undefined} />
        {query !== '' && <button type="button" className="btn search-cancel" onClick={() => { setQuery(''); (document.activeElement as HTMLElement | null)?.blur?.(); }}>Cancel</button>}
        <div className="topbar-actions">
          <button className="btn btn--primary btn--add" onClick={() => setDialog({ editing: null })} aria-label="Add bookmark" title="Add bookmark">
            <svg className="btn-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" /><path d="M12 7.2l1.2 2.4 2.7.4-1.95 1.9.45 2.7L12 13.3l-2.4 1.3.45-2.7L8.1 10l2.7-.4z" fill="#fde047" stroke="#fde047" strokeWidth="1" />
            </svg>
          </button>
          <ViewMenu />
          {(hiddenN > 0 || showHidden) && (
            <button className={`btn btn--hidden${showHidden ? ' btn--hidden-on' : ''}`} aria-pressed={showHidden} aria-label={`Hidden items: ${hiddenN}, ${showHidden ? 'shown' : 'not shown'}`}
              title={showHidden ? `Hidden items are shown (${hiddenN}). Click to hide them again.` : `Hidden items are not shown (${hiddenN}). Click to show them.`}
              onClick={() => updateSettings({ showHidden: !showHidden })}>
              <svg className="eye-color" viewBox="0 0 64 40" width="40" height="26" aria-hidden="true">
                <path d="M2 20C12 6 22 2 32 2s20 4 30 18C52 34 42 38 32 38S12 34 2 20z" fill="#fdba4d" />
                <path d="M7 20C15 10 23 7 32 7s17 3 25 13c-8 10-16 13-25 13S15 30 7 20z" fill="#fff" />
                <circle cx="32" cy="20" r="11.5" fill="#29a9e0" />
                <circle cx="32" cy="20" r="6.6" fill="#08121c" />
                <circle cx="36.2" cy="15.6" r="2.4" fill="#fff" />
                {!showHidden && <><path d="M8 36L56 4" stroke="#fff" strokeWidth="8" strokeLinecap="round" /><path d="M8 36L56 4" stroke="#0f172a" strokeWidth="4.5" strokeLinecap="round" /></>}
              </svg>
              <span className="hidden-count">{hiddenN}</span>
            </button>
          )}
          {sync.status.linked && (
            <button className={`btn btn--sync${sync.status.error ? ' btn--warn' : ''}`} disabled={sync.status.busy} onClick={() => void sync.syncNow()}
              title={sync.status.error ?? sync.status.message ?? (sync.status.lastSyncAt ? `Last synced ${new Date(sync.status.lastSyncAt).toLocaleString()}. Click to sync now.` : 'Sync with your sync file')}>
              {sync.status.busy ? '⟳ Syncing…' : sync.status.error ? '⚠ Sync' : !sync.status.allowed ? '⟳ Sync (allow)'
                : <><span className="sync-idle">⟳ Sync</span><span className="sync-hover">✓ Synced</span></>}
            </button>
          )}
          <button className="btn btn--io" onClick={() => setDataOpen(true)} aria-label="Import / Export" title="Import / Export">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 20V5" /><path d="M4 9l4-4 4 4" /><path d="M16 4v15" /><path d="M12 15l4 4 4-4" />
            </svg>
          </button>
          <button ref={settingsBtn} className="btn btn--settings" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog" aria-label="Settings" title="Settings">⚙</button>
        </div>
      </header>

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />}
      {narrow && drawerOpen && (
        <div className="drawer-foot">
          <button type="button" className="btn" onClick={() => { setDrawerOpen(false); setDataOpen(true); }}>Import / Export</button>
          {sync.status.linked && (
            <button type="button" className={`btn${sync.status.error ? ' btn--warn' : ''}`} disabled={sync.status.busy} onClick={() => void sync.syncNow()}>
              {sync.status.busy ? '⟳ Syncing…' : sync.status.error ? '⚠ Sync' : '⟳ Sync now'}
            </button>
          )}
        </div>
      )}
      <button type="button" className="fab" aria-label="Add bookmark" title="Add bookmark" onClick={() => setDialog({ editing: null })}>+</button>
      <DndContext sensors={sensors} collisionDetection={collisionDetection} accessibility={{ announcements }}
        autoScroll={{ threshold: { x: 0.1, y: 0.1 }, acceleration: DRAG_CONFIG.AUTO_SCROLL_MAX_SPEED_PX }}
        onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <Sidebar bookmarkDragging={dragging?.type === 'bookmark'} onStyleGroup={setStyleGroupId} />

      <main className="main" id="main" tabIndex={-1} aria-label="Bookmarks">
        {total === 0 && view.kind === 'all' ? (
          <div className="empty">
            <h2>Add your first bookmark</h2>
            <p>Your bookmarks live only in this browser, on this computer. Nothing is sent anywhere.</p>
            <div className="empty-actions">
              <button className="btn btn--primary btn--lg" onClick={() => setDialog({ editing: null })}>+ Add bookmark</button>
              <button className="btn btn--lg" onClick={() => setDataOpen(true)}>Import bookmarks</button>
            </div>
          </div>
        ) : (
          <>
            {filtering && (
              <div className="filterbar" role="region" aria-label="Active tag filters">
                <span className="filterbar-label">Filtered by</span>
                {tagFilter.map((id) => (
                  <button key={id} className="chip chip--btn" onClick={() => toggleTag(id)} aria-label={`Remove filter ${data.tags[id]?.name}`}>
                    # {data.tags[id]?.name} <span aria-hidden>×</span>
                  </button>
                ))}
                <button className="btn btn--sm" onClick={clearTags}>Clear filters</button>
                <span className="count" aria-live="polite">{searching ? results.length : shown} {(searching ? results.length : shown) === 1 ? 'bookmark' : 'bookmarks'}</span>
              </div>
            )}
            {searching ? (
              <SearchResults data={data} results={results} query={query} selected={selected} onHover={setSel} onOpen={(b, mod) => open(b, newTab !== mod)} />
            ) : (
              <>
            {showLaunchpad && (
              <Launchpad numbers={settings.showNumbers ? numbering : undefined} preferred={preferredList} often={oftenList} newTab={newTab} isHidden={(b) => isBookmarkHidden(data, b, now, true)}
                onOpen={trackOpen} onMenu={openMenu} />
            )}
            {view.kind === 'preferred' && (
              <section className="section section--preferred" aria-label="Preferred">
                <h2 className="section-title"><span className="launch-star" aria-hidden>★</span> Preferred <span className="count">{preferredList.length}</span></h2>
                {preferredList.length === 0 ? (
                  <p className="hint">Nothing here yet. Set a bookmark as preferred in its Edit dialog, or with “Set as preferred” in its menu.</p>
                ) : (
                  <div className="grid">
                    {preferredList.map((b) => (
                      <TileView key={b.id} bookmark={b} num={settings.showNumbers ? numbering.get(b.id) : undefined} onMenu={(p) => openMenu(b, p)} newTab={newTab} onOpen={trackOpen}
                        tags={b.tagIds.map((id) => data.tags[id]).filter(Boolean)} hidden={isBookmarkHidden(data, b, now)} />
                    ))}
                  </div>
                )}
              </section>
            )}
            {viewGroupHidden && (
              <p className="hint">This group is hidden.{' '}
                <button className="btn btn--sm" onClick={() => updateSettings({ showHidden: true })}>Show hidden items</button></p>
            )}
            {filtering && shown === 0 && <p className="hint">No bookmarks have all of these tags{view.kind === 'group' ? ' in this group' : ''}.</p>}
            {settings.groupsPerRow === 'raw' ? (
              <section className="section section--raw" aria-label="All bookmarks, no groups">
                <SortableContext items={rawItems.map((r) => r.b.id)} strategy={rectSortingStrategy}>
                  <div className="grid">
                    {rawItems.map(({ b, hid }) => (
                      <SortableTile key={b.id} bookmark={b} tags={b.tagIds.map((id) => data.tags[id]).filter(Boolean)} activeTagIds={tagFilter}
                        onMenu={openMenu} onTag={toggleTag} newTab={newTab} onOpen={trackOpen}
                        hidden={hid} num={settings.showNumbers ? numbering.get(b.id) : undefined} />
                    ))}
                  </div>
                </SortableContext>
              </section>
            ) : (
            <div className={`sections${settings.groupsPerRow === 'many' && visibleSections.length > 1 ? ' sections--many' : ''}`}>
            {visibleSections.map((sec) => (
              <Section key={sec.id ?? 'ungrouped'} groupId={sec.id} name={sec.name} items={sec.items}
                collapsed={sec.id !== null && !!data.groups[sec.id]?.collapsed && view.kind === 'all' && !filtering && settings.showGroupHeaders} numbers={settings.showNumbers ? numbering : undefined}
                onToggleCollapse={sec.id && view.kind === 'all' && !filtering ? () => commit((s) => setGroupCollapsed(s, sec.id as string)) : undefined}
                color={sec.id ? data.groups[sec.id]?.color : undefined} emoji={sec.id ? data.groups[sec.id]?.emoji : undefined}
                data={data} tagFilter={tagFilter} onMenu={openMenu} onTag={toggleTag} newTab={newTab} onOpen={trackOpen}
                onGroupMenu={sec.id ? (p) => setGroupMenu({ ...p, groupId: sec.id as string }) : undefined}
                onTagGroup={sec.id ? () => tagGroup(sec.id as string) : undefined}
                compact={settings.layout === 'compact'} now={now}
                groupHidden={sec.id !== null && !!data.groups[sec.id] && isHiddenFlag(data.groups[sec.id], now)} groupPromoted={sec.id !== null && !!data.groups[sec.id]?.promoted} />
            ))}
            </div>
            )}
              </>
            )}
          </>
        )}
      {groupMenu && (
          <ContextMenu x={groupMenu.x} y={groupMenu.y} onClose={() => setGroupMenu(null)}
            items={[{ label: data.groups[groupMenu.groupId]?.collapsed ? 'Expand group' : 'Collapse group', onSelect: () => commit((s) => setGroupCollapsed(s, groupMenu.groupId)) },
              { label: 'Colour, icon, browsers…', onSelect: () => setStyleGroupId(groupMenu.groupId) },
              { label: data.groups[groupMenu.groupId]?.promoted ? 'Remove group from Preferred' : '★ Promote group to Preferred',
                onSelect: () => commit((s) => setGroupPromoted(s, groupMenu.groupId, !s.groups[groupMenu.groupId]?.promoted),
                  data.groups[groupMenu.groupId]?.promoted ? 'Group is back in the list.' : 'Group promoted: its bookmarks are now in Preferred and the group is hidden (see 👁 Hidden).') },
              ...(data.groups[groupMenu.groupId] && isOtherBrowserGroup(data.groups[groupMenu.groupId])
              ? [{ label: 'Also show in this browser', onSelect: () => commit((s) => setGroupBrowsers(s, groupMenu.groupId, [...(s.groups[groupMenu.groupId]?.browsers ?? []), browser])) }]
              : data.groups[groupMenu.groupId] && isGroupHiddenForReal(data.groups[groupMenu.groupId], now)
              ? [{ label: 'Unhide group', onSelect: () => commit((s) => setGroupHidden(s, groupMenu.groupId, false, null)) }]
              : [{ label: 'Hide group…', children: HIDE_CHOICES.map((c) => ({
                  label: c.label.replace('Hide', 'Hide group'),
                  onSelect: () => commit((s) => setGroupHidden(s, groupMenu.groupId, true, untilFor(c.days, Date.now())), 'Group hidden. Find it again under 👁 Hidden.'),
                })) }]) ]} />
      )}
      {menu && (
          <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
            { label: 'Open in new tab', onSelect: () => open(menu.bookmark, true) },
            { label: 'Edit', onSelect: () => setDialog({ editing: menu.bookmark }) },
            { label: 'Duplicate', onSelect: () => {
                const id = newId();
                const next = duplicateBookmark(data, menu.bookmark.id, id, Date.now());
                commit((s) => duplicateBookmark(s, menu.bookmark.id, id, Date.now()));
                if (next.bookmarks[id]) setDialog({ editing: next.bookmarks[id] });
              } },
            { label: menu.bookmark.preferred ? 'Remove from preferred' : '★ Set as preferred',
              onSelect: () => commit((s) => setPreferred(s, menu.bookmark.id, !menu.bookmark.preferred, Date.now())) },
            ...(menu.bookmark.preferred ? [
              { label: 'Move earlier in Preferred', onSelect: () => commit((s) => movePreferred(s, menu.bookmark.id, preferredBookmarks(s).findIndex((x) => x.id === menu.bookmark.id) - 1)) },
              { label: 'Move later in Preferred', onSelect: () => commit((s) => movePreferred(s, menu.bookmark.id, preferredBookmarks(s).findIndex((x) => x.id === menu.bookmark.id) + 1)) },
            ] : []),
            { label: 'Move to group', children: [
              ...(menu.bookmark.groupId !== null ? [{ label: 'Ungrouped', onSelect: () => commit((s) => updateBookmark(s, menu.bookmark.id, { groupId: null }, Date.now())) }] : []),
              ...groups.filter((g) => g.id !== menu.bookmark.groupId).map((g) => ({ label: g.name, onSelect: () => commit((s) => updateBookmark(s, menu.bookmark.id, { groupId: g.id }, Date.now())) })),
            ] },
            ...(isHiddenFlag(menu.bookmark, now)
              ? [{ label: 'Unhide', onSelect: () => commit((s) => setBookmarkHidden(s, menu.bookmark.id, false, null, Date.now())) }]
              : [{ label: 'Hide…', children: HIDE_CHOICES.map((c) => ({
                  label: c.label,
                  onSelect: () => commit((s) => setBookmarkHidden(s, menu.bookmark.id, true, untilFor(c.days, Date.now()), Date.now()),
                    `Hid “${bookmarkLabel(menu.bookmark)}”. Find it again under 👁 Hidden.`),
                })) }]),
            { label: 'Delete', danger: true,
              onSelect: () => commit((s) => deleteBookmark(s, menu.bookmark.id), `Deleted “${bookmarkLabel(menu.bookmark)}”.`) },
          ]} />
        )}
      </main>
      <DragOverlay dropAnimation={{ duration: 160 }}>
        {dragging?.type === 'bookmark' && data.bookmarks[dragging.id] ? <TileView bookmark={data.bookmarks[dragging.id]} overlay /> : null}
        {dragging?.type === 'group' && dragging.id.startsWith('gsec:') ? <div className="group-overlay">⠿ {data.groups[dragging.id.slice(5)]?.name}</div> : null}
      </DragOverlay>
      </DndContext>

      {dialog && (
        <BookmarkDialog data={data} editing={dialog.editing} defaultGroupId={activeGroupId}
          onSave={save} onClose={() => setDialog(null)} />
      )}

      {styleGroupId && <GroupStyleDialog groupId={styleGroupId} onClose={() => setStyleGroupId(null)} />}
      {dataOpen && <DataDialog onClose={() => { setDataOpen(false); settingsBtn.current?.focus(); }} />}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => { setSettingsOpen(false); settingsBtn.current?.focus(); }}
          sync={sync} onOpenData={() => setDataOpen(true)} />
      )}


      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.undo && <button className="toast-btn" onClick={toast.undo}>Undo</button>}
          <button className="toast-close" aria-label="Dismiss" onClick={dismissToast}>×</button>
        </div>
      )}
    </div>
  );
}
