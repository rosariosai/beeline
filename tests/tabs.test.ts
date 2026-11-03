import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, emptyState, type Tab } from '../src/core/types';
import { addBookmark, addGroup } from '../src/core/ops';
import { moveGroupToTab, ALL_TAB_ID, OTHER_TAB_ID, activeTabView, clampScale, cleanTabs, groupIdsIn, pruneTabs, showsUngrouped, tabViews, toggleGroupInTab } from '../src/core/tabs';
import { numberBookmarks } from '../src/core/numbering';
import { buildExportFile, parseExportFile } from '../src/core/exporting';
import { mergeView, viewOf } from '../src/core/syncfile';

const tabs: Tab[] = [{ id: 't1', name: 'Work', groupIds: ['g1', 'g2'] }, { id: 't2', name: 'Free time', groupIds: ['g2', 'g3'] }];
const ids = ['g1', 'g2', 'g3', 'g4'];

describe('tab views', () => {
  it('no tabs = no tab bar', () => expect(tabViews([], true, ids, true)).toEqual([]));
  it('keeps All first when asked', () => {
    expect(tabViews(tabs, true, ids, false).map((v) => v.id)).toEqual([ALL_TAB_ID, 't1', 't2']);
  });
  it('without All, unassigned groups go to an automatic Other tab (and only then)', () => {
    expect(tabViews(tabs, false, ids, false).map((v) => v.id)).toEqual(['t1', 't2', OTHER_TAB_ID]); // g4 is in no tab
    expect(tabViews(tabs, false, ['g1', 'g2', 'g3'], false).map((v) => v.id)).toEqual(['t1', 't2']);
    expect(tabViews(tabs, false, ['g1', 'g2', 'g3'], true).map((v) => v.id)).toEqual(['t1', 't2', OTHER_TAB_ID]); // loose bookmarks
  });
  it('falls back to the first tab when the remembered one is gone', () => {
    const v = tabViews(tabs, true, ids, false);
    expect(activeTabView(v, 't2')?.id).toBe('t2');
    expect(activeTabView(v, 'gone')?.id).toBe(ALL_TAB_ID);
    expect(activeTabView([], null)).toBeNull();
  });
  it('a group can be in several tabs; All shows everything; Other shows the rest', () => {
    const v = tabViews(tabs, false, ids, true);
    expect([...groupIdsIn(v[0], tabs, ids)!]).toEqual(['g1', 'g2']);
    expect([...groupIdsIn(v[1], tabs, ids)!]).toEqual(['g2', 'g3']);
    expect([...groupIdsIn(v[2], tabs, ids)!]).toEqual(['g4']);
    expect(groupIdsIn({ id: ALL_TAB_ID, name: 'All', kind: 'all' }, tabs, ids)).toBeNull();
    expect(showsUngrouped(v[0])).toBe(false);
    expect(showsUngrouped(v[2])).toBe(true);
  });
});

