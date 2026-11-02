// Pure state transitions. Every op returns a NEW DataState and keeps untouched
// records by reference, so `diffState` can detect changes with `===`.
import type { Bookmark, BrowserId, DataState, Group, IconSpec } from './types';
import { BROWSERS } from './types';

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export const sortedGroups = (s: DataState): Group[] => Object.values(s.groups).sort(byOrder);

export const bookmarksIn = (s: DataState, groupId: string | null): Bookmark[] =>
  Object.values(s.bookmarks)
    .filter((b) => b.groupId === groupId)
    .sort(byOrder);

export interface NewBookmark {
  url: string;
  title: string;
  description?: string;
  groupId: string | null;
  tagIds?: string[];
  icon?: IconSpec;
}

export function addBookmark(s: DataState, input: NewBookmark, id: string, now: number): DataState {
  const siblings = bookmarksIn(s, input.groupId);
  const b: Bookmark = {
    id,
    url: input.url,
    title: input.title,
    description: input.description || undefined,
    groupId: input.groupId,
    order: siblings.length ? siblings[siblings.length - 1].order + 1 : 0,
    tagIds: input.tagIds ?? [],
    icon: input.icon ?? { kind: 'auto' },
    createdAt: now,
    updatedAt: now,
  };
  return { ...s, bookmarks: { ...s.bookmarks, [id]: b } };
}

/** Copy a bookmark (same group, placed right after the original) so it can be edited into a variant, e.g. another Home Assistant dashboard. Not copied: preferred flag, usage counts, hidden state. */
export function duplicateBookmark(s: DataState, id: string, newBmId: string, now: number): DataState {
  const src = s.bookmarks[id];
  if (!src) return s;
  const bookmarks: Record<string, Bookmark> = {};
  for (const [k, b] of Object.entries(s.bookmarks)) {
    bookmarks[k] = b.groupId === src.groupId && b.order > src.order ? { ...b, order: b.order + 1 } : b;
  }
  bookmarks[newBmId] = {
    id: newBmId, url: src.url, title: `${src.title || src.url} (copy)`, description: src.description,
    groupId: src.groupId, order: src.order + 1, tagIds: [...src.tagIds], icon: { ...src.icon },
    createdAt: now, updatedAt: now,
  };
  return { ...s, bookmarks };
}

export type BookmarkPatch = Partial<Omit<Bookmark, 'id' | 'createdAt' | 'order'>>;

export function updateBookmark(s: DataState, id: string, patch: BookmarkPatch, now: number): DataState {
  const prev = s.bookmarks[id];
  if (!prev) return s;
  let order = prev.order;
  // Moving to another group appends to the end of that group.
  if (patch.groupId !== undefined && patch.groupId !== prev.groupId) {
    const sib = bookmarksIn(s, patch.groupId);
    order = sib.length ? sib[sib.length - 1].order + 1 : 0;
  }
  return { ...s, bookmarks: { ...s.bookmarks, [id]: { ...prev, ...patch, order, updatedAt: now } } };
}

export function deleteBookmark(s: DataState, id: string): DataState {
  if (!s.bookmarks[id]) return s;
  const { [id]: _removed, ...rest } = s.bookmarks;
  return { ...s, bookmarks: rest };
}

export function addGroup(s: DataState, name: string, id: string, now: number): DataState {
  const groups = sortedGroups(s);
  const order = groups.length ? groups[groups.length - 1].order + 1 : 0;
  return { ...s, groups: { ...s.groups, [id]: { id, name: name.trim() || 'Untitled', order, createdAt: now } } };
}

export function renameGroup(s: DataState, id: string, name: string): DataState {
  const g = s.groups[id];
  const clean = name.trim();
  if (!g || !clean || clean === g.name) return s;
  return { ...s, groups: { ...s.groups, [id]: { ...g, name: clean } } };
}

