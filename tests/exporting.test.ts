import { describe, expect, it } from 'vitest';
import { emptyState, DEFAULT_SETTINGS } from '../src/core/types';
import { addBookmark, addGroup } from '../src/core/ops';
import { ensureTags } from '../src/core/tags';
import { applyImport, parseNetscapeHtml, planImport } from '../src/core/importing';
import { buildExportFile, buildNetscapeHtml, exportToImported, parseExportFile, stateFromExport } from '../src/core/exporting';

let n = 0;
const gen = () => `x${++n}`;
function sample() {
  n = 0;
  let s = addGroup(addGroup(emptyState(), 'Work & Play', 'g1', 1), 'Empty', 'g2', 2);
  const r = ensureTags(s, ['design', 'a,b'], 1, gen); s = r.state;
  s = addBookmark(s, { url: 'https://figma.com/?a=1&b=2', title: 'Fig <ma> "x"', groupId: 'g1', tagIds: r.ids, description: 'Tool & more', icon: { kind: 'builtin', glyph: 'star', color: '#fff' } }, 'b1', 1_600_000_000_000);
  s = addBookmark(s, { url: 'https://loose.example.com/', title: 'Loose', groupId: null, icon: { kind: 'image', imageId: 'img1' } }, 'b2', 1_600_000_100_000);
  return s;
}
const IMG = { id: 'img1', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
const NOW = new Date('2026-10-28T10:00:00Z');

describe('JSON export / import', () => {
  const file = buildExportFile(sample(), { ...DEFAULT_SETTINGS, theme: 'dark' }, [IMG, { ...IMG, id: 'unused' }], NOW);
  it('round-trips through text with everything intact (only referenced images kept)', () => {
    const r = parseExportFile(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.images.map((i) => i.id)).toEqual(['img1']);
    expect(stateFromExport(r.file)).toEqual(sample());
    expect(r.file.settings.theme).toBe('dark');
  });
  it('rejects garbage, foreign JSON, and newer schema versions with clear messages', () => {
    expect(parseExportFile('{{{')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
    expect(parseExportFile('{"hello":1}')).toMatchObject({ ok: false, error: 'This is not a Beeline (or Tilenest) backup file.' });
    expect(parseExportFile('[1,2]')).toMatchObject({ ok: false });
    expect(parseExportFile(JSON.stringify({ ...file, schemaVersion: 99 }))).toMatchObject({ ok: false, error: expect.stringContaining('newer version') });
    expect(parseExportFile(JSON.stringify({ app: 'tilenest', schemaVersion: 1 }))).toMatchObject({ ok: false });
  });
  it('drops invalid records and dangling references instead of trusting them', () => {
    const bad = JSON.parse(JSON.stringify(file));
    bad.bookmarks.push({ id: 'evil', url: 'javascript:alert(1)', title: 'x' }, { nope: true }, 'str');
    bad.bookmarks[0].groupId = 'ghost';
    bad.bookmarks[0].tagIds = ['ghost', ...bad.bookmarks[0].tagIds];
    bad.bookmarks[1].icon = { kind: 'image', imageId: 'missing' };
    bad.images.push({ id: 'x', mime: 'text/html', dataUrl: 'data:text/html,<script>' });
    const r = parseExportFile(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.bookmarks).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/3 invalid entries/);
    expect(r.file.bookmarks[0].groupId).toBeNull();
    expect(r.file.bookmarks[0].tagIds).not.toContain('ghost');
    expect(r.file.bookmarks.find((b) => b.id === 'b2')!.icon).toEqual({ kind: 'auto' });
    expect(r.file.images.map((i) => i.id)).toEqual(['img1']);
  });
  it('merge mode: restoring into the same data adds nothing; into empty data reproduces it', () => {
    const items = exportToImported(file);
    expect(planImport(sample(), items, null, { emptyPathGroup: null }).toAdd).toEqual([]);
    const out = applyImport(emptyState(), items, NOW.getTime(), gen, { emptyPathGroup: null });
    expect(Object.values(out.bookmarks).map((b) => b.title).sort()).toEqual(['Fig <ma> "x"', 'Loose']);
    const fig = Object.values(out.bookmarks).find((b) => b.title.startsWith('Fig'))!;
    expect(out.groups[fig.groupId!].name).toBe('Work & Play');
    expect(fig.icon).toEqual({ kind: 'builtin', glyph: 'star', color: '#fff' });
    expect(Object.values(out.bookmarks).find((b) => b.title === 'Loose')!.groupId).toBeNull();
  });
});

describe('Netscape HTML export', () => {
  const html = buildNetscapeHtml(sample(), NOW);
  it('is a standards-shaped file with escaped content', () => {
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    // group createdAt (1 ms) is implausible, so it is exported as the export time
    expect(html).toContain(`<H3 ADD_DATE="${Math.floor(NOW.getTime() / 1000)}">Work &amp; Play</H3>`);
    expect(html).toContain('HREF="https://figma.com/?a=1&amp;b=2"');
    expect(html).not.toContain('<ma>');
    expect(html).not.toContain('>Empty<'); // empty groups are not exported
  });
  it('round-trips through our own parser: folders, titles, tags, descriptions, dates', () => {
    const { items } = parseNetscapeHtml(html);
    expect(items.map((i) => [i.title, i.folderPath.join('/'), i.tags.join('|'), i.description ?? '', i.addedAt])).toEqual([
      ['Fig <ma> "x"', 'Work & Play', 'design|a b', 'Tool & more', 1_600_000_000_000],
      ['Loose', '', '', '', 1_600_000_100_000],
    ]);
  });
  it('empty dashboard exports a valid empty file', () => {
    expect(parseNetscapeHtml(buildNetscapeHtml(emptyState(), NOW)).items).toEqual([]);
  });
});

describe('backups from the full Tilenest (with calendar notes)', () => {
  it('are accepted: bookmarks load and the calendar part is ignored', () => {
    const f = JSON.parse(JSON.stringify(buildExportFile(sample(), DEFAULT_SETTINGS, [], NOW)));
    f.events = [{ id: 'e1', date: '2027-01-05', title: 'Dentist' }];
    f.calendar = { saints: false };
    const r = parseExportFile(JSON.stringify(f));
    expect(r.ok && r.file.bookmarks.length).toBe(Object.keys(sample().bookmarks).length);
    expect(r.ok && (r.file as unknown as Record<string, unknown>).events).toBeUndefined();
    expect(r.ok && r.warnings).toEqual([]);
  });
});

describe('showTags setting', () => {
  it('round-trips and defaults to true', () => {
    expect(DEFAULT_SETTINGS.showTags).toBe(true);
    const r = parseExportFile(JSON.stringify(buildExportFile(emptyState(), { ...DEFAULT_SETTINGS, showTags: false }, [], new Date(0))));
    expect(r.ok && r.file.settings.showTags).toBe(false);
  });
});