describe('editing tabs', () => {
  it('toggles a group in a tab and returns the same array when nothing changes', () => {
    const a = toggleGroupInTab(tabs, 't1', 'g3');
    expect(a[0].groupIds).toEqual(['g1', 'g2', 'g3']);
    expect(toggleGroupInTab(a, 't1', 'g3')[0].groupIds).toEqual(['g1', 'g2']);
    expect(toggleGroupInTab(tabs, 't1', 'g1', true)).toBe(tabs);
    expect(toggleGroupInTab(tabs, 'nope', 'g1')).toBe(tabs);
  });
  it('copies a group into a tab, or moves it out of the tab it came from', () => {
    const copy = moveGroupToTab(tabs, 'g1', 't2');
    expect(copy[0].groupIds).toContain('g1'); expect(copy[1].groupIds).toContain('g1');
    const moved = moveGroupToTab(tabs, 'g1', 't2', 't1');
    expect(moved[0].groupIds).toEqual(['g2']); expect(moved[1].groupIds).toEqual(['g2', 'g3', 'g1']);
    expect(moveGroupToTab(tabs, 'g2', 't1', 't1')).toBe(tabs); // same tab: nothing
    expect(moveGroupToTab(tabs, 'g2', 't2', 't1')[0].groupIds).toEqual(['g1']); // already in target: only leaves source
  });
  it('prunes groups that no longer exist', () => {
    expect(pruneTabs(tabs, new Set(['g2']))[0].groupIds).toEqual(['g2']);
  });
  it('cleans untrusted tabs: max 5, named, unique, known groups', () => {
    const raw = [...Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: ` Tab ${i} `, groupIds: ['g1', 'x', 'g1'] })), { id: 't0', name: 'dup' }, { id: '__all', name: 'bad' }, 5, null];
    const out = cleanTabs(raw, new Set(['g1']));
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ id: 't0', name: 'Tab 0', groupIds: ['g1'] });
    expect(cleanTabs('nope')).toEqual([]);
    expect(cleanTabs([{ id: 'a', name: '   ' }])).toEqual([]);
  });
  it('clamps the Preferred size to 1 to 4 in quarter steps', () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(9)).toBe(4);
    expect(clampScale(2.3)).toBe(2.25);
    expect(clampScale('x')).toBe(1.75);
  });
});

describe('tabs in the rest of the app', () => {
  const build = () => {
    let s = emptyState();
    s = addGroup(s, 'Work', 'g1', 1); s = addGroup(s, 'Music', 'g2', 2);
    s = addBookmark(s, { url: 'https://a.com', title: 'a', groupId: 'g1' }, 'a', 1);
    s = addBookmark(s, { url: 'https://b.com', title: 'b', groupId: 'g2' }, 'b', 1);
    s = addBookmark(s, { url: 'https://c.com', title: 'c', groupId: null }, 'c', 1);
    return s;
  };
  it('numbers only what the current tab shows', () => {
    const s = build();
    const n = numberBookmarks(s, { launchpadFirst: false, showHidden: false, now: 5, include: (g) => g === 'g2' });
    expect([...n]).toEqual([['b', 1]]);
    expect(numberBookmarks(s, { launchpadFirst: false, showHidden: false, now: 5 }).size).toBe(3);
  });
  it('tabs, All tab and Preferred size survive a backup', () => {
    const s = build();
    const set = { ...DEFAULT_SETTINGS, tabs: [{ id: 't', name: 'Work', groupIds: ['g1', 'gone'] }], showAllTab: false, preferredScale: 3 };
    const r = parseExportFile(JSON.stringify(buildExportFile(s, set, [], new Date(1))));
    expect(r.ok && r.file.settings).toMatchObject({ tabs: [{ id: 't', name: 'Work', groupIds: ['g1'] }], showAllTab: false, preferredScale: 3 });
  });
  it('an old backup without tabs gets the defaults', () => {
    const s = build();
    const f = JSON.parse(JSON.stringify(buildExportFile(s, DEFAULT_SETTINGS, [], new Date(1))));
    delete f.settings.tabs; delete f.settings.showAllTab; delete f.settings.preferredScale;
    const r = parseExportFile(JSON.stringify(f));
    expect(r.ok && r.file.settings).toMatchObject({ tabs: [], showAllTab: true, preferredScale: 1.75 });
  });
  it('tabs and size are view settings for sync', () => {
    const local = { ...viewOf(DEFAULT_SETTINGS), preferredScale: 3 };
    const remote = viewOf(DEFAULT_SETTINGS);
    const base = viewOf(DEFAULT_SETTINGS);
    expect(mergeView(base, local, remote).view.preferredScale).toBe(3); // changed only here: kept
    const withTabs = { ...remote, tabs: tabs };
    expect(mergeView(base, local, withTabs).view.tabs).toEqual(tabs);
  });
});