/** Deleting a group never deletes bookmarks: they move to Ungrouped (appended). */
export function deleteGroup(s: DataState, id: string, now: number): DataState {
  if (!s.groups[id]) return s;
  const { [id]: _removed, ...groups } = s.groups;
  let next: DataState = { ...s, groups };
  for (const b of bookmarksIn(s, id)) next = updateBookmark(next, b.id, { groupId: null }, now);
  return next;
}

// ---- Preferred bookmarks (Launchpad) ----

export const preferredBookmarks = (s: DataState): Bookmark[] =>
  Object.values(s.bookmarks)
    .filter((b) => b.preferred)
    .sort((a, b) => (a.preferredOrder ?? 0) - (b.preferredOrder ?? 0) || a.order - b.order);

/** Everything the Preferred Launchpad shows: bookmarks of promoted groups (group order), then individually starred ones. */
export const launchpadBookmarks = (s: DataState): Bookmark[] => {
  const seen = new Set<string>();
  const out: Bookmark[] = [];
  for (const g of sortedGroups(s)) if (g.promoted) for (const b of bookmarksIn(s, g.id)) { out.push(b); seen.add(b.id); }
  for (const b of preferredBookmarks(s)) if (!seen.has(b.id)) out.push(b);
  return out;
};

/** Promote a whole group to Preferred (its bookmarks show in the Launchpad, the group is hidden) or take it back. */
export function setGroupPromoted(s: DataState, id: string, on: boolean): DataState {
  const g = s.groups[id];
  if (!g || !!g.promoted === on) return s;
  if (on) return { ...s, groups: { ...s.groups, [id]: { ...g, promoted: true } } };
  const { promoted: _p, ...rest } = g;
  return { ...s, groups: { ...s.groups, [id]: rest } };
}

/** Star / un-star a bookmark. A newly preferred bookmark goes to the end of the Launchpad. */
export function setPreferred(s: DataState, id: string, on: boolean, now: number): DataState {
  const b = s.bookmarks[id];
  if (!b || !!b.preferred === on) return s;
  if (!on) {
    const { preferred: _p, preferredOrder: _o, ...rest } = b;
    return { ...s, bookmarks: { ...s.bookmarks, [id]: { ...rest, updatedAt: now } } };
  }
  const list = preferredBookmarks(s);
  const last = list.length ? (list[list.length - 1].preferredOrder ?? list.length - 1) : -1;
  return { ...s, bookmarks: { ...s.bookmarks, [id]: { ...b, preferred: true, preferredOrder: last + 1, updatedAt: now } } };
}

/** Reorder the Launchpad: put `id` at `toIndex` and re-number densely. */
export function movePreferred(s: DataState, id: string, toIndex: number): DataState {
  const b = s.bookmarks[id];
  if (!b?.preferred) return s;
  const list = preferredBookmarks(s).filter((x) => x.id !== id);
  list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, b);
  const bookmarks = { ...s.bookmarks };
  list.forEach((x, i) => { if (bookmarks[x.id].preferredOrder !== i) bookmarks[x.id] = { ...bookmarks[x.id], preferredOrder: i }; });
  return { ...s, bookmarks };
}

/** Count an open (used for "Often used"). Does not touch updatedAt. */
export function recordOpen(s: DataState, id: string, now: number): DataState {
  const b = s.bookmarks[id];
  if (!b) return s;
  return { ...s, bookmarks: { ...s.bookmarks, [id]: { ...b, openCount: (b.openCount ?? 0) + 1, lastOpenedAt: now } } };
}

