import { describe, expect, it } from 'vitest';
import { cleanMark, firstChar, markHex, MARK_COLORS } from '../src/core/mark';
import { emptyState, DEFAULT_SETTINGS } from '../src/core/types';
import { addBookmark, duplicateBookmark, updateBookmark } from '../src/core/ops';
import { buildExportFile, parseExportFile, stateFromExport } from '../src/core/exporting';

describe('icon label (mark)', () => {
  it('offers exactly four colours with valid hex values', () => {
    expect(MARK_COLORS.map((c) => c.id)).toEqual(['white', 'black', 'yellow', 'red']);
    for (const c of MARK_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(markHex('red')).toBe('#ef4444');
  });
  it('keeps a single character and ignores spaces', () => {
    expect(firstChar('  2 ')).toBe('2');
    expect(firstChar('')).toBe('');
    expect(firstChar('😀x')).toBe('😀');
  });
  it('cleanMark accepts a valid mark and rejects anything else', () => {
    expect(cleanMark({ char: '3', color: 'yellow' })).toEqual({ char: '3', color: 'yellow' });
    expect(cleanMark({ char: '😀', color: 'red' })).toEqual({ char: '😀', color: 'red' });
    expect(cleanMark({ char: '33', color: 'red' })).toBeUndefined();
    expect(cleanMark({ char: '', color: 'red' })).toBeUndefined();
    expect(cleanMark({ char: '3', color: 'pink' })).toBeUndefined();
    expect(cleanMark({ char: '3', color: '#ff0000' })).toBeUndefined();
    expect(cleanMark({ char: 3, color: 'red' })).toBeUndefined();
    expect(cleanMark('3')).toBeUndefined();
    expect(cleanMark(null)).toBeUndefined();
  });
  it('can be set, changed, cleared and is copied by duplicate', () => {
    let s = addBookmark(emptyState(), { url: 'https://zima.example.com/', title: 'Zima 1', groupId: null, mark: { char: '1', color: 'white' } }, 'b1', 1);
    expect(s.bookmarks.b1.mark).toEqual({ char: '1', color: 'white' });
    s = duplicateBookmark(s, 'b1', 'b2', 2);
    expect(s.bookmarks.b2.mark).toEqual({ char: '1', color: 'white' });
    s = updateBookmark(s, 'b2', { mark: { char: '2', color: 'red' } }, 3);
    expect(s.bookmarks.b1.mark?.char).toBe('1');
    expect(s.bookmarks.b2.mark).toEqual({ char: '2', color: 'red' });
    s = updateBookmark(s, 'b2', { mark: undefined }, 4);
    expect(s.bookmarks.b2.mark).toBeUndefined();
  });
  it('survives a backup round trip, and a hostile mark in a backup is dropped', () => {
    const s = addBookmark(emptyState(), { url: 'https://zima.example.com/', title: 'Zima', groupId: null, mark: { char: 'B', color: 'black' } }, 'b1', 1);
    const text = JSON.stringify(buildExportFile(s, DEFAULT_SETTINGS, [], new Date('2026-11-03T00:00:00Z')));
    const r = parseExportFile(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(stateFromExport(r.file).bookmarks.b1.mark).toEqual({ char: 'B', color: 'black' });
    const bad = JSON.parse(text);
    bad.bookmarks[0].mark = { char: '<script>', color: 'red' };
    const r2 = parseExportFile(JSON.stringify(bad));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(stateFromExport(r2.file).bookmarks.b1.mark).toBeUndefined();
  });
});
