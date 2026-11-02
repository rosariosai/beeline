import type { Bookmark, BrowserId, DataState, Group } from './types';

type Hideable = { hidden?: boolean; hiddenUntil?: number; browsers?: BrowserId[]; promoted?: boolean };

/** The browser this page runs in (set once at start-up). Groups limited to other browsers count as hidden here. */
let currentBrowser: BrowserId | null = null;
export const setCurrentBrowser = (b: BrowserId | null) => { currentBrowser = b; };
/** A group that is limited to other browsers than this one. */
export const isOtherBrowserGroup = (g: { browsers?: BrowserId[] }): boolean =>
  !!currentBrowser && !!g.browsers && g.browsers.length > 0 && !g.browsers.includes(currentBrowser);

/** Hidden now? A "hide until" date in the past means it has come back. */
export const isHiddenFlag = (x: Hideable, now: number): boolean =>
  (x.hidden === true && (x.hiddenUntil === undefined || x.hiddenUntil > now)) || isOtherBrowserGroup(x) || x.promoted === true;

/** Hidden by the user or by browser limits, not merely because the group is promoted to Preferred. */
export const isGroupHiddenForReal = (g: Hideable, now: number): boolean => isHiddenFlag({ ...g, promoted: undefined }, now);

/** A bookmark is hidden when it is hidden itself or its group is. */
export function isBookmarkHidden(s: DataState, b: Bookmark, now: number, forLaunchpad = false): boolean {
  if (isHiddenFlag(b, now)) return true;
  const g = b.groupId ? s.groups[b.groupId] : undefined;
  // In the Preferred Launchpad (and search) a promoted group's bookmarks stay visible.
  return !!g && (forLaunchpad ? isGroupHiddenForReal(g, now) : isHiddenFlag(g, now));
}

/** Number shown on the "Hidden" toggle: hidden bookmarks (own or via group) plus hidden groups. */
export function hiddenCount(s: DataState, now: number): number {
  return Object.values(s.bookmarks).filter((b) => isBookmarkHidden(s, b, now)).length
    + Object.values(s.groups).filter((g) => isHiddenFlag(g, now)).length;
}

/** `until` = timestamp to come back automatically, or null to stay hidden until you unhide it. */
const patchFor = (hide: boolean, until: number | null): Hideable =>
  hide ? (until === null ? { hidden: true } : { hidden: true, hiddenUntil: until }) : {};

function strip<T extends Hideable>(o: T): T {
  const { hidden: _h, hiddenUntil: _u, ...rest } = o;
  return rest as T;
}

export function setBookmarkHidden(s: DataState, id: string, hide: boolean, until: number | null, now: number): DataState {
  const b = s.bookmarks[id];
  if (!b) return s;
  return { ...s, bookmarks: { ...s.bookmarks, [id]: { ...strip(b), ...patchFor(hide, until), updatedAt: now } } };
}

export function setGroupHidden(s: DataState, id: string, hide: boolean, until: number | null): DataState {
  const g: Group | undefined = s.groups[id];
  if (!g) return s;
  return { ...s, groups: { ...s.groups, [id]: { ...strip(g), ...patchFor(hide, until) } } };
}

export const DAY_MS = 24 * 3600 * 1000;
export const HIDE_CHOICES: { label: string; days: number | null }[] = [
  { label: 'Hide until I unhide it', days: null },
  { label: 'Hide for 1 week', days: 7 },
  { label: 'Hide for 1 month', days: 30 },
  { label: 'Hide for 3 months', days: 90 },
  { label: 'Hide for 6 months', days: 182 },
];
export const untilFor = (days: number | null, now: number): number | null => (days === null ? null : now + days * DAY_MS);
