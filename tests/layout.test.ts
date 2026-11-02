import { describe, expect, it } from 'vitest';
import { emptyState, DEFAULT_SETTINGS } from '../src/core/types';
import { addBookmark } from '../src/core/ops';
import { buildExportFile, buildNetscapeHtml, parseExportFile } from '../src/core/exporting';
import { bookmarkLabel } from '../src/core/url';

describe('empty titles and layout settings', () => {
  const s = addBookmark(emptyState(), { url: 'https://www.example.com/a', title: '', groupId: null }, 'a', 1);
  it('an empty title falls back to the site name only for labels', () => {
    expect(s.bookmarks.a.title).toBe('');
    expect(bookmarkLabel(s.bookmarks.a)).toBe('example.com');
  });
  it('empty titles survive a backup round trip', () => {
    const r = parseExportFile(JSON.stringify(buildExportFile(s, DEFAULT_SETTINGS, [], new Date(1))));
    expect(r.ok && r.file.bookmarks[0].title).toBe('');
  });
  it('browser export never writes an empty link text', () => {
    expect(buildNetscapeHtml(s, new Date(1))).toContain('>example.com</A>');
  });
  it('settings keep the new options, with safe defaults for old backups', () => {
    const f = JSON.parse(JSON.stringify(buildExportFile(s, { ...DEFAULT_SETTINGS, defaultTitle: false, sidebar: false, groupsPerRow: 'many' }, [], new Date(1))));
    const r = parseExportFile(JSON.stringify(f));
    expect(r.ok && r.file.settings).toMatchObject({ defaultTitle: false, sidebar: false, groupsPerRow: 'many' });
    delete f.settings.defaultTitle; delete f.settings.sidebar; delete f.settings.groupsPerRow;
    const old = parseExportFile(JSON.stringify(f));
    expect(old.ok && old.file.settings).toMatchObject({ defaultTitle: true, sidebar: true, groupsPerRow: 'one' });
  });
});
