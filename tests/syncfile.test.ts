import { describe, expect, it } from 'vitest';
import { emptyState, type DataState } from '../src/core/types';
import { addBookmark, addGroup, deleteBookmark, setGroupCollapsed, setPreferred, updateBookmark, recordOpen, moveBookmark } from '../src/core/ops';
import { mergeStates, sameState } from '../src/core/syncfile';

const bm = (s: DataState, id: string, url: string, groupId: string | null = null, t = 1) => addBookmark(s, { url, title: id, groupId }, id, t);
const sample = (): DataState => {
  let s = addGroup(emptyState(), 'Work', 'g', 1);
  s = bm(s, 'a', 'https://a.com/', 'g'); s = bm(s, 'b', 'https://b.com/', 'g'); s = bm(s, 'c', 'https://c.com/');
  return s;
};

describe('three-way merge', () => {
  it('no changes anywhere: nothing to write', () => {
    const s = sample();
    const r = mergeStates(s, s, s);
    expect(r.localChanged).toBe(false); expect(r.remoteChanged).toBe(false);
  });

  it('changes on different records from both sides are combined', () => {
    const base = sample();
    const local = setPreferred(base, 'a', true, 5);
    const remote = updateBookmark(base, 'b', { title: 'B2' }, 6);
    const r = mergeStates(base, local, remote);
    expect(r.state.bookmarks.a.preferred).toBe(true);
    expect(r.state.bookmarks.b.title).toBe('B2');
    expect(r.localChanged && r.remoteChanged).toBe(true);
  });

  it('the same record edited on both sides: newer updatedAt wins', () => {
    const base = sample();
    const local = updateBookmark(base, 'a', { title: 'older' }, 5);
    const remote = updateBookmark(base, 'a', { title: 'newer' }, 9);
    expect(mergeStates(base, local, remote).state.bookmarks.a.title).toBe('newer');
    expect(mergeStates(base, remote, local).state.bookmarks.a.title).toBe('newer');
  });

  it('deletions propagate in both directions', () => {
    const base = sample();
    const r1 = mergeStates(base, deleteBookmark(base, 'a'), base);
    expect(r1.state.bookmarks.a).toBeUndefined(); expect(r1.remoteChanged).toBe(true); expect(r1.localChanged).toBe(false);
    const r2 = mergeStates(base, base, deleteBookmark(base, 'b'));
    expect(r2.state.bookmarks.b).toBeUndefined(); expect(r2.localChanged).toBe(true); expect(r2.remoteChanged).toBe(false);
  });

  it('an edit beats a delete made on the other side', () => {
    const base = sample();
    const r = mergeStates(base, updateBookmark(base, 'a', { title: 'kept' }, 7), deleteBookmark(base, 'a'));
    expect(r.state.bookmarks.a.title).toBe('kept');
  });

  it('new records on both sides are all kept', () => {
    const base = sample();
    const r = mergeStates(base, bm(base, 'x', 'https://x.com/'), bm(base, 'y', 'https://y.com/'));
    expect(Object.keys(r.state.bookmarks).sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  it('group edits (collapse) travel; opens are summed by max, not lost', () => {
    const base = sample();
    const local = recordOpen(recordOpen(base, 'a', 10), 'a', 11);
    const remote = setGroupCollapsed(updateBookmark(base, 'a', { title: 'T' }, 12), 'g', true);
    const r = mergeStates(base, local, remote);
    expect(r.state.groups.g.collapsed).toBe(true);
    expect(r.state.bookmarks.a.title).toBe('T');
    expect(r.state.bookmarks.a.openCount).toBe(2);
  });

  it('a bookmark moved into a group that was deleted elsewhere falls back to Ungrouped', () => {
    const base = sample();
    const { g: _g, ...groups } = base.groups;
    const remote: DataState = { ...base, groups, bookmarks: Object.fromEntries(Object.entries(base.bookmarks).map(([k, v]) => [k, v.groupId === 'g' ? { ...v, groupId: null } : v])) };
    const local = moveBookmark(base, 'c', 'g', 0, 20);
    const r = mergeStates(base, local, remote);
    expect(Object.values(r.state.bookmarks).every((b) => b.groupId === null || r.state.groups[b.groupId])).toBe(true);
  });

  it('order numbers stay unique per group after both sides appended', () => {
    const base = sample();
    const r = mergeStates(base, bm(base, 'x', 'https://x.com/', 'g', 5), bm(base, 'y', 'https://y.com/', 'g', 6));
    const orders = Object.values(r.state.bookmarks).filter((b) => b.groupId === 'g').map((b) => b.order).sort();
    expect(orders).toEqual([0, 1, 2, 3]);
  });

  it('merging twice gives the same result (stable)', () => {
    const base = sample();
    const local = bm(setPreferred(base, 'a', true, 3), 'x', 'https://x.com/', 'g', 5);
    const remote = bm(base, 'y', 'https://y.com/', 'g', 6);
    const m1 = mergeStates(base, local, remote).state;
    const m2 = mergeStates(m1, m1, m1);
    expect(m2.localChanged || m2.remoteChanged).toBe(false);
    expect(sameState(m2.state, m1)).toBe(true);
  });
});

describe('first sync (no base)', () => {
  it('matches the same bookmarks, groups and tags imported separately in two browsers (no duplicates)', () => {
    let a = addGroup(emptyState(), 'Work', 'ga', 1); a = bm(a, 'a1', 'https://a.com/', 'ga'); a = bm(a, 'a2', 'https://only-a.com/', 'ga');
    let b = addGroup(emptyState(), 'work', 'gb', 1); b = bm(b, 'b1', 'https://www.a.com', 'gb'); b = bm(b, 'b2', 'https://only-b.com/', 'gb');
    const r = mergeStates(null, b, a); // b = this browser, a = the file
    expect(Object.keys(r.state.groups)).toEqual(['ga']);
    const urls = Object.values(r.state.bookmarks).map((x) => x.url).sort();
    expect(urls.length).toBe(3);
    expect(Object.values(r.state.bookmarks).every((x) => x.groupId === 'ga')).toBe(true);
  });

  it('an empty browser simply receives the file', () => {
    const file = sample();
    const r = mergeStates(null, emptyState(), file);
    expect(sameState(r.state, file)).toBe(true);
    expect(r.localChanged).toBe(true); expect(r.remoteChanged).toBe(false);
  });
});


import { CONTENT_SCOPE, DEFAULT_SCOPE, FULL_SCOPE, mergeView, viewOf } from '../src/core/syncfile';
import { setBookmarkHidden, setGroupHidden } from '../src/core/hidden';
import { DEFAULT_SETTINGS } from '../src/core/types';

describe('sync layers (what is synced)', () => {
  it('hidden off: a hide stays local, a title edit still travels, file keeps the others\' hidden values', () => {
    const base = sample();
    const local = setBookmarkHidden(base, 'a', true, null, 9);            // hidden here only
    const remote = updateBookmark(setBookmarkHidden(base, 'c', true, null, 3), 'b', { title: 'B2' }, 4); // other browser: hid c, renamed b
    const r = mergeStates(base, local, remote, DEFAULT_SCOPE);
    expect(r.state.bookmarks.a.hidden).toBe(true);        // mine stays
    expect(r.state.bookmarks.c.hidden).toBeUndefined();   // theirs not adopted
    expect(r.state.bookmarks.b.title).toBe('B2');         // content travels
    expect(r.fileState.bookmarks.c.hidden).toBe(true);    // the file keeps their hide
    expect(r.fileState.bookmarks.a.hidden).toBeUndefined(); // and not mine
  });

  it('a local-only change (hidden off) does not count as a change to write', () => {
    const base = sample();
    const local = setGroupHidden(base, 'g', true, null);
    const r = mergeStates(base, local, base, DEFAULT_SCOPE);
    expect(r.remoteChanged).toBe(false); expect(r.localChanged).toBe(false);
    expect(r.state.groups.g.hidden).toBe(true);
  });

  it('a hide here must not undo a newer title edit made elsewhere', () => {
    const base = sample();
    const local = setBookmarkHidden(base, 'a', true, null, 50);            // updatedAt 50, only "hidden" differs
    const remote = updateBookmark(base, 'a', { title: 'New' }, 20);
    const r = mergeStates(base, local, remote, DEFAULT_SCOPE);
    expect(r.state.bookmarks.a.title).toBe('New');
    expect(r.state.bookmarks.a.hidden).toBe(true);
  });

  it('content only: Preferred and colours stay local; new bookmarks arrive at the end', () => {
    const base = sample();
    const local = setPreferred(base, 'a', true, 5);
    let remote = bm(base, 'n', 'https://n.com/', 'g', 6);
    remote = setPreferred(remote, 'b', true, 7);
    const r = mergeStates(base, local, remote, CONTENT_SCOPE);
    expect(r.state.bookmarks.n).toBeTruthy();
    expect(r.state.bookmarks.n.order).toBeGreaterThan(r.state.bookmarks.b.order);
    expect(r.state.bookmarks.a.preferred).toBe(true);
    expect(r.state.bookmarks.b.preferred).toBeUndefined();
    expect(r.fileState.bookmarks.b.preferred).toBe(true);
    expect(r.fileState.bookmarks.a.preferred).toBeUndefined();
  });

  it('full scope behaves as before (both sides equal)', () => {
    const base = sample();
    const r = mergeStates(base, setPreferred(base, 'a', true, 5), updateBookmark(base, 'b', { title: 'B2' }, 6), FULL_SCOPE);
    expect(sameState(r.state, r.fileState)).toBe(true);
  });

  it('view settings merge key by key', () => {
    const b = viewOf(DEFAULT_SETTINGS);
    const l = { ...b, layout: 'icons' as const };
    const rm = { ...b, tileSize: 'l' as const };
    const m = mergeView(b, l, rm);
    expect(m.view.layout).toBe('icons'); expect(m.view.tileSize).toBe('l');
    expect(m.localChanged && m.remoteChanged).toBe(true);
  });
});

import { dedupeTopGroups } from '../src/core/topgroups';
describe('duplicate Top groups', () => {
  it('merges same-named Top groups, keeps the oldest, moves bookmarks, is deterministic', () => {
    let s = addGroup(emptyState(), 'Top Brave', 'b1', 1);
    s = addGroup(s, 'Top Brave', 'b2', 5);
    s = addGroup(s, 'Work', 'w', 6);
    s = addGroup(s, 'work', 'w2', 7);       // not a Top group: untouched
    s = bm(s, 'x', 'https://x.com/', 'b2'); s = bm(s, 'y', 'https://y.com/', 'b1');
    const d = dedupeTopGroups(s);
    expect(Object.keys(d.groups).sort()).toEqual(['b1', 'w', 'w2']);
    expect(d.bookmarks.x.groupId).toBe('b1');
    expect(new Set([d.bookmarks.x.order, d.bookmarks.y.order]).size).toBe(2);
    expect(dedupeTopGroups(d)).toBe(d);
  });
  it('a sync of two browsers that each created their Top groups ends with one of each', () => {
    const mk = (suffix: string) => ['Chrome', 'Brave', 'Firefox'].reduce((s, n, i) => addGroup(s, `Top ${n}`, `${n}${suffix}`, 10 + i + (suffix === 'B' ? 1 : 0)), emptyState());
    const base = mk('A'), remote = mk('B');
    const r = mergeStates(base, base, remote);
    expect(Object.values(r.state.groups).map((g) => g.name).sort()).toEqual(['Top Brave', 'Top Chrome', 'Top Firefox']);
    expect(sameState(r.state, r.fileState)).toBe(true);
  });
});
