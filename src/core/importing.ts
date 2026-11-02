// Pure import logic: parse sources into ImportedBookmark[], plan (dedupe, folder selection), apply in bulk.
import type { Bookmark, DataState, Group, IconSpec } from './types';
import { fold } from './search';
import { normalizeTagName } from './tags';
import { hostnameOf, normalizeUrl } from './url';

export interface ImportedBookmark {
  url: string;
  title: string;
  /** Folder names from the top. Empty = loose (not in any folder). */
  folderPath: string[];
  tags: string[];
  description?: string;
  /** ms since epoch */
  addedAt?: number;
  icon?: IconSpec;
}

export const PATH_SEP = '\u0001';
export const pathKey = (p: string[]) => p.join(PATH_SEP);
export const groupNameFor = (p: string[]) => p.join(' / ');

/**
 * Key for duplicate detection: ignores scheme (http/https), "www.", fragment and a trailing slash,
 * and is case-insensitive for the host. Query strings are kept (they usually identify the page).
 */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.port ? ':' + u.port : ''}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

// ---------- sources ----------

/** A node of chrome.bookmarks / browser.bookmarks getTree(). */
export interface BrowserNode { title: string; url?: string; dateAdded?: number; children?: BrowserNode[] }

export function fromBrowserTree(roots: BrowserNode[]): { items: ImportedBookmark[]; skipped: number } {
  const items: ImportedBookmark[] = [];
  let skipped = 0;
  const walk = (node: BrowserNode, path: string[]) => {
    if (node.url !== undefined) {
      const url = normalizeUrl(node.url, false);
      if (!url) { skipped++; return; }
      items.push({ url, title: node.title?.trim() || hostnameOf(url), folderPath: path, tags: [], addedAt: node.dateAdded });
      return;
    }
    const next = node.title?.trim() ? [...path, node.title.trim()] : path; // the unnamed root adds no level
    for (const c of node.children ?? []) walk(c, next);
  };
  for (const r of roots) walk(r, []);
  return { items, skipped };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const stripTags = (s: string) => decode(s.replace(/<[^>]*>/g, '')).trim();

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-z_][a-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** Netscape bookmark file (what Chrome, Firefox, Edge, Safari export). Tolerant tag scanner, no DOM needed. */
export function parseNetscapeHtml(html: string): { items: ImportedBookmark[]; skipped: number } {
  const items: ImportedBookmark[] = [];
  let skipped = 0;
  const re = /<\s*(\/?)\s*(dl|h3|a|dd)\b([^>]*)>/gi;
  const stack: (string | null)[] = [];
  let pending: string | null = null;
  let last: ImportedBookmark | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const close = m[1] === '/', tag = m[2].toLowerCase();
    if (tag === 'dl') {
      if (close) { stack.pop(); last = null; } else { stack.push(pending); pending = null; }
    } else if (tag === 'h3' && !close) {
      const end = html.slice(re.lastIndex).search(/<\s*\/\s*h3|<\s*\/?\s*(?:dt|dl|a|h3|dd)\b/i);
      pending = stripTags(html.slice(re.lastIndex, end < 0 ? undefined : re.lastIndex + end)) || null;
    } else if (tag === 'a' && !close) {
      const end = html.slice(re.lastIndex).search(/<\s*\/\s*a\s*>|<\s*\/?\s*(?:dt|dl|a|h3|dd)\b/i);
      const title = stripTags(html.slice(re.lastIndex, end < 0 ? undefined : re.lastIndex + end));
      const a = attrsOf(m[3]);
      const url = a.href ? normalizeUrl(a.href, false) : null;
      if (!url) { skipped++; last = null; continue; }
      const secs = Number(a.add_date);
      last = {
        url,
        title: title || hostnameOf(url),
        folderPath: stack.filter((x): x is string => !!x),
        tags: (a.tags ?? '').split(',').map(normalizeTagName).filter(Boolean),
        addedAt: Number.isFinite(secs) && secs > 0 ? secs * 1000 : undefined,
      };
      items.push(last);
    } else if (tag === 'dd' && !close && last) {
      const rest = html.slice(re.lastIndex);
      const end = rest.search(/<\s*\/?\s*(dt|dl)\b/i);
      const text = stripTags(end < 0 ? rest : rest.slice(0, end));
      if (text) last.description = text.slice(0, 60);
    }
  }
  return { items, skipped };
}

// ---------- planning ----------

export interface FolderInfo { key: string; path: string[]; name: string; depth: number; count: number }

