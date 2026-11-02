import { describe, expect, it } from 'vitest';
import { emptyState } from '../src/core/types';
import { addBookmark, deleteBookmark, diffState, revertChange, updateBookmark } from '../src/core/ops';
import {
  deleteTag, ensureTags, findTagByName, matchesTags, normalizeTagName, renameTag, sortedTags, tagCounts,
} from '../src/core/tags';

let n = 0;
const gen = () => `t${++n}`;
const base = () => {
  n = 0;
  let s = emptyState();
  const r1 = ensureTags(s, ['Design', 'tools'], 1, gen); s = r1.state;
  const r2 = ensureTags(s, ['design', 'News'], 1, gen); s = r2.state;
  s = addBookmark(s, { url: 'https://a.com', title: 'A', groupId: null, tagIds: r1.ids }, 'a', 1); // Design, tools
  s = addBookmark(s, { url: 'https://b.com', title: 'B', groupId: null, tagIds: r2.ids }, 'b', 1); // Design, News
  s = addBookmark(s, { url: 'https://c.com', title: 'C', groupId: null }, 'c', 1);
  return s;
};

describe('normalizeTagName', () => {
  it('trims, collapses spaces, strips #, caps length', () => {
    expect(normalizeTagName('  #  Web   design ')).toBe('Web design');
    expect(normalizeTagName('###')).toBe('');
    expect(normalizeTagName('x'.repeat(50))).toHaveLength(32);
  });
});

describe('ensureTags', () => {
  it('reuses existing tags case-insensitively and dedupes', () => {
    const s = base();
    expect(Object.keys(s.tags)).toHaveLength(3); // Design, tools, News (design reused)
    const r = ensureTags(s, ['DESIGN', 'design', ' Tools ', ''], 2, gen);
    expect(r.ids).toEqual([findTagByName(s, 'Design')!.id, findTagByName(s, 'tools')!.id]);
    expect(r.state).toBe(s); // nothing new => same reference
  });
  it('creates new tags with the first spelling', () => {
    const r = ensureTags(emptyState(), ['Sci-Fi', 'sci-fi'], 5, gen);
    expect(Object.values(r.state.tags).map((t) => t.name)).toEqual(['Sci-Fi']);
  });
});

describe('rename / merge / delete', () => {
  it('renames a tag', () => {
    const s = base();
    const id = findTagByName(s, 'tools')!.id;
    expect(renameTag(s, id, 'Utilities').tags[id].name).toBe('Utilities');
  });
  it('ignores blank or unchanged names', () => {
    const s = base();
    const id = findTagByName(s, 'tools')!.id;
    expect(renameTag(s, id, '  ')).toBe(s);
    expect(renameTag(s, id, 'tools')).toBe(s);
  });
  it('renaming onto an existing name merges tags without duplicates', () => {
    const s = base();
    const design = findTagByName(s, 'Design')!.id, tools = findTagByName(s, 'tools')!.id;
    const m = renameTag(s, tools, 'design');
    expect(m.tags[tools]).toBeUndefined();
    expect(m.bookmarks.a.tagIds).toEqual([design]); // had Design + tools -> single Design
    expect(tagCounts(m)[design]).toBe(2);
  });
  it('deleting a tag removes it from all bookmarks, leaving others untouched', () => {
    const s = base();
    const design = findTagByName(s, 'Design')!.id;
    const d = deleteTag(s, design);
    expect(d.tags[design]).toBeUndefined();
    expect(d.bookmarks.a.tagIds).toHaveLength(1);
    expect(d.bookmarks.c).toBe(s.bookmarks.c);
  });
  it('undo of a tag delete restores the tag and its assignments', () => {
    const s0 = base();
    const design = findTagByName(s0, 'Design')!.id;
    const s1 = deleteTag(s0, design);
    const s2 = updateBookmark(s1, 'c', { title: 'C2' }, 9);
    const back = revertChange(s2, s0, s1);
    expect(back.tags[design]).toBeDefined();
    expect(back.bookmarks.a.tagIds).toContain(design);
    expect(back.bookmarks.c.title).toBe('C2');
  });
});

describe('counts, sorting, filtering', () => {
  it('counts usage including zero', () => {
    let s = base();
    const news = findTagByName(s, 'News')!.id;
    s = deleteBookmark(s, 'b');
    expect(tagCounts(s)[news]).toBe(0);
  });
  it('sorts tags alphabetically ignoring case', () => {
    expect(sortedTags(base()).map((t) => t.name)).toEqual(['Design', 'News', 'tools']);
  });
  it('AND filter: more selected tags narrows results', () => {
    const s = base();
    const design = findTagByName(s, 'Design')!.id, tools = findTagByName(s, 'tools')!.id;
    const all = Object.values(s.bookmarks);
    expect(all.filter((b) => matchesTags(b, [])).length).toBe(3);
    expect(all.filter((b) => matchesTags(b, [design])).map((b) => b.id)).toEqual(['a', 'b']);
    expect(all.filter((b) => matchesTags(b, [design, tools])).map((b) => b.id)).toEqual(['a']);
  });
  it('tag-only edits write only the affected bookmarks', () => {
    const s = base();
    const d = diffState(s, deleteTag(s, findTagByName(s, 'tools')!.id));
    expect(d.put.bookmarks.map((b) => b.id)).toEqual(['a']);
    expect(d.del.tags).toHaveLength(1);
  });
});

describe('tagGroupsByName', () => {
  it('tags every bookmark of a group with its lowercase name, reusing and creating tags', async () => {
    const { addGroup } = await import('../src/core/ops');
    const { tagGroupsByName } = await import('../src/core/tags');
    n = 0;
    let s = emptyState();
    s = addGroup(s, 'News', 'g1', 1); s = addGroup(s, 'Bookmarks bar / Lan', 'g2', 1); s = addGroup(s, 'Empty', 'g3', 1);
    s = addBookmark(s, { url: 'https://a.com', title: 'A', groupId: 'g1' }, 'a', 1);
    s = addBookmark(s, { url: 'https://b.com', title: 'B', groupId: 'g1' }, 'b', 1);
    s = addBookmark(s, { url: 'https://c.com', title: 'C', groupId: 'g2' }, 'c', 1);
    s = addBookmark(s, { url: 'https://d.com', title: 'D', groupId: null }, 'd', 1);
    const one = tagGroupsByName(s, ['g1'], 5, gen);
    expect(one.tagged).toBe(2); expect(one.created).toBe(1);
    expect(Object.values(one.state.tags).map((t) => t.name)).toEqual(['news']);
    expect(one.state.bookmarks.c.tagIds).toEqual([]);
    expect(one.state.bookmarks.a.updatedAt).toBe(5);
    // again: nothing changes (same object)
    expect(tagGroupsByName(one.state, ['g1'], 9, gen).state).toBe(one.state);
    // all groups: new tag for g2, none for the empty group, ungrouped untouched
    const all = tagGroupsByName(one.state, null, 7, gen);
    expect(all.tagged).toBe(1);
    expect(Object.values(all.state.tags).map((t) => t.name).sort()).toEqual(['bookmarks bar / lan', 'news']);
    expect(all.state.bookmarks.d.tagIds).toEqual([]);
    // undo restores
    expect(revertChange(all.state, one.state, all.state).bookmarks.c.tagIds).toEqual([]);
  });
});