/** Most-opened bookmarks that are not already preferred (opened at least `min` times). */
export function oftenUsed(s: DataState, limit = 8, min = 2): Bookmark[] {
  return Object.values(s.bookmarks)
    .filter((b) => !b.preferred && (b.openCount ?? 0) >= min)
    .sort((a, b) => (b.openCount ?? 0) - (a.openCount ?? 0) || (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, limit);
}

/** Collapse / expand one group (`value` omitted = toggle). Expanded is stored as "no field". */
export function setGroupCollapsed(s: DataState, id: string, value?: boolean): DataState {
  const g = s.groups[id];
  if (!g) return s;
  const want = value ?? !g.collapsed;
  if (!!g.collapsed === want) return s;
  if (want) return { ...s, groups: { ...s.groups, [id]: { ...g, collapsed: true } } };
  const { collapsed: _c, ...rest } = g;
  return { ...s, groups: { ...s.groups, [id]: rest } };
}

/** Collapse or expand every group at once. */
export function setAllCollapsed(s: DataState, value: boolean): DataState {
  let next = s;
  for (const id of Object.keys(s.groups)) next = setGroupCollapsed(next, id, value);
  return next;
}

/** Limit a group to some browsers. All three (or none) = shown everywhere = no field stored. */
export function setGroupBrowsers(s: DataState, id: string, browsers: BrowserId[]): DataState {
  const g = s.groups[id];
  if (!g) return s;
  const set = [...new Set(browsers)].filter((b) => BROWSERS.some((x) => x.id === b)).sort() as BrowserId[];
  const all = set.length === 0 || set.length === BROWSERS.length;
  if (all && !g.browsers) return s;
  if (!all && g.browsers && g.browsers.join() === set.join()) return s;
  if (all) { const { browsers: _b, ...rest } = g; return { ...s, groups: { ...s.groups, [id]: rest } }; }
  return { ...s, groups: { ...s.groups, [id]: { ...g, browsers: set } } };
}

/** One click: create "Top Chrome", "Top Brave" and "Top Firefox" (each shown only in its browser) at the top of the list. */
export function addBrowserTopGroups(s: DataState, newGroupId: () => string, now: number): DataState {
  let next = s;
  let at = 0;
  for (const b of BROWSERS) {
    const name = `Top ${b.label}`;
    const existing = Object.values(next.groups).find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
    let id = existing?.id;
    if (!id) { id = newGroupId(); next = addGroup(next, name, id, now); }
    next = setGroupBrowsers(next, id, [b.id]);
    next = moveGroup(next, id, at++);
  }
  return next;
}

/** Make sure "Top Chrome / Top Brave / Top Firefox" exist (empty is fine). Existing ones are left exactly as they are. */
export function ensureBrowserTopGroups(s: DataState, newGroupId: () => string, now: number): DataState {
  let next = s;
  let at = 0;
  for (const b of BROWSERS) {
    const name = `Top ${b.label}`;
    if (Object.values(next.groups).some((g) => g.name.trim().toLowerCase() === name.toLowerCase())) { at++; continue; }
    const id = newGroupId();
    next = moveGroup(setGroupBrowsers(addGroup(next, name, id, now), id, [b.id]), id, at++);
  }
  return next;
}

/**
 * One "Personal extensions" link per browser (its extensions / add-ons page), hidden by default and deletable. Fixed ids, so
 * the same link made in two browsers is one bookmark after a sync. Each goes into its browser's Top group when that exists.
 */
export const EXTENSION_LINKS: { id: string; browser: 'chrome' | 'brave' | 'firefox'; url: string; label: string }[] = [
  { id: 'ext-link-chrome', browser: 'chrome', url: 'chrome://extensions', label: 'Chrome' },
  { id: 'ext-link-brave', browser: 'brave', url: 'brave://extensions', label: 'Brave' },
  { id: 'ext-link-firefox', browser: 'firefox', url: 'about:debugging#/runtime/this-firefox', label: 'Firefox' },
];
export function ensureExtensionLinks(s: DataState, now: number, showFor?: BrowserId): DataState {
  let next = s;
  for (const l of EXTENSION_LINKS) {
    if (next.bookmarks[l.id]) continue;
    const top = Object.values(next.groups).find((g) => g.name.trim().toLowerCase() === `top ${l.label}`.toLowerCase());
    next = addBookmark(next, { url: l.url, title: `Personal extensions (${l.label})`, groupId: top?.id ?? null, icon: { kind: 'builtin', glyph: 'puzzle', color: '#8b5cf6' } }, l.id, now);
    // Hidden by default, except the link of the browser you are in when you asked for it (Settings > Restore).
    if (l.browser !== showFor) next = { ...next, bookmarks: { ...next.bookmarks, [l.id]: { ...next.bookmarks[l.id], hidden: true } } };
  }
  return next;
}

/**
 * Two "Beeline documentation" bookmarks, the same in every browser (not browser-specific, visible, in Ungrouped, deletable).
 * PLACEHOLDER ADDRESSES for now: put the real GitHub and blog addresses in `url` and add the old address to `old`;
 * an untouched placeholder is then replaced on the next start (see migrateDocLinks), an edited one is left alone.
 */
export const DOC_LINKS: { id: string; url: string; old: string[]; title: string }[] = [
  { id: 'doc-link-github', url: 'https://github.com/rosariosai/beeline', old: ['https://github.com/your-name/beeline'], title: 'Beeline documentation (GitHub)' },
  { id: 'doc-link-blog', url: 'https://rosariosai.substack.com', old: ['https://your-blog.example.com/beeline'], title: 'Beeline blog (The Daily Calf)' },
];
export function ensureDocLinks(s: DataState, now: number): DataState {
  let next = s;
  for (const l of DOC_LINKS) {
    if (next.bookmarks[l.id]) continue;
    next = addBookmark(next, { url: l.url, title: l.title, groupId: null, icon: { kind: 'builtin', glyph: 'book', color: '#f59e0b' } }, l.id, now);
  }
  return next;
}
export function migrateDocLinks(s: DataState): DataState {
  let next = s;
  for (const l of DOC_LINKS) {
    const b = next.bookmarks[l.id];
    if (b && b.url !== l.url && l.old.includes(b.url)) next = { ...next, bookmarks: { ...next.bookmarks, [b.id]: { ...b, url: l.url } } };
  }
  return next;
}

/** Settings > Restore: recreate any missing built-in link (extensions + documentation) and make this browser's own extensions link visible. Nothing else is touched. */
export function restoreExtensionLinks(s: DataState, now: number, browser: BrowserId): DataState {
  let next = ensureDocLinks(ensureExtensionLinks(s, now, browser), now);
  const own = EXTENSION_LINKS.find((l) => l.browser === browser);
  const b = own && next.bookmarks[own.id];
  if (b && (b.hidden || b.hiddenUntil !== undefined)) {
    const { hidden: _h, hiddenUntil: _u, ...rest } = b;
    next = { ...next, bookmarks: { ...next.bookmarks, [b.id]: rest } };
  }
  return next;
}

/** The links of the other browsers are never shown (a Chrome link is useless in Brave, even after importing a Chrome backup). */
export const isForeignExtLink = (id: string, browser: BrowserId): boolean => EXTENSION_LINKS.some((l) => l.id === id && l.browser !== browser);
export function withoutForeignExtLinks(s: DataState, browser: BrowserId): DataState {
  const ids = Object.keys(s.bookmarks).filter((id) => isForeignExtLink(id, browser));
  if (ids.length === 0) return s;
  const bookmarks = { ...s.bookmarks };
  for (const id of ids) delete bookmarks[id];
  return { ...s, bookmarks };
}

/** Earlier versions pointed the Firefox link at about:addons; developers want the debugging page. Only an untouched link is changed. */
export function migrateExtensionLinks(s: DataState): DataState {
  const b = s.bookmarks['ext-link-firefox'];
  if (!b || b.url !== 'about:addons') return s;
  const url = EXTENSION_LINKS.find((l) => l.id === 'ext-link-firefox')!.url;
  return { ...s, bookmarks: { ...s.bookmarks, [b.id]: { ...b, url } } };
}

/** Group colour and emoji. Pass null to clear a value, undefined to leave it. */
export function setGroupStyle(s: DataState, id: string, style: { color?: string | null; emoji?: string | null }): DataState {
  const g = s.groups[id];
  if (!g) return s;
  const next: Group = { ...g };
  if (style.color !== undefined) { if (style.color) next.color = style.color; else delete next.color; }
  if (style.emoji !== undefined) { const e = style.emoji?.trim(); if (e) next.emoji = e; else delete next.emoji; }
  if (next.color === g.color && next.emoji === g.emoji) return s;
  return { ...s, groups: { ...s.groups, [id]: next } };
}

export interface StateDiff {
  put: { bookmarks: Bookmark[]; groups: Group[]; tags: import('./types').Tag[] };
  del: { bookmarks: string[]; groups: string[]; tags: string[] };
}

/** What must be written to storage to turn `prev` into `next`. Also used to implement undo. */
export function diffState(prev: DataState, next: DataState): StateDiff {
  const out: StateDiff = {
    put: { bookmarks: [], groups: [], tags: [] },
    del: { bookmarks: [], groups: [], tags: [] },
  };
  for (const key of ['bookmarks', 'groups', 'tags'] as const) {
    const a = prev[key] as Record<string, unknown>;
    const b = next[key] as Record<string, unknown>;
    for (const id of Object.keys(b)) if (a[id] !== b[id]) (out.put[key] as unknown[]).push(b[id]);
    for (const id of Object.keys(a)) if (!(id in b)) out.del[key].push(id);
  }
  return out;
}

export const isEmptyDiff = (d: StateDiff) =>
  Object.values(d.put).every((x) => x.length === 0) && Object.values(d.del).every((x) => x.length === 0);

/**
 * Undo helper: restore only the records that the change `prev -> next` touched,
 * leaving any later, unrelated edits in `cur` intact.
 */
export function revertChange(cur: DataState, prev: DataState, next: DataState): DataState {
  const out: DataState = { bookmarks: { ...cur.bookmarks }, groups: { ...cur.groups }, tags: { ...cur.tags } };
  for (const key of ['bookmarks', 'groups', 'tags'] as const) {
    const a = prev[key] as Record<string, unknown>;
    const b = next[key] as Record<string, unknown>;
    const target = out[key] as Record<string, unknown>;
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[id] === b[id]) continue;
      if (id in a) target[id] = a[id];
      else delete target[id];
    }
  }
  return out;
}

