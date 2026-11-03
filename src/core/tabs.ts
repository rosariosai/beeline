// Tabs ("supergroups"): 2 to 5 named sets of groups. Pure logic, no storage and no browser APIs.
// A group can be in several tabs. Which tab you are on only filters what is shown; nothing is moved or deleted.
import type { Tab } from './types';

export const MAX_TABS = 5;
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const SCALE_STEP = 0.25;
export const ALL_TAB_ID = '__all';
export const OTHER_TAB_ID = '__other';

/** What the tab bar shows: your tabs plus the optional automatic "All" and "Other". */
export interface TabView { id: string; name: string; kind: 'all' | 'tab' | 'other' }

const assignedIds = (tabs: Tab[]) => new Set(tabs.flatMap((t) => t.groupIds));

/**
 * The tab bar entries. No tabs = no bar (the dashboard works as before). With "All" off, groups that are in no tab
 * (and ungrouped bookmarks) go to an automatic "Other" tab, so nothing can get lost.
 */
export function tabViews(tabs: Tab[], showAll: boolean, groupIds: string[], hasUngrouped: boolean): TabView[] {
  if (!tabs.length) return [];
  const out: TabView[] = [];
  if (showAll) out.push({ id: ALL_TAB_ID, name: 'All', kind: 'all' });
  for (const t of tabs) out.push({ id: t.id, name: t.name, kind: 'tab' });
  if (!showAll) {
    const assigned = assignedIds(tabs);
    if (hasUngrouped || groupIds.some((id) => !assigned.has(id))) out.push({ id: OTHER_TAB_ID, name: 'Other', kind: 'other' });
  }
  return out;
}

/** The tab you are on: the remembered one if it still exists, else the first. */
export const activeTabView = (views: TabView[], id: string | null): TabView | null =>
  views.find((v) => v.id === id) ?? views[0] ?? null;

/** Ids of the groups that belong to `view`; null = every group (no filtering). */
export function groupIdsIn(view: TabView | null, tabs: Tab[], groupIds: string[]): Set<string> | null {
  if (!view || view.kind === 'all') return null;
  if (view.kind === 'tab') return new Set(tabs.find((t) => t.id === view.id)?.groupIds ?? []);
  const assigned = assignedIds(tabs);
  return new Set(groupIds.filter((id) => !assigned.has(id)));
}

/** Ungrouped bookmarks are shown under "All" and "Other", never under a named tab. */
export const showsUngrouped = (view: TabView | null): boolean => !view || view.kind !== 'tab';

/** Put the group in the tab, or take it out. Returns the same array when nothing changes. */
export function toggleGroupInTab(tabs: Tab[], tabId: string, groupId: string, on?: boolean): Tab[] {
  const t = tabs.find((x) => x.id === tabId);
  if (!t) return tabs;
  const has = t.groupIds.includes(groupId);
  const want = on ?? !has;
  if (want === has) return tabs;
  return tabs.map((x) => (x.id === tabId ? { ...x, groupIds: want ? [...x.groupIds, groupId] : x.groupIds.filter((g) => g !== groupId) } : x));
}

/** Put a group in tab `to`; with `from` it leaves that tab (a move), without it stays where it is (a copy). */
export function moveGroupToTab(tabs: Tab[], groupId: string, to: string, from?: string | null): Tab[] {
  let out = toggleGroupInTab(tabs, to, groupId, true);
  if (from && from !== to) out = toggleGroupInTab(out, from, groupId, false);
  return out;
}

/** Forget groups that no longer exist. */
export function pruneTabs(tabs: Tab[], groupIds: Set<string>): Tab[] {
  return tabs.map((t) => (t.groupIds.every((g) => groupIds.has(g)) ? t : { ...t, groupIds: t.groupIds.filter((g) => groupIds.has(g)) }));
}

/** Read tabs from untrusted data (backups, sync file): at most 5, unique ids, named, only known groups when `valid` is given. */
export function cleanTabs(raw: unknown, valid?: Set<string>): Tab[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Tab[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || o.id.startsWith('__') || seen.has(o.id)) continue;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : '';
    if (!name) continue;
    seen.add(o.id);
    const ids = Array.isArray(o.groupIds) ? [...new Set(o.groupIds.filter((g): g is string => typeof g === 'string' && (!valid || valid.has(g))))] : [];
    out.push({ id: o.id, name, groupIds: ids });
    if (out.length === MAX_TABS) break;
  }
  return out;
}

export const clampScale = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1.75;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n / SCALE_STEP) * SCALE_STEP));
};
