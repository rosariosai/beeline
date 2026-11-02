import { describe, expect, it } from 'vitest';
import { emptyState } from '../src/core/types';
import { addBookmark, addGroup } from '../src/core/ops';
import { hiddenCount, isBookmarkHidden, setBookmarkHidden, setGroupHidden, untilFor, DAY_MS } from '../src/core/hidden';
import { buildExportFile, parseExportFile } from '../src/core/exporting';
import { DEFAULT_SETTINGS } from '../src/core/types';

const base = () => {
  let s = addGroup(emptyState(), 'Summer', 'g1', 1);
  s = addBookmark(s, { url: 'https://a.test/', title: 'A', groupId: 'g1', icon: { kind: 'auto' } }, 'a', 1);
  s = addBookmark(s, { url: 'https://b.test/', title: 'B', groupId: null, icon: { kind: 'auto' } }, 'b', 1);
  return s;
};

describe('hiding', () => {
  it('hides a bookmark until unhidden', () => {
    const s = setBookmarkHidden(base(), 'b', true, null, 5);
    expect(isBookmarkHidden(s, s.bookmarks.b, 10 ** 12)).toBe(true);
    const u = setBookmarkHidden(s, 'b', false, null, 6);
    expect(isBookmarkHidden(u, u.bookmarks.b, 10)).toBe(false);
    expect('hidden' in u.bookmarks.b).toBe(false);
  });
  it('comes back by itself after the date', () => {
    const now = 1_000_000;
    const s = setBookmarkHidden(base(), 'b', true, untilFor(30, now), now);
    expect(isBookmarkHidden(s, s.bookmarks.b, now + 29 * DAY_MS)).toBe(true);
    expect(isBookmarkHidden(s, s.bookmarks.b, now + 31 * DAY_MS)).toBe(false);
  });
  it('a hidden group hides its bookmarks and counts once each', () => {
    const s = setGroupHidden(base(), 'g1', true, null);
    expect(isBookmarkHidden(s, s.bookmarks.a, 1)).toBe(true);
    expect(isBookmarkHidden(s, s.bookmarks.b, 1)).toBe(false);
    expect(hiddenCount(s, 1)).toBe(2); // bookmark a + group g1
  });
  it('survives backup and restore', () => {
    let s = setGroupHidden(base(), 'g1', true, 5000);
    s = setBookmarkHidden(s, 'b', true, null, 3);
    const file = buildExportFile(s, DEFAULT_SETTINGS, [], new Date(1));
    const r = parseExportFile(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.groups[0]).toMatchObject({ hidden: true, hiddenUntil: 5000 });
    expect(r.file.bookmarks.find((b) => b.id === 'b')).toMatchObject({ hidden: true });
    expect(r.file.settings.layout).toBe('tiles');
  });
});
