// Pure tag logic. Tag names are unique case-insensitively; the first spelling wins.
import type { Bookmark, DataState, Tag } from './types';

export const MAX_TAG_LENGTH = 32;

/** Trim, collapse spaces, drop leading '#', cap length. Returns '' if nothing usable is left. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
}

const key = (name: string) => name.toLocaleLowerCase();

export const sortedTags = (s: DataState): Tag[] =>
  Object.values(s.tags).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export const findTagByName = (s: DataState, name: string): Tag | undefined => {
  const k = key(normalizeTagName(name));
  return k ? Object.values(s.tags).find((t) => key(t.name) === k) : undefined;
};

/** Number of bookmarks per tag id (tags with no bookmarks are present with 0). */
export function tagCounts(s: DataState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(s.tags)) out[id] = 0;
  for (const b of Object.values(s.bookmarks)) for (const id of b.tagIds) if (id in out) out[id]++;
  return out;
}

/**
 * Resolve user-typed names to tag ids, creating missing tags. Duplicates (any case) collapse.
 * `genId` is injected so this stays pure and testable.
 */
export function ensureTags(s: DataState, names: string[], now: number, genId: () => string): { state: DataState; ids: string[] } {
  let tags = s.tags;
  const ids: string[] = [];
  for (const raw of names) {
    const name = normalizeTagName(raw);
    if (!name) continue;
    const existing = Object.values(tags).find((t) => key(t.name) === key(name));
    const id = existing?.id ?? genId();
    if (!existing) tags = { ...tags, [id]: { id, name, createdAt: now } };
    if (!ids.includes(id)) ids.push(id);
  }
  return { state: tags === s.tags ? s : { ...s, tags }, ids };
}

/** Rename a tag. If the new name already belongs to another tag, the two are merged. */
export function renameTag(s: DataState, id: string, rawName: string): DataState {
  const tag = s.tags[id];
  const name = normalizeTagName(rawName);
  if (!tag || !name || name === tag.name) return s;
  const other = Object.values(s.tags).find((t) => t.id !== id && key(t.name) === key(name));
  if (!other) return { ...s, tags: { ...s.tags, [id]: { ...tag, name } } };
  // merge `id` into `other`
  const { [id]: _gone, ...tags } = s.tags;
  const bookmarks = { ...s.bookmarks };
  for (const b of Object.values(s.bookmarks)) {
    if (!b.tagIds.includes(id)) continue;
    const merged = b.tagIds.map((t) => (t === id ? other.id : t)).filter((t, i, a) => a.indexOf(t) === i);
    bookmarks[b.id] = { ...b, tagIds: merged };
  }
  return { ...s, tags, bookmarks };
}

/** Delete a tag and remove it from every bookmark. */
export function deleteTag(s: DataState, id: string): DataState {
  if (!s.tags[id]) return s;
  const { [id]: _gone, ...tags } = s.tags;
  const bookmarks = { ...s.bookmarks };
  for (const b of Object.values(s.bookmarks)) {
    if (b.tagIds.includes(id)) bookmarks[b.id] = { ...b, tagIds: b.tagIds.filter((t) => t !== id) };
  }
  return { ...s, tags, bookmarks };
}

/** AND filter: a bookmark matches when it has every selected tag. No selection matches everything. */
export const matchesTags = (b: Bookmark, selected: string[]): boolean => selected.every((id) => b.tagIds.includes(id));

/**
 * Give every bookmark in the chosen groups a tag named after its group, all lowercase
 * ("News" -> "news"). `groupIds` = null means every group. Missing tags are created, existing
 * ones (any spelling) are reused, bookmarks that already have the tag are left alone.
 */
export function tagGroupsByName(
  s: DataState, groupIds: string[] | null, now: number, genId: () => string,
): { state: DataState; tagged: number; created: number } {
  const ids = groupIds ?? Object.keys(s.groups);
  let state = s;
  let tagged = 0;
  const before = Object.keys(s.tags).length;
  for (const gid of ids) {
    const group = s.groups[gid];
    if (!group) continue;
    const name = normalizeTagName(group.name.toLocaleLowerCase());
    if (!name) continue;
    const members = Object.values(state.bookmarks).filter((b) => b.groupId === gid);
    if (members.length === 0) continue;
    const r = ensureTags(state, [name], now, genId);
    state = r.state;
    const tagId = r.ids[0];
    const bookmarks = { ...state.bookmarks };
    for (const b of members) {
      if (b.tagIds.includes(tagId)) continue;
      bookmarks[b.id] = { ...b, tagIds: [...b.tagIds, tagId], updatedAt: now };
      tagged++;
    }
    state = { ...state, bookmarks };
  }
  return { state: tagged === 0 && state.tags === s.tags ? s : state, tagged, created: Object.keys(state.tags).length - before };
}
