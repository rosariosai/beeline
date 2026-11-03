// Sync through one shared file (kept in a cloud-synced folder). Pure logic: no storage, no browser APIs.
//
// Every browser keeps its own copy of the data plus a "base": what the data looked like right after the last
// successful sync. A sync is a three-way merge of (base, local, remote file):
//   - changed on one side only  -> take that change
//   - changed on both sides     -> bookmarks: the newer updatedAt wins; groups and tags: the file wins
//   - deleted on one side       -> deleted, unless the other side edited it meanwhile (an edit beats a delete)
// First sync (no base): records that exist on both sides are matched by group name / tag name / bookmark URL, so
// importing the same bookmarks in two browsers does not create duplicates.
import type { Bookmark, DataState, Group, Settings, Tag } from './types';
import { urlKey } from './importing';
import { normalizeTagName } from './tags';
import { dedupeTopGroups } from './topgroups';

type Rec = Bookmark | Group | Tag;
const KEYS = ['bookmarks', 'groups', 'tags'] as const;

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const same = (a: unknown, b: unknown) => a === b || stable(a) === stable(b);

export const sameState = (a: DataState, b: DataState) => KEYS.every((k) => same(a[k], b[k]));

export interface MergeResult {
  /** What this browser should now have. */
  state: DataState;
  /** What the sync file should now contain (differs from `state` only when some layers are not synced). */
  fileState: DataState;
  /** The merged data differs from what this browser has: write it to the local database. */
  localChanged: boolean;
  /** The merged data differs from the file: write the file. */
  remoteChanged: boolean;
}

/** Rename the ids of `s` according to `map` (old id -> new id), fixing references. */
function remapIds(s: DataState, maps: { groups: Map<string, string>; tags: Map<string, string>; bookmarks: Map<string, string> }): DataState {
  const g = (id: string | null) => (id === null ? null : maps.groups.get(id) ?? id);
  const out: DataState = { bookmarks: {}, groups: {}, tags: {} };
  for (const x of Object.values(s.groups)) { const id = g(x.id) as string; out.groups[id] = { ...x, id }; }
  for (const x of Object.values(s.tags)) { const id = maps.tags.get(x.id) ?? x.id; out.tags[id] = { ...x, id }; }
  for (const x of Object.values(s.bookmarks)) {
    const id = maps.bookmarks.get(x.id) ?? x.id;
    out.bookmarks[id] = { ...x, id, groupId: g(x.groupId), tagIds: x.tagIds.map((t) => maps.tags.get(t) ?? t) };
  }
  return out;
}

/** First sync: give local records that match a remote one (same group name / tag name / URL) the remote id. */
function alignIds(local: DataState, remote: DataState): DataState {
  const groups = new Map<string, string>(), tags = new Map<string, string>(), bookmarks = new Map<string, string>();
  const rg = new Map(Object.values(remote.groups).map((x) => [x.name.trim().toLowerCase(), x.id]));
  for (const x of Object.values(local.groups)) { const m = rg.get(x.name.trim().toLowerCase()); if (m && m !== x.id) groups.set(x.id, m); }
  const rt = new Map(Object.values(remote.tags).map((x) => [normalizeTagName(x.name), x.id]));
  for (const x of Object.values(local.tags)) { const m = rt.get(normalizeTagName(x.name)); if (m && m !== x.id) tags.set(x.id, m); }
  const rb = new Map<string, string>();
  for (const x of Object.values(remote.bookmarks)) if (!rb.has(urlKey(x.url))) rb.set(urlKey(x.url), x.id);
  const used = new Set<string>();
  for (const x of Object.values(local.bookmarks)) {
    const m = rb.get(urlKey(x.url));
    if (m && !used.has(m) && m !== x.id) { bookmarks.set(x.id, m); used.add(m); }
  }
  if (!groups.size && !tags.size && !bookmarks.size) return local;
  return remapIds(local, { groups, tags, bookmarks });
}

function pickBoth(key: (typeof KEYS)[number], l: Rec, r: Rec): Rec {
  if (key === 'bookmarks') {
    const a = l as Bookmark, b = r as Bookmark;
    const win = a.updatedAt > b.updatedAt ? a : b; // tie: the file
    const openCount = Math.max(a.openCount ?? 0, b.openCount ?? 0);
    const lastOpenedAt = Math.max(a.lastOpenedAt ?? 0, b.lastOpenedAt ?? 0);
    const out: Bookmark = { ...win };
    if (openCount) out.openCount = openCount; else delete out.openCount;
    if (lastOpenedAt) out.lastOpenedAt = lastOpenedAt; else delete out.lastOpenedAt;
    return out;
  }
  return r;
}

/** Renumber 0..n-1 only when two items share a number (gaps are harmless and left alone). */
const dense = <T extends { id: string }>(list: T[], get: (x: T) => number, set: (x: T, n: number) => T, byId: Record<string, T>) => {
  if (new Set(list.map(get)).size === list.length) return;
  list.forEach((x, i) => { if (get(x) !== i) byId[x.id] = set(x, i); });
};

