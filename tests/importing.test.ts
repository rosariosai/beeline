import { describe, expect, it } from 'vitest';
import { emptyState } from '../src/core/types';
import { addBookmark, addGroup, bookmarksIn, sortedGroups } from '../src/core/ops';
import { ensureTags } from '../src/core/tags';
import {
  applyImport, folderList, fromBrowserTree, parseNetscapeHtml, pathKey, planImport, urlKey, type ImportedBookmark,
} from '../src/core/importing';

let n = 0;
const gen = () => `id${++n}`;
const NOW = 1_800_000_000_000;
const item = (url: string, folderPath: string[] = [], extra: Partial<ImportedBookmark> = {}): ImportedBookmark =>
  ({ url, title: url, folderPath, tags: [], ...extra });

describe('urlKey', () => {
  it('ignores scheme, www, fragment, trailing slash, host case; keeps query', () => {
    const k = urlKey('https://www.Example.com/a/#top');
    expect(urlKey('http://example.com/a')).toBe(k);
    expect(urlKey('https://example.com/a?x=1')).not.toBe(k);
    expect(urlKey('https://example.com:8080/a')).not.toBe(k);
  });
});

describe('fromBrowserTree', () => {
  const tree = [{ title: '', children: [
    { title: 'Bookmarks bar', children: [
      { title: 'GitHub', url: 'https://github.com/', dateAdded: 1_600_000_000_000 },
      { title: 'Work', children: [{ title: 'Jira', url: 'https://jira.example.com' }, { title: 'Design', children: [{ title: 'Figma', url: 'https://figma.com' }] }] },
      { title: 'bad', url: 'javascript:alert(1)' },
    ] },
    { title: 'Other bookmarks', children: [{ title: '', url: 'https://noname.com' }, { title: 'x', url: 'chrome://settings' }] },
  ] }];
  it('flattens nested folders to paths, skips non-web URLs, ignores the unnamed root', () => {
    const { items, skipped } = fromBrowserTree(tree);
    expect(skipped).toBe(2);
    expect(items.map((i) => [i.title, i.folderPath.join('/')])).toEqual([
      ['GitHub', 'Bookmarks bar'], ['Jira', 'Bookmarks bar/Work'], ['Figma', 'Bookmarks bar/Work/Design'], ['noname.com', 'Other bookmarks'],
    ]);
    expect(items[0].addedAt).toBe(1_600_000_000_000);
  });
});

const CHROME_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1600000000" LAST_MODIFIED="1600000001" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://github.com/" ADD_DATE="1600000002" ICON="data:image/png;base64,AAAA">GitHub &amp; Co</A>
        <DT><H3 ADD_DATE="1600000003">Work</H3>
        <DL><p>
            <DT><A HREF="https://jira.example.com/" TAGS="Project, work ,">Jira</A>
            <DD>Tickets &quot;now&quot;
        </DL><p>
    </DL><p>
    <DT><A HREF="javascript:void(0)">Bookmarklet</A>
    <DT><A HREF="https://loose.example.org">Loose</A>
