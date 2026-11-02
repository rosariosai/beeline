// Export / backup formats: Tilenest JSON (full fidelity) and Netscape HTML (standard bookmark file).
import type { Bookmark, BrowserId, DataState, Group, IconSpec, Settings, Tag } from './types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './types';
import { bookmarksIn, sortedGroups } from './ops';
import type { ImportedBookmark } from './importing';
import { hostnameOf, normalizeUrl } from './url';

export interface ExportImage { id: string; mime: string; dataUrl: string }

export interface ExportFile {
  app: 'tilenest';
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  groups: Group[];
  tags: Tag[];
  bookmarks: Bookmark[];
  images: ExportImage[];
}

export function buildExportFile(s: DataState, settings: Settings, images: ExportImage[], now: Date): ExportFile {
  const used = new Set(Object.values(s.bookmarks).flatMap((b) => (b.icon.kind === 'image' ? [b.icon.imageId] : [])));
  return {
    app: 'tilenest',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings,
    groups: sortedGroups(s),
    tags: Object.values(s.tags),
    bookmarks: [...Object.values(s.groups).sort((a, b) => a.order - b.order).flatMap((g) => bookmarksIn(s, g.id)), ...bookmarksIn(s, null)],
    images: images.filter((i) => used.has(i.id)),
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function cleanIcon(x: unknown, imageIds: Set<string>): IconSpec {
  if (isObj(x)) {
    if (x.kind === 'builtin' && str(x.glyph) && str(x.color)) return { kind: 'builtin', glyph: x.glyph, color: x.color };
    if (x.kind === 'image' && str(x.imageId) && imageIds.has(x.imageId)) return { kind: 'image', imageId: x.imageId };
  }
  return { kind: 'auto' };
}

export type ParseResult = { ok: true; file: ExportFile; warnings: string[] } | { ok: false; error: string };

/** Strict about structure, forgiving about content: bad records are dropped with a warning, never trusted blindly. */
function usageOf(o: Record<string, unknown>): Partial<Bookmark> {
  const out: Partial<Bookmark> = {};
  if (o.preferred === true) { out.preferred = true; out.preferredOrder = num(o.preferredOrder) ? o.preferredOrder : 0; }
  if (num(o.openCount) && o.openCount > 0) out.openCount = Math.floor(o.openCount);
  if (num(o.lastOpenedAt)) out.lastOpenedAt = o.lastOpenedAt;
  return out;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
function groupStyleOf(g: Record<string, unknown>): { color?: string; emoji?: string; collapsed?: true; browsers?: BrowserId[]; promoted?: true } {
  const out: { color?: string; emoji?: string; collapsed?: true; browsers?: BrowserId[]; promoted?: true } = {};
  if (g.promoted === true) out.promoted = true;
  if (Array.isArray(g.browsers)) {
    const list = [...new Set(g.browsers.filter((x): x is BrowserId => x === 'chrome' || x === 'brave' || x === 'firefox'))].sort();
    if (list.length > 0 && list.length < 3) out.browsers = list;
  }
  if (g.collapsed === true) out.collapsed = true;
  if (str(g.color) && COLOR.test(g.color)) out.color = g.color;
  if (str(g.emoji) && g.emoji.trim() && g.emoji.length <= 8) out.emoji = g.emoji.trim();
  return out;
}

function hiddenOf(o: Record<string, unknown>): { hidden?: true; hiddenUntil?: number } {
  if (o.hidden !== true) return {};
  return num(o.hiddenUntil) ? { hidden: true, hiddenUntil: o.hiddenUntil } : { hidden: true };
}

export function parseExportFile(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (!isObj(raw) || raw.app !== 'tilenest') return { ok: false, error: 'This is not a Beeline (or Tilenest) backup file.' };
  if (!num(raw.schemaVersion) || raw.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Beeline. Update the extension first.' };
  }
  if (!Array.isArray(raw.bookmarks) || !Array.isArray(raw.groups) || !Array.isArray(raw.tags)) {
    return { ok: false, error: 'The backup is missing its bookmarks, groups or tags.' };
  }
  const warnings: string[] = [];
  const groups: Group[] = [];
  for (const g of raw.groups) if (isObj(g) && str(g.id) && str(g.name)) groups.push({ id: g.id, name: g.name, order: num(g.order) ? g.order : groups.length, createdAt: num(g.createdAt) ? g.createdAt : 0, ...hiddenOf(g), ...groupStyleOf(g) });
  const tags: Tag[] = [];
  for (const t of raw.tags) if (isObj(t) && str(t.id) && str(t.name)) tags.push({ id: t.id, name: t.name, createdAt: num(t.createdAt) ? t.createdAt : 0 });
  const images: ExportImage[] = [];
  if (Array.isArray(raw.images)) for (const i of raw.images) if (isObj(i) && str(i.id) && str(i.mime) && str(i.dataUrl) && /^data:image\//.test(i.dataUrl)) images.push({ id: i.id, mime: i.mime, dataUrl: i.dataUrl });
  const groupIds = new Set(groups.map((g) => g.id)), tagIds = new Set(tags.map((t) => t.id)), imageIds = new Set(images.map((i) => i.id));
  const bookmarks: Bookmark[] = [];
  let dropped = 0;
  for (const b of raw.bookmarks) {
    const url = isObj(b) && str(b.url) ? normalizeUrl(b.url) : null;
    if (!isObj(b) || !str(b.id) || !url) { dropped++; continue; }
    bookmarks.push({
      id: b.id, url, title: str(b.title) ? b.title.trim() : url,
      description: str(b.description) && b.description ? b.description.slice(0, 60) : undefined,
      groupId: str(b.groupId) && groupIds.has(b.groupId) ? b.groupId : null,
      order: num(b.order) ? b.order : bookmarks.length,
      tagIds: Array.isArray(b.tagIds) ? b.tagIds.filter((x): x is string => str(x) && tagIds.has(x)) : [],
      icon: cleanIcon(b.icon, imageIds),
      createdAt: num(b.createdAt) ? b.createdAt : 0,
      updatedAt: num(b.updatedAt) ? b.updatedAt : 0,
      ...hiddenOf(b),
      ...usageOf(b),
    });
  }
  if (dropped) warnings.push(`${dropped} invalid ${dropped === 1 ? 'entry was' : 'entries were'} skipped.`);
  const st = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    theme: st.theme === 'light' || st.theme === 'dark' || st.theme === 'system' ? st.theme : DEFAULT_SETTINGS.theme,
    tileSize: st.tileSize === 's' || st.tileSize === 'm' || st.tileSize === 'l' ? st.tileSize : DEFAULT_SETTINGS.tileSize,
    defaultTitle: typeof st.defaultTitle === 'boolean' ? st.defaultTitle : DEFAULT_SETTINGS.defaultTitle,
    sidebar: typeof st.sidebar === 'boolean' ? st.sidebar : DEFAULT_SETTINGS.sidebar,
    groupsPerRow: st.groupsPerRow === 'many' || st.groupsPerRow === 'one' || st.groupsPerRow === 'raw' ? st.groupsPerRow : DEFAULT_SETTINGS.groupsPerRow,
    layout: st.layout === 'compact' || st.layout === 'tiles' || st.layout === 'icons' ? st.layout : DEFAULT_SETTINGS.layout,
    showHidden: typeof st.showHidden === 'boolean' ? st.showHidden : DEFAULT_SETTINGS.showHidden,
    focusSearch: typeof st.focusSearch === 'boolean' ? st.focusSearch : DEFAULT_SETTINGS.focusSearch,
    openIn: st.openIn === 'new' || st.openIn === 'same' ? st.openIn : DEFAULT_SETTINGS.openIn,
    startView: st.startView === 'last' || st.startView === 'all' ? st.startView : DEFAULT_SETTINGS.startView,
    showLaunchpad: typeof st.showLaunchpad === 'boolean' ? st.showLaunchpad : DEFAULT_SETTINGS.showLaunchpad,
    showOften: typeof st.showOften === 'boolean' ? st.showOften : DEFAULT_SETTINGS.showOften,
    showGroupHeaders: typeof st.showGroupHeaders === 'boolean' ? st.showGroupHeaders : DEFAULT_SETTINGS.showGroupHeaders,
    showNumbers: typeof st.showNumbers === 'boolean' ? st.showNumbers : DEFAULT_SETTINGS.showNumbers,
    showTags: typeof st.showTags === 'boolean' ? st.showTags : DEFAULT_SETTINGS.showTags,
    customIcons: Array.isArray(st.customIcons) ? [...new Set(st.customIcons.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 16).map((x) => x.trim()))].slice(0, 60) : [],
    lastGroupId: str(st.lastGroupId) && groupIds.has(st.lastGroupId) ? st.lastGroupId : null,
  };
  const file: ExportFile = { app: 'tilenest', schemaVersion: raw.schemaVersion, exportedAt: str(raw.exportedAt) ? raw.exportedAt : '', settings, groups, tags, bookmarks, images };
  // Backups made by the full Tilenest (with calendar notes) are accepted; the calendar part is simply ignored.
  return { ok: true, warnings, file };
}

/** "Replace everything" restore. */
export function stateFromExport(f: ExportFile): DataState {
  const s: DataState = { bookmarks: {}, groups: {}, tags: {} };
  for (const g of f.groups) s.groups[g.id] = g;
  for (const t of f.tags) s.tags[t.id] = t;
  for (const b of f.bookmarks) s.bookmarks[b.id] = b;
  return s;
}

/** "Merge" restore: feed the file through the normal import planner (dedupe, group/tag reuse). */
export function exportToImported(f: ExportFile): ImportedBookmark[] {
  const group = new Map(f.groups.map((g) => [g.id, g]));
  const tag = new Map(f.tags.map((t) => [t.id, t.name]));
  const order = (b: Bookmark) => (b.groupId ? (group.get(b.groupId)?.order ?? 0) : Infinity);
  return [...f.bookmarks]
    .sort((a, b) => order(a) - order(b) || a.order - b.order)
    .map((b) => ({
      url: b.url, title: b.title, description: b.description,
      folderPath: b.groupId && group.has(b.groupId) ? [group.get(b.groupId)!.name] : [],
      tags: b.tagIds.map((id) => tag.get(id)).filter((x): x is string => !!x),
      addedAt: b.createdAt || undefined,
      icon: b.icon.kind === 'auto' ? undefined : b.icon,
    }));
}

// ---------- Netscape HTML ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildNetscapeHtml(s: DataState, now: Date): string {
  // Implausible stored dates (before 1990) are exported as "now" so other browsers don't show 1970.
  const secs = (ms: number) => Math.floor((ms > 631152000000 ? ms : now.getTime()) / 1000);
  const link = (b: Bookmark, indent: string) => {
    const tags = b.tagIds.map((id) => s.tags[id]?.name.replace(/,/g, ' ')).filter(Boolean).join(',');
    return `${indent}<DT><A HREF="${esc(b.url)}" ADD_DATE="${secs(b.createdAt)}"${tags ? ` TAGS="${esc(tags)}"` : ''}>${esc(b.title || hostnameOf(b.url))}</A>\n` +
      (b.description ? `${indent}<DD>${esc(b.description)}\n` : '');
  };
  let out = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->\n' +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  for (const g of sortedGroups(s)) {
    const items = bookmarksIn(s, g.id);
    if (!items.length) continue;
    out += `    <DT><H3 ADD_DATE="${secs(g.createdAt)}">${esc(g.name)}</H3>\n    <DL><p>\n${items.map((b) => link(b, '        ')).join('')}    </DL><p>\n`;
  }
  out += bookmarksIn(s, null).map((b) => link(b, '    ')).join('');
  return out + '</DL><p>\n';
}