/** Make references valid and numbering unique after a merge. Records that are already fine keep their identity. */
function tidy(s: DataState): DataState {
  const out: DataState = { bookmarks: { ...s.bookmarks }, groups: { ...s.groups }, tags: { ...s.tags } };
  for (const b of Object.values(s.bookmarks)) {
    const groupId = b.groupId !== null && !out.groups[b.groupId] ? null : b.groupId;
    const tagIds = b.tagIds.every((t) => out.tags[t]) ? b.tagIds : b.tagIds.filter((t) => out.tags[t]);
    if (groupId !== b.groupId || tagIds !== b.tagIds) out.bookmarks[b.id] = { ...b, groupId, tagIds };
  }
  const cmp = <T extends { id: string; order: number }>(a: T, b: T) => a.order - b.order || (a.id < b.id ? -1 : 1);
  dense(Object.values(out.groups).sort(cmp), (x) => x.order, (x, n) => ({ ...x, order: n }), out.groups);
  const byGroup = new Map<string | null, Bookmark[]>();
  for (const b of Object.values(out.bookmarks)) byGroup.set(b.groupId, [...(byGroup.get(b.groupId) ?? []), b]);
  for (const list of byGroup.values()) dense(list.sort(cmp), (x) => x.order, (x, n) => ({ ...x, order: n }), out.bookmarks);
  const pref = Object.values(out.bookmarks).filter((b) => b.preferred).sort((a, b) => (a.preferredOrder ?? 0) - (b.preferredOrder ?? 0) || (a.id < b.id ? -1 : 1));
  dense(pref, (x) => x.preferredOrder ?? -1, (x, n) => ({ ...x, preferredOrder: n }), out.bookmarks);
  return out;
}

// ---- what is synced: layers --------------------------------------------------------------------------------
// Bookmarks, groups and tags (names, URLs, titles, tags, which group a bookmark is in) are always synced. The rest is
// grouped into layers the user can switch off. A layer that is off stays local: this browser keeps its own values,
// and the file keeps the values the other browsers wrote.
export interface SyncScope {
  /** Order of groups and tiles, Preferred stars and their order, promoted groups. */
  order: boolean;
  /** Group colour, icon and collapsed state. */
  look: boolean;
  /** Hidden bookmarks/groups (and "hide until" dates) and the browsers a group is limited to. */
  hidden: boolean;
  /** View settings: layout, size, theme, Launchpad options, custom icons. */
  view: boolean;
}
export const FULL_SCOPE: SyncScope = { order: true, look: true, hidden: true, view: true };
export const CONTENT_SCOPE: SyncScope = { order: false, look: false, hidden: false, view: false };
export const DEFAULT_SCOPE: SyncScope = { order: true, look: true, hidden: false, view: false };

const LAYER_FIELDS = {
  order: { bookmarks: ['order', 'preferred', 'preferredOrder'], groups: ['order', 'promoted'] },
  look: { bookmarks: [] as string[], groups: ['color', 'emoji', 'collapsed'] },
  hidden: { bookmarks: ['hidden', 'hiddenUntil'], groups: ['hidden', 'hiddenUntil', 'browsers'] },
} as const;

/** Fields of this record kind that are NOT synced under `scope`. */
const localOnly = (scope: SyncScope, key: 'bookmarks' | 'groups'): string[] =>
  (['order', 'look', 'hidden'] as const).filter((l) => !scope[l]).flatMap((l) => [...LAYER_FIELDS[l][key]]);

export const VIEW_KEYS = ['theme', 'tileSize', 'layout', 'groupsPerRow', 'showLaunchpad', 'showOften', 'defaultTitle', 'customIcons', 'showTags', 'showGroupHeaders', 'showNumbers', 'tabs', 'showAllTab', 'preferredScale'] as const;
export type ViewSettings = Pick<Settings, (typeof VIEW_KEYS)[number]>;
export const viewOf = (s: Settings): ViewSettings => Object.fromEntries(VIEW_KEYS.map((k) => [k, s[k]])) as unknown as ViewSettings;

/** Three-way merge of the view settings, key by key (file wins when both sides changed). */
export function mergeView(base: Partial<ViewSettings> | null, local: ViewSettings, remote: ViewSettings): { view: ViewSettings; localChanged: boolean; remoteChanged: boolean } {
  const view = { ...local } as Record<string, unknown>;
  for (const k of VIEW_KEYS) {
    const l = local[k], r = remote[k], b = base?.[k];
    if (same(l, r)) continue;
    if (b === undefined) { view[k] = r; continue; }
    const lc = !same(l, b), rc = !same(r, b);
    view[k] = lc && !rc ? l : r;
  }
  const v = view as unknown as ViewSettings;
  return { view: v, localChanged: !same(v, local), remoteChanged: !same(v, remote) };
}

