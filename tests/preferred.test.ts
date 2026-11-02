import { describe, expect, it } from 'vitest';
import { emptyState, DEFAULT_SETTINGS } from '../src/core/types';
import {
  addBookmark, addGroup, movePreferred, oftenUsed, preferredBookmarks, recordOpen, setGroupStyle, setPreferred, diffState,
} from '../src/core/ops';
import { buildExportFile, parseExportFile, stateFromExport } from '../src/core/exporting';

const base = () => {
  let s = emptyState();
  for (const id of ['a', 'b', 'c', 'd']) s = addBookmark(s, { url: `https://${id}.com`, title: id, groupId: null }, id, 1);
  return s;
};

describe('preferred bookmarks', () => {
  it('stars append to the end of the Launchpad and unstar removes the fields', () => {
    let s = setPreferred(base(), 'c', true, 5);
    s = setPreferred(s, 'a', true, 6);
    expect(preferredBookmarks(s).map((b) => b.id)).toEqual(['c', 'a']);
    s = setPreferred(s, 'c', false, 7);
    expect(preferredBookmarks(s).map((b) => b.id)).toEqual(['a']);
    expect('preferred' in s.bookmarks.c).toBe(false);
    expect('preferredOrder' in s.bookmarks.c).toBe(false);
  });

  it('is a no-op (same state object) when nothing changes', () => {
    const s = base();
    expect(setPreferred(s, 'a', false, 2)).toBe(s);
    expect(setPreferred(s, 'missing', true, 2)).toBe(s);
  });

  it('moves a preferred bookmark and renumbers densely', () => {
    let s = base();
    for (const id of ['a', 'b', 'c']) s = setPreferred(s, id, true, 2);
    s = movePreferred(s, 'c', 0);
    expect(preferredBookmarks(s).map((b) => [b.id, b.preferredOrder])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    expect(movePreferred(s, 'd', 0)).toBe(s); // not preferred
  });

  it('only touches the changed records (undo relies on identity)', () => {
    const s = base();
    const n = setPreferred(s, 'b', true, 2);
    const d = diffState(s, n);
    expect(d.put.bookmarks.map((b) => b.id)).toEqual(['b']);
  });
});

describe('often used', () => {
  it('counts opens, lists the most opened non-preferred ones with a minimum of 2', () => {
    let s = base();
    s = recordOpen(s, 'a', 10); s = recordOpen(s, 'a', 11); s = recordOpen(s, 'a', 12);
    s = recordOpen(s, 'b', 13); s = recordOpen(s, 'b', 14);
    s = recordOpen(s, 'c', 15);
    s = setPreferred(s, 'b', true, 16);
    expect(s.bookmarks.a.openCount).toBe(3);
    expect(s.bookmarks.a.lastOpenedAt).toBe(12);
    expect(s.bookmarks.a.updatedAt).toBe(1);
    expect(oftenUsed(s).map((b) => b.id)).toEqual(['a']);
    expect(oftenUsed(s, 8, 1).map((b) => b.id)).toEqual(['a', 'c']);
  });
});

describe('group colour and emoji', () => {
  it('sets, clears and ignores no-op changes', () => {
    let s = addGroup(emptyState(), 'Work', 'g', 0);
    s = setGroupStyle(s, 'g', { color: '#22c55e', emoji: ' 💼 ' });
    expect(s.groups.g.color).toBe('#22c55e');
    expect(s.groups.g.emoji).toBe('💼');
    expect(setGroupStyle(s, 'g', { color: '#22c55e' })).toBe(s);
    s = setGroupStyle(s, 'g', { color: null, emoji: null });
    expect('color' in s.groups.g).toBe(false);
    expect('emoji' in s.groups.g).toBe(false);
  });
});

describe('backup keeps the new fields', () => {
  it('round-trips preferred, usage and group style; old backups still load', () => {
    let s = addGroup(base(), 'Work', 'g', 0);
    s = setGroupStyle(s, 'g', { color: '#4f8cf6', emoji: '💼' });
    s = setPreferred(s, 'a', true, 2);
    s = recordOpen(s, 'a', 3);
    const text = JSON.stringify(buildExportFile(s, { ...DEFAULT_SETTINGS, showOften: true }, [], new Date(0)));
    const r = parseExportFile(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = stateFromExport(r.file);
    expect(back.bookmarks.a.preferred).toBe(true);
    expect(back.bookmarks.a.preferredOrder).toBe(0);
    expect(back.bookmarks.a.openCount).toBe(1);
    expect(back.groups.g.color).toBe('#4f8cf6');
    expect(back.groups.g.emoji).toBe('💼');
    expect(r.file.settings.showOften).toBe(true);

    const old = JSON.parse(text);
    delete old.settings.showLaunchpad; delete old.settings.showOften;
    for (const b of old.bookmarks) { delete b.preferred; delete b.preferredOrder; delete b.openCount; }
    const r2 = parseExportFile(JSON.stringify(old));
    expect(r2.ok && r2.file.settings.showLaunchpad).toBe(true);
    expect(r2.ok && r2.file.bookmarks.every((b) => !b.preferred)).toBe(true);
  });

  it('rejects a bad group colour', () => {
    const f = buildExportFile(addGroup(emptyState(), 'G', 'g', 0), DEFAULT_SETTINGS, [], new Date(0));
    const raw = JSON.parse(JSON.stringify(f));
    raw.groups[0].color = 'red; background:url(x)';
    const r = parseExportFile(JSON.stringify(raw));
    expect(r.ok && r.file.groups[0].color).toBeUndefined();
  });
});

import { setAllCollapsed, setGroupCollapsed } from '../src/core/ops';

describe('collapsed groups', () => {
  const two = () => addGroup(addGroup(emptyState(), 'A', 'a', 0), 'B', 'b', 0);
  it('toggles, stores nothing when expanded, and ignores no-ops', () => {
    let s = setGroupCollapsed(two(), 'a');
    expect(s.groups.a.collapsed).toBe(true);
    expect(setGroupCollapsed(s, 'a', true)).toBe(s);
    s = setGroupCollapsed(s, 'a');
    expect('collapsed' in s.groups.a).toBe(false);
    expect(setGroupCollapsed(s, 'missing')).toBe(s);
  });
  it('collapse all / expand all', () => {
    const c = setAllCollapsed(two(), true);
    expect(Object.values(c.groups).every((g) => g.collapsed)).toBe(true);
    const e = setAllCollapsed(c, false);
    expect(Object.values(e.groups).some((g) => 'collapsed' in g)).toBe(false);
  });
  it('survives a backup round trip', () => {
    const s = setGroupCollapsed(two(), 'b');
    const r = parseExportFile(JSON.stringify(buildExportFile(s, DEFAULT_SETTINGS, [], new Date(0))));
    expect(r.ok && r.file.groups.find((g) => g.id === 'b')?.collapsed).toBe(true);
    expect(r.ok && r.file.groups.find((g) => g.id === 'a')?.collapsed).toBeUndefined();
  });
});

import { addBrowserTopGroups, setGroupBrowsers, sortedGroups } from '../src/core/ops';
import { hiddenCount, isBookmarkHidden, isHiddenFlag, setCurrentBrowser } from '../src/core/hidden';

describe('groups limited to some browsers', () => {
  const sample = () => {
    let s = addGroup(addGroup(emptyState(), 'Chrome stuff', 'gc', 0), 'Everywhere', 'ge', 0);
    s = addBookmark(s, { url: 'https://c.com', title: 'c', groupId: 'gc' }, 'c', 1);
    s = addBookmark(s, { url: 'https://e.com', title: 'e', groupId: 'ge' }, 'e', 1);
    return setGroupBrowsers(s, 'gc', ['chrome']);
  };
  it('counts as hidden (with its bookmarks) only in the other browsers', () => {
    const s = sample();
    setCurrentBrowser('chrome');
    expect(isHiddenFlag(s.groups.gc, 0)).toBe(false);
    expect(isBookmarkHidden(s, s.bookmarks.c, 0)).toBe(false);
    setCurrentBrowser('firefox');
    expect(isHiddenFlag(s.groups.gc, 0)).toBe(true);
    expect(isHiddenFlag(s.groups.ge, 0)).toBe(false);
    expect(isBookmarkHidden(s, s.bookmarks.c, 0)).toBe(true);
    expect(isBookmarkHidden(s, s.bookmarks.e, 0)).toBe(false);
    expect(hiddenCount(s, 0)).toBe(2); // the group and its bookmark
    setCurrentBrowser(null);
    expect(isHiddenFlag(s.groups.gc, 0)).toBe(false);
  });
  it('no limit stored when all (or none) are ticked; same state object when nothing changes', () => {
    const s = sample();
    const all = setGroupBrowsers(s, 'gc', ['chrome', 'brave', 'firefox']);
    expect('browsers' in all.groups.gc).toBe(false);
    expect(setGroupBrowsers(s, 'gc', ['chrome'])).toBe(s);
    expect(setGroupBrowsers(s, 'ge', [])).toBe(s);
  });
  it('is kept in backups; bad values are ignored', () => {
    const s = sample();
    const raw = JSON.parse(JSON.stringify(buildExportFile(s, DEFAULT_SETTINGS, [], new Date(0))));
    const back = parseExportFile(JSON.stringify(raw));
    expect(back.ok && back.file.groups.find((g) => g.id === 'gc')?.browsers).toEqual(['chrome']);
    raw.groups[0].browsers = ['netscape', 'chrome', 'brave', 'firefox'];
    const odd = parseExportFile(JSON.stringify(raw));
    expect(odd.ok && odd.file.groups[0].browsers).toBeUndefined();
  });
  it('creates Top Chrome / Top Brave / Top Firefox at the top, once', () => {
    let n = 0;
    const s0 = addGroup(emptyState(), 'Work', 'w', 0);
    const s1 = addBrowserTopGroups(s0, () => `t${++n}`, 1);
    const names = sortedGroups(s1).map((g) => g.name);
    expect(names).toEqual(['Top Chrome', 'Top Brave', 'Top Firefox', 'Work']);
    expect(sortedGroups(s1).slice(0, 3).map((g) => g.browsers)).toEqual([['chrome'], ['brave'], ['firefox']]);
    const s2 = addBrowserTopGroups(s1, () => `t${++n}`, 2);
    expect(sortedGroups(s2).map((g) => g.name)).toEqual(names);
  });
});

import { duplicateBookmark } from '../src/core/ops';
describe('duplicateBookmark', () => {
  it('copies right after the original without usage/preferred', () => {
    let s = emptyState();
    s = addBookmark(s, { url: 'http://ha.local/a', title: 'HA', groupId: null }, 'a', 1);
    s = addBookmark(s, { url: 'http://x', title: 'X', groupId: null }, 'b', 2);
    s = setPreferred(s, 'a', true, 3);
    const d = duplicateBookmark(s, 'a', 'c', 9);
    expect(d.bookmarks.c.title).toBe('HA (copy)');
    expect(d.bookmarks.c.preferred).toBeUndefined();
    expect(d.bookmarks.c.order).toBe(d.bookmarks.a.order + 1);
    expect(d.bookmarks.b.order).toBe(d.bookmarks.c.order + 1);
  });
});

import { launchpadBookmarks, setGroupPromoted, addGroup as addGroupOp } from '../src/core/ops';
describe('promoted groups', () => {
  it('feed the launchpad, hide the group, stay searchable', () => {
    let s = emptyState();
    s = addGroupOp(s, 'Top', 'g1', 1);
    s = addBookmark(s, { url: 'http://a', title: 'A', groupId: 'g1' }, 'a', 1);
    s = addBookmark(s, { url: 'http://b', title: 'B', groupId: null }, 'b', 2);
    s = setPreferred(s, 'b', true, 3);
    expect(launchpadBookmarks(s).map((x) => x.id)).toEqual(['b']);
    s = setGroupPromoted(s, 'g1', true);
    expect(launchpadBookmarks(s).map((x) => x.id)).toEqual(['a', 'b']);
    expect(isHiddenFlag(s.groups.g1, 0)).toBe(true);
    expect(isBookmarkHidden(s, s.bookmarks.a, 0)).toBe(true);
    expect(isBookmarkHidden(s, s.bookmarks.a, 0, true)).toBe(false);
    const back = setGroupPromoted(s, 'g1', false);
    expect(back.groups.g1.promoted).toBeUndefined();
    expect(isHiddenFlag(back.groups.g1, 0)).toBe(false);
    const r = parseExportFile(JSON.stringify(buildExportFile(s, DEFAULT_SETTINGS, [], new Date(0))));
    expect(r.ok && r.file.groups[0].promoted).toBe(true);
  });
});

import { ensureBrowserTopGroups } from '../src/core/ops';
describe('ensureBrowserTopGroups', () => {
  it('creates only the missing ones and is idempotent', () => {
    let n = 0; const id = () => `n${n++}`;
    let s = addGroupOp(emptyState(), 'top chrome', 'x', 1);
    s = { ...s, groups: { x: { ...s.groups.x, color: '#ff0000' } } };
    const a = ensureBrowserTopGroups(s, id, 2);
    expect(Object.values(a.groups).map((g) => g.name.toLowerCase()).sort()).toEqual(['top brave', 'top chrome', 'top firefox']);
    expect(a.groups.x.color).toBe('#ff0000');
    expect(ensureBrowserTopGroups(a, id, 3)).toBe(a);
  });
});

import { numberBookmarks } from '../src/core/numbering';
describe('numbering', () => {
  it('numbers in display order, preferred first, no duplicates', () => {
    let s = addGroupOp(emptyState(), 'G', 'g', 1);
    s = addBookmark(s, { url: 'http://a', title: 'A', groupId: 'g' }, 'a', 1);
    s = addBookmark(s, { url: 'http://b', title: 'B', groupId: 'g' }, 'b', 2);
    s = addBookmark(s, { url: 'http://c', title: 'C', groupId: null }, 'c', 3);
    s = setPreferred(s, 'b', true, 4);
    const m = numberBookmarks(s, { launchpadFirst: true, showHidden: false, now: 0 });
    expect([...m]).toEqual([['b', 1], ['a', 2], ['c', 3]]);
    const m2 = numberBookmarks(s, { launchpadFirst: false, showHidden: false, now: 0 });
    expect([...m2]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });
});

import { DOC_LINKS, ensureDocLinks, migrateDocLinks, ensureExtensionLinks, EXTENSION_LINKS, isForeignExtLink, migrateExtensionLinks, restoreExtensionLinks, withoutForeignExtLinks } from '../src/core/ops';
import { normalizeUrl } from '../src/core/url';
describe('extension links', () => {
  it('adds one hidden link per browser, once, into the Top group', () => {
    const base = ensureBrowserTopGroups({ bookmarks: {}, groups: {}, tags: {} }, (() => { let i = 0; return () => `g${i++}`; })(), 1);
    const s = ensureExtensionLinks(base, 2);
    expect(Object.keys(s.bookmarks).sort()).toEqual(EXTENSION_LINKS.map((l) => l.id).sort());
    expect(Object.values(s.bookmarks).every((b) => b.hidden)).toBe(true);
    expect(s.groups[s.bookmarks['ext-link-brave'].groupId as string].name).toBe('Top Brave');
    expect(ensureExtensionLinks(s, 3)).toBe(s);
  });
  it("shows only this browser's link (others are left out, also after importing another browser's backup)", () => {
    const s = ensureExtensionLinks({ bookmarks: {}, groups: {}, tags: {} }, 2);
    expect(Object.keys(withoutForeignExtLinks(s, 'brave').bookmarks)).toEqual(['ext-link-brave']);
    expect(Object.keys(withoutForeignExtLinks(s, 'firefox').bookmarks)).toEqual(['ext-link-firefox']);
    expect(isForeignExtLink('ext-link-chrome', 'brave')).toBe(true);
    expect(isForeignExtLink('ext-link-brave', 'brave')).toBe(false);
    expect(isForeignExtLink('some-other-id', 'brave')).toBe(false);
    expect(withoutForeignExtLinks({ bookmarks: {}, groups: {}, tags: {} }, 'chrome').bookmarks).toEqual({});
  });
  it('Firefox link opens the debugging page; an old untouched about:addons link is migrated, an edited one is not', () => {
    expect(EXTENSION_LINKS.find((l) => l.browser === 'firefox')!.url).toBe('about:debugging#/runtime/this-firefox');
    expect(normalizeUrl('about:debugging#/runtime/this-firefox')).toBe('about:debugging#/runtime/this-firefox');
    const s = ensureExtensionLinks({ bookmarks: {}, groups: {}, tags: {} }, 2);
    const old = { ...s, bookmarks: { ...s.bookmarks, 'ext-link-firefox': { ...s.bookmarks['ext-link-firefox'], url: 'about:addons' } } };
    expect(migrateExtensionLinks(old).bookmarks['ext-link-firefox'].url).toBe('about:debugging#/runtime/this-firefox');
    const mine = { ...s, bookmarks: { ...s.bookmarks, 'ext-link-firefox': { ...s.bookmarks['ext-link-firefox'], url: 'about:config' } } };
    expect(migrateExtensionLinks(mine)).toBe(mine);
    expect(migrateExtensionLinks(s)).toBe(s);
  });
  it('Restore recreates a deleted link, unhides this browser link, and leaves other bookmarks alone', () => {
    let s = ensureExtensionLinks({ bookmarks: {}, groups: {}, tags: {} }, 2);
    const { 'ext-link-chrome': _gone, ...rest } = s.bookmarks;
    s = { ...s, bookmarks: rest };
    const r = restoreExtensionLinks(s, 5, 'chrome');
    expect(r.bookmarks['ext-link-chrome']).toBeTruthy();
    expect(r.bookmarks['ext-link-chrome'].hidden).toBeUndefined();
    expect(r.bookmarks['ext-link-brave'].hidden).toBe(true);
    // already there and visible: nothing changes
    expect(restoreExtensionLinks(r, 6, 'chrome')).toBe(r);
    // hidden but present: unhidden
    const hid = restoreExtensionLinks(ensureExtensionLinks({ bookmarks: {}, groups: {}, tags: {} }, 2), 3, 'brave');
    expect(hid.bookmarks['ext-link-brave'].hidden).toBeUndefined();
  });
  it('documentation links: two visible bookmarks, the same in every browser, created once, placeholder migrated when the real address is set', () => {
    const empty = { bookmarks: {}, groups: {}, tags: {} };
    const s = ensureDocLinks(empty, 2);
    expect(Object.keys(s.bookmarks).sort()).toEqual(DOC_LINKS.map((l) => l.id).sort());
    expect(Object.values(s.bookmarks).every((b) => !b.hidden && b.groupId === null)).toBe(true);
    expect(withoutForeignExtLinks(s, 'brave').bookmarks).toEqual(s.bookmarks);
    expect(ensureDocLinks(s, 3)).toBe(s);
    expect(migrateDocLinks(s)).toBe(s);
    const moved = { ...s, bookmarks: { ...s.bookmarks, 'doc-link-blog': { ...s.bookmarks['doc-link-blog'], url: 'https://old.example/x' } } };
    expect(migrateDocLinks(moved)).toBe(moved); // unknown (edited) address is never overwritten
    expect(restoreExtensionLinks(empty, 5, 'chrome').bookmarks['doc-link-github']).toBeTruthy();
  });
  it('accepts browser pages as URLs', () => {
    expect(normalizeUrl('chrome://extensions')).toBe('chrome://extensions');
    expect(normalizeUrl('about:addons')).toBe('about:addons');
    expect(normalizeUrl('brave://extensions')).toBe('brave://extensions');
    expect(normalizeUrl('chrome://')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});
