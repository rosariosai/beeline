import { describe, expect, it } from 'vitest';
import { emptyState } from '../src/core/types';
import {
  addBookmark, addGroup, bookmarksIn, deleteBookmark, deleteGroup, diffState, isEmptyDiff,
  renameGroup, revertChange, sortedGroups, updateBookmark,
} from '../src/core/ops';

const mk = (url: string, groupId: string | null = null) => ({ url, title: url, groupId });

describe('bookmark ops', () => {
  it('appends bookmarks in order within a group', () => {
    let s = emptyState();
    s = addBookmark(s, mk('https://a.com'), 'a', 1);
    s = addBookmark(s, mk('https://b.com'), 'b', 2);
    expect(bookmarksIn(s, null).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('moving to another group appends at the end of the target', () => {
    let s = addGroup(emptyState(), 'G', 'g', 0);
    s = addBookmark(s, mk('https://a.com', 'g'), 'a', 1);
    s = addBookmark(s, mk('https://b.com'), 'b', 2);
    s = updateBookmark(s, 'b', { groupId: 'g' }, 3);
    expect(bookmarksIn(s, 'g').map((b) => b.id)).toEqual(['a', 'b']);
    expect(bookmarksIn(s, null)).toEqual([]);
  });

  it('delete removes only that bookmark', () => {
    let s = addBookmark(emptyState(), mk('https://a.com'), 'a', 1);
    s = addBookmark(s, mk('https://b.com'), 'b', 1);
    s = deleteBookmark(s, 'a');
    expect(Object.keys(s.bookmarks)).toEqual(['b']);
  });
});

describe('group ops', () => {
  it('creates, renames (trimmed, ignores blank) and orders groups', () => {
    let s = addGroup(emptyState(), 'One', 'g1', 0);
    s = addGroup(s, 'Two', 'g2', 0);
    s = renameGroup(s, 'g1', '  Uno ');
    expect(renameGroup(s, 'g1', '   ')).toBe(s);
    expect(sortedGroups(s).map((g) => g.name)).toEqual(['Uno', 'Two']);
  });

  it('deleting a group keeps its bookmarks (moved to Ungrouped)', () => {
    let s = addGroup(emptyState(), 'G', 'g', 0);
    s = addBookmark(s, mk('https://a.com', 'g'), 'a', 1);
    s = deleteGroup(s, 'g', 2);
    expect(s.groups).toEqual({});
    expect(s.bookmarks.a.groupId).toBeNull();
  });
});

describe('diff + undo', () => {
  it('diff is empty for no-op and detects put/delete', () => {
    const a = addBookmark(emptyState(), mk('https://a.com'), 'a', 1);
    expect(isEmptyDiff(diffState(a, a))).toBe(true);
    const b = deleteBookmark(addBookmark(a, mk('https://b.com'), 'b', 1), 'a');
    const d = diffState(a, b);
    expect(d.put.bookmarks.map((x) => x.id)).toEqual(['b']);
    expect(d.del.bookmarks).toEqual(['a']);
  });

  it('revertChange restores the deleted record but keeps later unrelated edits', () => {
    const s0 = addBookmark(addBookmark(emptyState(), mk('https://a.com'), 'a', 1), mk('https://b.com'), 'b', 1);
    const s1 = deleteBookmark(s0, 'a'); // the destructive action
    const s2 = updateBookmark(s1, 'b', { title: 'Renamed' }, 5); // later edit
    const restored = revertChange(s2, s0, s1);
    expect(restored.bookmarks.a).toBe(s0.bookmarks.a);
    expect(restored.bookmarks.b.title).toBe('Renamed');
  });

  it('revertChange also undoes group deletion including bookmark moves', () => {
    let s0 = addGroup(emptyState(), 'G', 'g', 0);
    s0 = addBookmark(s0, mk('https://a.com', 'g'), 'a', 1);
    const s1 = deleteGroup(s0, 'g', 2);
    const restored = revertChange(s1, s0, s1);
    expect(restored.groups.g).toBeDefined();
    expect(restored.bookmarks.a.groupId).toBe('g');
  });
});

import { moveBookmark, moveGroup } from '../src/core/ops';

const ids = (s: ReturnType<typeof emptyState>, g: string | null) => bookmarksIn(s, g).map((b) => b.id);
function seeded() {
  let s = addGroup(addGroup(emptyState(), 'G1', 'g1', 0), 'G2', 'g2', 0);
  for (const [id, g] of [['a', 'g1'], ['b', 'g1'], ['c', 'g1'], ['x', 'g2'], ['y', 'g2'], ['u', null]] as const) {
    s = addBookmark(s, mk(`https://${id}.com`, g), id, 1);
  }
  return s;
}

describe('moveBookmark (drag and drop)', () => {
  it('reorders within a group, forwards and backwards', () => {
    expect(ids(moveBookmark(seeded(), 'a', 'g1', 2, 9), 'g1')).toEqual(['b', 'c', 'a']);
    expect(ids(moveBookmark(seeded(), 'c', 'g1', 0, 9), 'g1')).toEqual(['c', 'a', 'b']);
  });
  it('moves across groups at an index and closes the gap in the source', () => {
    const s = moveBookmark(seeded(), 'b', 'g2', 1, 9);
    expect(ids(s, 'g2')).toEqual(['x', 'b', 'y']);
    expect(ids(s, 'g1')).toEqual(['a', 'c']);
    expect(bookmarksIn(s, 'g1').map((b) => b.order)).toEqual([0, 1]);
    expect(s.bookmarks.b.groupId).toBe('g2');
  });
  it('can move to / from Ungrouped and into an empty group', () => {
    let s = addGroup(seeded(), 'G3', 'g3', 0);
    s = moveBookmark(s, 'u', 'g3', 0, 9);
    expect(ids(s, 'g3')).toEqual(['u']);
    expect(ids(s, null)).toEqual([]);
    s = moveBookmark(s, 'a', null, 0, 9);
    expect(ids(s, null)).toEqual(['a']);
  });
  it('clamps out-of-range indexes and ignores unknown ids', () => {
    expect(ids(moveBookmark(seeded(), 'a', 'g1', 99, 9), 'g1')).toEqual(['b', 'c', 'a']);
    const s = seeded();
    expect(moveBookmark(s, 'nope', 'g1', 0, 9)).toBe(s);
  });
  it('a no-op move changes nothing in the diff (nothing gets written)', () => {
    const s = seeded();
    expect(isEmptyDiff(diffState(s, moveBookmark(s, 'b', 'g1', 1, 9)))).toBe(true);
  });
  it('only touches records that actually changed', () => {
    const s = seeded();
    const d = diffState(s, moveBookmark(s, 'a', 'g1', 1, 9));
    expect(d.put.bookmarks.map((b) => b.id).sort()).toEqual(['a', 'b']);
  });
});

describe('moveGroup', () => {
  it('reorders groups', () => {
    const s = moveGroup(seeded(), 'g2', 0);
    expect(sortedGroups(s).map((g) => g.id)).toEqual(['g2', 'g1']);
  });
});