/**
 * Place a bookmark at `toIndex` inside group `toGroupId` (null = Ungrouped) and re-number
 * the affected group(s) densely. Records whose group/order did not change keep their identity.
 */
export function moveBookmark(s: DataState, id: string, toGroupId: string | null, toIndex: number, now: number): DataState {
  const moving = s.bookmarks[id];
  if (!moving) return s;
  const target = bookmarksIn(s, toGroupId).filter((b) => b.id !== id);
  const at = Math.max(0, Math.min(toIndex, target.length));
  target.splice(at, 0, moving);

  const bookmarks = { ...s.bookmarks };
  const renumber = (list: Bookmark[], groupId: string | null) =>
    list.forEach((b, i) => {
      const cur = bookmarks[b.id];
      if (cur.order === i && cur.groupId === groupId) return;
      bookmarks[b.id] = { ...cur, groupId, order: i, updatedAt: b.id === id ? now : cur.updatedAt };
    });
  renumber(target, toGroupId);
  if (moving.groupId !== toGroupId) {
    renumber(bookmarksIn(s, moving.groupId).filter((b) => b.id !== id), moving.groupId);
  }
  return { ...s, bookmarks };
}

/** Move a group to `toIndex` in the group list and re-number. */
export function moveGroup(s: DataState, id: string, toIndex: number): DataState {
  const list = sortedGroups(s).filter((g) => g.id !== id);
  const g = s.groups[id];
  if (!g) return s;
  list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, g);
  const groups = { ...s.groups };
  list.forEach((x, i) => { if (groups[x.id].order !== i) groups[x.id] = { ...groups[x.id], order: i }; });
  return { ...s, groups };
}