type AnyRec = Record<string, unknown>;
const without = (rec: AnyRec, fields: readonly string[]): AnyRec => { const o = { ...rec }; for (const f of fields) delete o[f]; return o; };
/** `rec` but with `fields` taken from `src` (missing there = removed). Returns `src` itself when that makes them equal. */
function takeFields<T extends AnyRec>(rec: T, src: T, fields: readonly string[]): T {
  if (rec === src || !fields.length) return rec;
  const o: AnyRec = { ...rec };
  for (const f of fields) { if (src[f] !== undefined) o[f] = src[f]; else delete o[f]; }
  return (same(o, src) ? src : o) as T;
}

export function mergeStates(base: DataState | null, localIn: DataState, remote: DataState, scope: SyncScope = FULL_SCOPE): MergeResult {
  const local = base ? localIn : alignIds(localIn, remote);
  const chosen: DataState = { bookmarks: {}, groups: {}, tags: {} };
  const localOut: DataState = { bookmarks: {}, groups: {}, tags: {} };
  const fileOut: DataState = { bookmarks: {}, groups: {}, tags: {} };
  const newHere = { bookmarks: new Set<string>(), groups: new Set<string>() };
  for (const key of KEYS) {
    const B = (base?.[key] ?? {}) as Record<string, Rec>, L = local[key] as Record<string, Rec>, R = remote[key] as Record<string, Rec>;
    const target = chosen[key] as Record<string, Rec>;
    const lo = localOut[key] as Record<string, Rec>, fo = fileOut[key] as Record<string, Rec>;
    const skip = key === 'tags' ? [] : localOnly(scope, key);
    // Content comparison: ignores the layers that are not synced and bookmark timestamps.
    const ign = key === 'bookmarks' ? [...skip, 'updatedAt'] : skip;
    const sameC = (a: Rec, b: Rec) => !ign.length ? same(a, b) : same(without(a as unknown as AnyRec, ign), without(b as unknown as AnyRec, ign));
    for (const id of new Set([...Object.keys(L), ...Object.keys(R)])) {
      const l = L[id], r = R[id], b = B[id];
      let pick: Rec | undefined;
      if (l && r) {
        if (sameC(l, r)) pick = l;
        else if (!b) pick = pickBoth(key, l, r);
        else {
          const lc = !sameC(l, b), rc = !sameC(r, b);
          pick = lc && !rc ? l : rc && !lc ? r : pickBoth(key, l, r);
        }
      } else if (l) {
        if (!b || !sameC(l, b)) pick = l; // new here, or edited here after it was deleted there
      } else if (r) {
        if (!b || !sameC(r, b)) pick = r;
      }
      if (!pick) continue;
      target[id] = pick;
      // This browser keeps its own values for the layers that are off; the file keeps what the others wrote.
      if (l) lo[id] = takeFields(pick as unknown as AnyRec, l as unknown as AnyRec, skip) as unknown as Rec;
      else {
        const o = without(pick as unknown as AnyRec, skip);
        if (key !== 'tags' && skip.includes('order')) { o.order = 0; (newHere[key]).add(id); }
        lo[id] = o as unknown as Rec;
      }
      fo[id] = r ? (takeFields(pick as unknown as AnyRec, r as unknown as AnyRec, skip) as unknown as Rec) : pick;
    }
  }
  // New arrivals go to the end when this browser does not take the order from the file.
  if (newHere.groups.size) {
    let next = Math.max(-1, ...Object.values(localOut.groups).filter((g) => !newHere.groups.has(g.id)).map((g) => g.order)) + 1;
    for (const id of [...newHere.groups].sort((a, b) => (remote.groups[a]?.order ?? 0) - (remote.groups[b]?.order ?? 0))) localOut.groups[id] = { ...localOut.groups[id], order: next++ };
  }
  if (newHere.bookmarks.size) {
    const nextIn = new Map<string | null, number>();
    const end = (g: string | null) => {
      if (!nextIn.has(g)) nextIn.set(g, Math.max(-1, ...Object.values(localOut.bookmarks).filter((b) => b.groupId === g && !newHere.bookmarks.has(b.id)).map((b) => b.order)) + 1);
      const n = nextIn.get(g)!; nextIn.set(g, n + 1); return n;
    };
    for (const id of [...newHere.bookmarks].sort((a, b) => (remote.bookmarks[a]?.order ?? 0) - (remote.bookmarks[b]?.order ?? 0)))
      localOut.bookmarks[id] = { ...localOut.bookmarks[id], order: end(localOut.bookmarks[id].groupId) };
  }
  const state = dedupeTopGroups(tidy(localOut));
  const fileState = dedupeTopGroups(tidy(fileOut));
  return { state, fileState, localChanged: !sameState(state, localIn), remoteChanged: !sameState(fileState, remote) };
}
