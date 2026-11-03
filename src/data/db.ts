// The ONLY module that touches storage. IndexedDB via `idb`.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Bookmark, DataState, Group, Settings, Tag } from '../core/types';
import { DEFAULT_SETTINGS, emptyState } from '../core/types';
import type { StateDiff } from '../core/ops';

interface Schema extends DBSchema {
  bookmarks: { key: string; value: Bookmark };
  groups: { key: string; value: Group };
  tags: { key: string; value: Tag };
  images: { key: string; value: { id: string; blob: Blob; mime: string } };
  meta: { key: string; value: unknown };
}

export type Db = IDBPDatabase<Schema>;

export function openDb(name = 'tilenest'): Promise<Db> {
  return openDB<Schema>(name, 1, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('bookmarks', { keyPath: 'id' });
        db.createObjectStore('groups', { keyPath: 'id' });
        db.createObjectStore('tags', { keyPath: 'id' });
        db.createObjectStore('images', { keyPath: 'id' });
        db.createObjectStore('meta');
      }
    },
  });
}

export async function loadAll(db: Db): Promise<{ state: DataState; settings: Settings }> {
  const [bookmarks, groups, tags, settings] = await Promise.all([
    db.getAll('bookmarks'),
    db.getAll('groups'),
    db.getAll('tags'),
    db.get('meta', 'settings') as Promise<Settings | undefined>,
  ]);
  const state = emptyState();
  for (const b of bookmarks) state.bookmarks[b.id] = b;
  for (const g of groups) state.groups[g.id] = g;
  for (const t of tags) state.tags[t.id] = t;
  // Installs that already have data or saved settings (before modes existed) keep every feature: they start in Advanced.
  const mode = settings?.mode ?? (settings || bookmarks.length || groups.length ? 'advanced' : 'simple');
  return { state, settings: { ...DEFAULT_SETTINGS, ...settings, mode } };
}

/** Applies a diff atomically (single transaction). */
export async function applyDiff(db: Db, d: StateDiff): Promise<void> {
  const tx = db.transaction(['bookmarks', 'groups', 'tags'], 'readwrite');
  for (const b of d.put.bookmarks) tx.objectStore('bookmarks').put(b);
  for (const g of d.put.groups) tx.objectStore('groups').put(g);
  for (const t of d.put.tags) tx.objectStore('tags').put(t);
  for (const id of d.del.bookmarks) tx.objectStore('bookmarks').delete(id);
  for (const id of d.del.groups) tx.objectStore('groups').delete(id);
  for (const id of d.del.tags) tx.objectStore('tags').delete(id);
  await tx.done;
}

// ---- sync bookkeeping (kept in the `meta` store; never exported) ----
export interface SyncBase { state: DataState; at: number; /** view settings as of the last sync (only when view settings are synced) */ view?: Record<string, unknown> }
/** What this browser syncs (layers). Kept per browser; never exported or synced. */
export const getSyncScope = (db: Db) => db.get('meta', 'syncScope') as Promise<Record<string, boolean> | undefined>;
export const saveSyncScope = (db: Db, s: Record<string, boolean>) => db.put('meta', s, 'syncScope');
export const getSyncBase = (db: Db) => db.get('meta', 'syncBase') as Promise<SyncBase | undefined>;
export const saveSyncBase = (db: Db, b: SyncBase) => db.put('meta', b, 'syncBase');
/** The file the user picked (a FileSystemFileHandle; browsers can store it in IndexedDB). */
export const getSyncHandle = (db: Db) => db.get('meta', 'syncHandle') as Promise<unknown | undefined>;
export const saveSyncHandle = (db: Db, h: unknown) => db.put('meta', h, 'syncHandle');
export async function clearSync(db: Db): Promise<void> {
  const tx = db.transaction('meta', 'readwrite');
  tx.store.delete('syncHandle'); tx.store.delete('syncBase');
  await tx.done;
}

/** "This browser is…" chosen by the user when automatic detection is wrong (kept per browser, never exported or synced). */
export const getBrowserOverride = (db: Db) => db.get('meta', 'browserOverride') as Promise<string | undefined>;
export const saveBrowserOverride = (db: Db, v: string) => db.put('meta', v, 'browserOverride');
export const getTopSeeded = (db: Db) => db.get('meta', 'topGroupsSeeded') as Promise<boolean | undefined>;
export const getExtLinksSeeded = (db: Db) => db.get('meta', 'extLinksSeeded') as Promise<boolean | undefined>;
export const saveExtLinksSeeded = (db: Db) => db.put('meta', true, 'extLinksSeeded');
export const getDocLinksSeeded = (db: Db) => db.get('meta', 'docLinksSeeded') as Promise<boolean | undefined>;
export const saveDocLinksSeeded = (db: Db) => db.put('meta', true, 'docLinksSeeded');
export const saveTopSeeded = (db: Db) => db.put('meta', true, 'topGroupsSeeded');
export const saveSettings = (db: Db, s: Settings) => db.put('meta', s, 'settings');

// ---- images (icons the user uploaded or pasted). Stored as local blobs; never fetched at render time. ----
export interface ImageRec { id: string; blob: Blob; mime: string }
export const putImage = (db: Db, rec: ImageRec) => db.put('images', rec);
export const getImage = (db: Db, id: string) => db.get('images', id);
export const getAllImages = (db: Db) => db.getAll('images');
export const listImageIds = (db: Db) => db.getAllKeys('images');
export async function deleteImages(db: Db, ids: string[]): Promise<void> {
  const tx = db.transaction('images', 'readwrite');
  for (const id of ids) tx.store.delete(id);
  await tx.done;
}
