import { describe, expect, it } from 'vitest';
import { emptyState } from '../src/core/types';
import { addBookmark, addGroup } from '../src/core/ops';
import { ensureTags } from '../src/core/tags';
import { buildIndex, fold, highlight, parseQuery, search } from '../src/core/search';

let n = 0;
const gen = () => `t${++n}`;
function data() {
  n = 0;
  let s = addGroup(addGroup(emptyState(), 'Work', 'gw', 0), 'Léisure', 'gl', 0);
  const mk = (id: string, title: string, url: string, groupId: string | null, tags: string[], description?: string) => {
    const r = ensureTags(s, tags, 1, gen); s = r.state;
    s = addBookmark(s, { url, title, groupId, tagIds: r.ids, description }, id, 1);
  };
  mk('figma', 'Figma', 'https://www.figma.com/files', 'gw', ['design', 'tools']);
  mk('gh', 'GitHub', 'https://github.com/', 'gw', ['code']);
  mk('dribbble', 'Dribbble', 'https://dribbble.com', 'gl', ['Design']);
  mk('cafe', 'Café Müller', 'https://cafe.example.org/menu', 'gl', [], 'best espresso in town');
  mk('news', 'Hacker News', 'https://news.ycombinator.com', null, ['news', 'code']);
  return s;
}
const ids = (q: string, s = data()) => search(buildIndex(s), q).map((h) => h.id);

describe('search', () => {
  it('empty / whitespace / lone # returns nothing', () => {
    for (const q of ['', '   ', '#']) expect(ids(q)).toEqual([]);
  });
  it('matches title, case-insensitively, title-prefix first', () => {
    expect(ids('FIG')).toEqual(['figma']);
    expect(ids('news')[0]).toBe('news'); // title "Hacker News" + tag + host
  });
  it('matches URL (host and path), tags, group names and description', () => {
    expect(ids('ycombinator')).toEqual(['news']);
    expect(ids('files')).toEqual(['figma']);
    expect(ids('tools')).toEqual(['figma']);
    expect(ids('work').sort()).toEqual(['figma', 'gh']);
    expect(ids('espresso')).toEqual(['cafe']);
  });
  it('is accent-insensitive in both directions', () => {
    expect(ids('cafe')).toEqual(['cafe']);
    expect(ids('muller')).toEqual(['cafe']);
    expect(ids('leisure').sort()).toEqual(['cafe', 'dribbble']);
    expect(ids('Léisure').sort()).toEqual(['cafe', 'dribbble']);
  });
  it('every word must match (AND), in any field and any order', () => {
    expect(ids('design work')).toEqual(['figma']);
    expect(ids('work design')).toEqual(['figma']);
    expect(ids('design zzz')).toEqual([]);
  });
  it('#tag terms match tags only', () => {
    expect(ids('#design').sort()).toEqual(['dribbble', 'figma']);
    expect(ids('#code').sort()).toEqual(['gh', 'news']);
    expect(ids('#github')).toEqual([]); // "github" is a title, not a tag
    expect(ids('#code hacker')).toEqual(['news']);
  });
  it('ranks title prefix above tag match above URL-only match', () => {
    let s = emptyState();
    const r = ensureTags(s, ['alpha'], 1, gen); s = r.state;
    s = addBookmark(s, { url: 'https://x.com/alpha-path', title: 'Zed', groupId: null }, 'urlonly', 1);
    s = addBookmark(s, { url: 'https://y.com', title: 'Other', groupId: null, tagIds: r.ids }, 'tag', 1);
    s = addBookmark(s, { url: 'https://z.com', title: 'Alpha site', groupId: null }, 'title', 1);
    expect(ids('alpha', s)).toEqual(['title', 'tag', 'urlonly']);
  });
  it('ties break alphabetically by title', () => {
    let s = emptyState();
    s = addBookmark(s, { url: 'https://b.com', title: 'Bee tool', groupId: null }, 'b', 1);
    s = addBookmark(s, { url: 'https://a.com', title: 'Ant tool', groupId: null }, 'a', 1);
    expect(ids('tool', s)).toEqual(['a', 'b']);
  });
  it('scales: 5,000 bookmarks index + search in well under 100ms', () => {
    // Built directly: addBookmark is O(n) per call (fine for one UI add; M6 import needs a bulk path).
    const s = emptyState();
    for (let i = 0; i < 5000; i++) {
      s.bookmarks[`b${i}`] = { id: `b${i}`, url: `https://site${i}.example.com/p${i}`, title: `Site number ${i}`, groupId: null, order: i, tagIds: [], icon: { kind: 'auto' }, createdAt: 1, updatedAt: 1 };
    }
    const t = performance.now();
    const hits = search(buildIndex(s), 'number 49');
    expect(performance.now() - t).toBeLessThan(100);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('parseQuery / fold / highlight', () => {
  it('splits words and #tags', () => {
    expect(parseQuery(' Design  #Tools figma ')).toEqual({ terms: ['design', 'figma'], tagTerms: ['tools'] });
  });
  it('fold strips accents and case', () => expect(fold('ÉCOLE Ñandú')).toBe('ecole nandu'));
  it('highlight marks matches using original text, ignoring accents/case', () => {
    expect(highlight('Café Müller', ['cafe', 'mul'])).toEqual([
      { text: 'Café', hit: true }, { text: ' ', hit: false }, { text: 'Mül', hit: true }, { text: 'ler', hit: false },
    ]);
  });
  it('highlight with no terms returns the whole text unmarked', () => {
    expect(highlight('Hello', [])).toEqual([{ text: 'Hello', hit: false }]);
  });
});
