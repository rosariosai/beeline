export type IconSpec =
  | { kind: 'auto' }
  | { kind: 'image'; imageId: string }
  | { kind: 'builtin'; glyph: string; color: string };

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  groupId: string | null; // null = Ungrouped
  order: number;
  tagIds: string[];
  icon: IconSpec;
  createdAt: number;
  updatedAt: number;
  /** Hidden from the dashboard (not deleted). With hiddenUntil it comes back by itself on that date. */
  hidden?: boolean;
  hiddenUntil?: number;
  /** Preferred bookmark: shown in the large Preferred Launchpad at the top. preferredOrder = position there. */
  preferred?: boolean;
  preferredOrder?: number;
  /** Usage, used for the optional "Often used" row. */
  openCount?: number;
  lastOpenedAt?: number;
}

/** Browsers a group can be limited to. Brave and Chrome run the same extension build but are told apart. */
export type BrowserId = 'chrome' | 'brave' | 'firefox';
export const BROWSERS: { id: BrowserId; label: string }[] = [
  { id: 'chrome', label: 'Chrome' }, { id: 'brave', label: 'Brave' }, { id: 'firefox', label: 'Firefox' },
];

export interface Group {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  hidden?: boolean;
  hiddenUntil?: number;
  /** Accent colour (one of GROUP_COLORS) and an optional emoji shown before the name. */
  color?: string;
  emoji?: string;
  /** Collapsed on the dashboard: only the header (name and count) is shown. */
  collapsed?: boolean;
  /** Only show this group in these browsers (missing = every browser). It still syncs and stays in backups. */
  browsers?: BrowserId[];
  /** Promoted to Preferred: all its bookmarks appear in the Preferred Launchpad and the group itself is hidden from the list. */
  promoted?: boolean;
}

/** The eight group colours of the design. */
export const GROUP_COLORS = ['#4f8cf6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6'] as const;

export interface Tag {
  id: string;
  name: string;
  createdAt: number;
}

export interface DataState {
  bookmarks: Record<string, Bookmark>;
  groups: Record<string, Group>;
  tags: Record<string, Tag>;
}

/** A tab: a named set of groups shown together (2 to 5 tabs). A group can be in several tabs. */
export interface Tab {
  id: string;
  name: string;
  groupIds: string[];
}

export interface Settings {
  /** 'simple' = the basics only; 'advanced' = every feature. Advanced settings are kept (not deleted) while in Simple. */
  mode: 'simple' | 'advanced';
  theme: 'system' | 'light' | 'dark';
  tileSize: 's' | 'm' | 'l';
  /** 'tiles' = big icon cards, 'compact' = one-line rows, 'icons' = icons only (name in the tooltip). */
  layout: 'tiles' | 'compact' | 'icons';
  /** When a bookmark is saved without a title: true = use the site name, false = keep it empty (icon only). */
  defaultTitle: boolean;
  /** Side panel (groups and tags) visible. */
  sidebar: boolean;
  /** 'many' = put several groups side by side when they fit. */
  groupsPerRow: 'one' | 'many' | 'raw';
  /** Show hidden bookmarks/groups (dimmed) instead of hiding them. */
  showHidden: boolean;
  /** New-tab behaviour */
  focusSearch: boolean;
  openIn: 'same' | 'new';
  startView: 'all' | 'last';
  /** Remembered for startView 'last' (null = All bookmarks). */
  lastGroupId: string | null;
  /** Large Preferred Launchpad bar at the top (also in the compact layout). */
  showLaunchpad: boolean;
  /** Optional quiet "Often used" row under the Launchpad. */
  showOften: boolean;
  /** Icons the user added to the group icon picker (emoji or 1–4 characters). */
  customIcons: string[];
  /** Show the tag chips on big tiles (never shown in List and Icons layouts). Hide them for a calmer dashboard; they stay searchable and editable. */
  showTags: boolean;
  /** Group header bars (name, colour band, buttons). Hide them to win space for bigger icons. */
  showGroupHeaders: boolean;
  /** Show a number on every bookmark (TV-channel style); typing the number in the search box and pressing Enter opens it. */
  showNumbers: boolean;
  /** Tabs (supergroups). Empty = no tab bar. Synced with the "View settings" layer. */
  tabs: Tab[];
  /** Keep an "All" tab first in the tab bar. Without it, groups in no tab go to an automatic "Other" tab. */
  showAllTab: boolean;
  /** Size of the Preferred icons as a multiple of a normal bookmark icon: 1 = same size, up to 4. */
  preferredScale: number;
  /** The tab you were on (this browser only). */
  activeTabId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'simple', theme: 'dark', tileSize: 'm', layout: 'tiles', showHidden: false, defaultTitle: true, sidebar: true, groupsPerRow: 'one',
  focusSearch: true, openIn: 'same', startView: 'all', lastGroupId: null,
  showLaunchpad: true, showOften: false, customIcons: [], showTags: true, showGroupHeaders: true, showNumbers: false,
  tabs: [], showAllTab: true, preferredScale: 1.75, activeTabId: null,
};
export const SCHEMA_VERSION = 1;

export const emptyState = (): DataState => ({ bookmarks: {}, groups: {}, tags: {} });