/** Folders (every level) with the number of bookmarks directly inside, in first-seen order. */
export function folderList(items: ImportedBookmark[]): FolderInfo[] {
  const seen = new Map<string, FolderInfo>();
  const touch = (path: string[], direct: boolean) => {
    const key = pathKey(path);
    let f = seen.get(key);
    if (!f) { f = { key, path, name: path[path.length - 1] ?? '', depth: path.length, count: 0 }; seen.set(key, f); }
    if (direct) f.count++;
  };
  for (const it of items) {
    for (let i = 1; i <= it.folderPath.length; i++) touch(it.folderPath.slice(0, i), i === it.folderPath.length);
    if (it.folderPath.length === 0) touch([], true);
  }
  return [...seen.values()];
}

export interface ImportPlan {
  toAdd: ImportedBookmark[];
  /** Already on the dashboard, or repeated inside the import. */
  duplicates: number;
  /** Groups that will be created (existing same-name groups are reused). */
  newGroups: string[];
}

/** `selected` = set of folder keys to import (null = everything). Only a bookmark's own folder counts. */
export function planImport(
  s: DataState,
  items: ImportedBookmark[],
  selected: Set<string> | null,
  opts: { emptyPathGroup: string | null } = { emptyPathGroup: 'Imported' },
): ImportPlan {
  const have = new Set(Object.values(s.bookmarks).map((b) => urlKey(b.url)));
  const groupNames = new Set(Object.values(s.groups).map((g) => fold(g.name)));
  const toAdd: ImportedBookmark[] = [];
  const newGroups: string[] = [];
  let duplicates = 0;
  for (const it of items) {
    if (selected && !selected.has(pathKey(it.folderPath))) continue;
    const k = urlKey(it.url);
    if (have.has(k)) { duplicates++; continue; }
    have.add(k);
    toAdd.push(it);
    const name = it.folderPath.length ? groupNameFor(it.folderPath) : opts.emptyPathGroup;
    if (name && !groupNames.has(fold(name))) { groupNames.add(fold(name)); newGroups.push(name); }
  }
  return { toAdd, duplicates, newGroups };
}

/** Bulk-add in O(n). Same-name groups and tags are reused. */
export function applyImport(
  s: DataState,
  items: ImportedBookmark[],
  now: number,
  genId: () => string,
  opts: { emptyPathGroup: string | null } = { emptyPathGroup: 'Imported' },
): DataState {
  const groups: Record<string, Group> = { ...s.groups };
  const tags = { ...s.tags };
  const bookmarks: Record<string, Bookmark> = { ...s.bookmarks };
  const groupByName = new Map(Object.values(groups).map((g) => [fold(g.name), g.id]));
  const tagByName = new Map(Object.values(tags).map((t) => [fold(t.name), t.id]));
  let nextGroupOrder = Math.max(-1, ...Object.values(groups).map((g) => g.order)) + 1;
  const nextOrder = new Map<string | null, number>();
  for (const b of Object.values(bookmarks)) nextOrder.set(b.groupId, Math.max(nextOrder.get(b.groupId) ?? 0, b.order + 1));

  const groupFor = (path: string[]): string | null => {
    const name = path.length ? groupNameFor(path) : opts.emptyPathGroup;
    if (!name) return null;
    let id = groupByName.get(fold(name));
    if (!id) {
      id = genId();
      groups[id] = { id, name, order: nextGroupOrder++, createdAt: now };
      groupByName.set(fold(name), id);
    }
    return id;
  };
  const tagFor = (raw: string): string | null => {
    const name = normalizeTagName(raw);
    if (!name) return null;
    let id = tagByName.get(fold(name));
    if (!id) { id = genId(); tags[id] = { id, name, createdAt: now }; tagByName.set(fold(name), id); }
    return id;
  };

  for (const it of items) {
    const groupId = groupFor(it.folderPath);
    const order = nextOrder.get(groupId) ?? 0;
    nextOrder.set(groupId, order + 1);
    const id = genId();
    const tagIds = [...new Set(it.tags.map(tagFor).filter((x): x is string => !!x))];
    const added = it.addedAt && it.addedAt > 631152000000 && it.addedAt <= now ? it.addedAt : now; // after 1990, not future
    bookmarks[id] = {
      id, url: it.url, title: it.title, description: it.description || undefined, groupId, order, tagIds,
      icon: it.icon ?? { kind: 'auto' }, createdAt: added, updatedAt: now,
    };
  }
  return { bookmarks, groups, tags };
}