</DL><p>`;

describe('parseNetscapeHtml', () => {
  const { items, skipped } = parseNetscapeHtml(CHROME_HTML);
  it('reads folders, titles, entities, dates, tags, descriptions', () => {
    expect(items.map((i) => [i.title, i.folderPath.join('/')])).toEqual([
      ['GitHub & Co', 'Bookmarks bar'], ['Jira', 'Bookmarks bar/Work'], ['Loose', ''],
    ]);
    expect(items[0].addedAt).toBe(1_600_000_002_000);
    expect(items[1].tags).toEqual(['Project', 'work']);
    expect(items[1].description).toBe('Tickets "now"');
  });
  it('skips non-web links and counts them', () => expect(skipped).toBe(1));
  it('survives lowercase tags, missing closers and junk', () => {
    const r = parseNetscapeHtml('<dl><dt><h3>F</h3><dl><dt><a href=https://a.com>A</a><dt><a href="https://b.com">B</dl></dl> <p>garbage<');
    expect(r.items.map((i) => [i.title, i.folderPath.join('/')])).toEqual([['A', 'F'], ['B', 'F']]);
    expect(parseNetscapeHtml('').items).toEqual([]);
    expect(parseNetscapeHtml('not html at all').items).toEqual([]);
  });
});

describe('folderList', () => {
  it('lists every level with direct counts', () => {
    const f = folderList(parseNetscapeHtml(CHROME_HTML).items);
    expect(f.map((x) => [x.path.join('/'), x.count])).toEqual([['Bookmarks bar', 1], ['Bookmarks bar/Work', 1], ['', 1]]);
  });
});

function existing() {
  let s = addGroup(emptyState(), 'Work', 'g1', 0);
  const r = ensureTags(s, ['Project'], 0, () => 'tagP'); s = r.state;
  s = addBookmark(s, { url: 'https://github.com', title: 'GH', groupId: 'g1', tagIds: r.ids }, 'b1', 1);
  return s;
}

describe('planImport', () => {
  const items = [item('https://www.github.com/'), item('https://new.com', ['Work']), item('https://new.com/#frag', ['Work']), item('https://other.com', ['A', 'B'])];
  it('skips duplicates of existing bookmarks and repeats inside the import', () => {
    const p = planImport(existing(), items, null);
    expect(p.toAdd.map((i) => i.url)).toEqual(['https://new.com', 'https://other.com']);
    expect(p.duplicates).toBe(2);
    expect(p.newGroups).toEqual(['A / B', 'Imported'].filter((g) => g !== 'Imported')); // "Work" exists; loose item was a dupe
  });
  it('honours folder selection (a bookmark belongs to its own folder only)', () => {
    const p = planImport(existing(), items, new Set([pathKey(['A', 'B'])]));
    expect(p.toAdd.map((i) => i.url)).toEqual(['https://other.com']);
  });
  it('empty selection imports nothing', () => expect(planImport(existing(), items, new Set()).toAdd).toEqual([]));
});

describe('applyImport', () => {
  it('is idempotent: importing the same file twice adds nothing the second time', () => {
    const items = parseNetscapeHtml(CHROME_HTML).items;
    const s1 = applyImport(emptyState(), planImport(emptyState(), items, null).toAdd, NOW, gen);
    expect(Object.keys(s1.bookmarks)).toHaveLength(3);
    const p2 = planImport(s1, items, null);
    expect(p2.toAdd).toEqual([]);
    expect(p2.duplicates).toBe(3);
  });
  it('creates one group per folder path, reuses same-name groups case-insensitively, appends order', () => {
    const s = existing();
    const out = applyImport(s, [item('https://a.com', ['work']), item('https://b.com', ['Work']), item('https://c.com', ['X', 'Y'])], NOW, gen);
    expect(sortedGroups(out).map((g) => g.name)).toEqual(['Work', 'X / Y']);
    expect(bookmarksIn(out, 'g1').map((b) => b.url)).toEqual(['https://github.com', 'https://a.com', 'https://b.com']);
    expect(bookmarksIn(out, 'g1').map((b) => b.order)).toEqual([0, 1, 2]);
  });
  it('loose items go to "Imported" (or Ungrouped when asked); tags are shared/deduped; dates sanitised', () => {
    const out = applyImport(existing(), [
      item('https://a.com', [], { tags: ['project', 'New', 'new'], addedAt: 1_600_000_000_000 }),
      item('https://b.com', [], { addedAt: 5 }),                 // implausible -> now
      item('https://c.com', [], { addedAt: NOW + 1e9 }),         // future -> now
    ], NOW, gen);
    const imp = sortedGroups(out).find((g) => g.name === 'Imported')!;
    const [a, b, c] = bookmarksIn(out, imp.id);
    expect(a.tagIds).toHaveLength(2);
    expect(a.tagIds).toContain('tagP');
    expect(a.createdAt).toBe(1_600_000_000_000);
    expect([b.createdAt, c.createdAt]).toEqual([NOW, NOW]);
    const flat = applyImport(emptyState(), [item('https://z.com')], NOW, gen, { emptyPathGroup: null });
    expect(Object.values(flat.bookmarks)[0].groupId).toBeNull();
    expect(Object.keys(flat.groups)).toHaveLength(0);
  });
  it('does not mutate the input state', () => {
    const s = existing();
    const before = JSON.stringify(s);
    applyImport(s, [item('https://a.com', ['New'])], NOW, gen);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('bulk import of 5,000 bookmarks is fast (O(n))', () => {
    const many = Array.from({ length: 5000 }, (_, i) => item(`https://site${i}.com/p`, [`F${i % 50}`], { tags: [`t${i % 20}`] }));
    const t = performance.now();
    const plan = planImport(emptyState(), many, null);
    const out = applyImport(emptyState(), plan.toAdd, NOW, gen);
    expect(performance.now() - t).toBeLessThan(500);
    expect(Object.keys(out.bookmarks)).toHaveLength(5000);
    expect(Object.keys(out.groups)).toHaveLength(50);
    expect(Object.keys(out.tags)).toHaveLength(20);
  });
});
