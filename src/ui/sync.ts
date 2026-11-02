// Sync through one shared file, kept linked through a saved file handle (File System Access API: Chrome and Brave).
// Firefox has no such API, so sync is not offered there (use Import / Export).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataState, Settings } from '../core/types';
import { buildExportFile, parseExportFile, stateFromExport } from '../core/exporting';
import { DEFAULT_SCOPE, mergeStates, mergeView, viewOf, type SyncScope, type ViewSettings } from '../core/syncfile';
import { clearSync, getSyncBase, getSyncHandle, getSyncScope, saveSyncBase, saveSyncHandle, saveSyncScope } from '../data/db';
import { useStore } from './store';
import { exportAllImages, importImages } from './images';

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}
type Picker = {
  showSaveFilePicker?(o: unknown): Promise<FileHandle>;
  showOpenFilePicker?(o: unknown): Promise<FileHandle[]>;
};
const win = () => window as unknown as Picker;
const PICK_TYPES = [{ description: 'Beeline sync file', accept: { 'application/json': ['.json'] } }];

export const canKeepFile = () => typeof win().showSaveFilePicker === 'function' && typeof win().showOpenFilePicker === 'function';
export const SYNC_FILE_NAME = 'beeline-sync.json';

export interface SyncStatus {
  /** A file is linked (Chrome/Brave) */
  linked: boolean;
  fileName: string | null;
  /** Permission for the linked file is active in this session */
  allowed: boolean;
  busy: boolean;
  lastSyncAt: number | null;
  error: string | null;
  message: string | null;
}

interface Io {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export function useSync() {
  const { db, settings, getData, commit, updateSettings, allData: data } = useStore();
  const [scope, setScopeState] = useState<SyncScope>(DEFAULT_SCOPE);
  const scopeRef = useRef<SyncScope>(DEFAULT_SCOPE);
  const [status, setStatus] = useState<SyncStatus>({ linked: false, fileName: null, allowed: false, busy: false, lastSyncAt: null, error: null, message: null });
  const handle = useRef<FileHandle | null>(null);
  const running = useRef(false);
  const lastMerged = useRef<DataState | null>(null);
  const patch = useCallback((p: Partial<SyncStatus>) => setStatus((s) => ({ ...s, ...p })), []);

  /** One full sync round with the given file access. Returns a short human message. */
  const runWith = useCallback(async (io: Io): Promise<string> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = await io.read();
      let remote: DataState | null = null;
      let remoteSettings: Settings | null = null;
      let remoteImages: Awaited<ReturnType<typeof exportAllImages>> = [];
      if (text && text.trim()) {
        const r = parseExportFile(text);
        if (!r.ok) throw new Error(`The sync file cannot be used: ${r.error} Nothing was changed.`);
        remote = stateFromExport(r.file);
        remoteImages = r.file.images;
        remoteSettings = r.file.settings;
      }
      const local = getData();
      const baseRec = await getSyncBase(db);
      const base = baseRec?.state ?? null;
      const sc = scopeRef.current;
      const m = remote ? mergeStates(base, local, remote, sc) : { state: local, fileState: local, localChanged: false, remoteChanged: true };
      // View settings (layout, size, theme…) travel only when that layer is on; otherwise the file keeps the others' values.
      let fileSettings: Settings = remoteSettings ?? settings;
      let viewLocal: ViewSettings | null = null, viewRemoteChanged = false;
      if (sc.view && remoteSettings) {
        const v = mergeView((baseRec?.view as Partial<ViewSettings> | undefined) ?? null, viewOf(settings), viewOf(remoteSettings));
        if (v.localChanged) viewLocal = v.view;
        viewRemoteChanged = v.remoteChanged;
        fileSettings = { ...remoteSettings, ...v.view };
      } else if (sc.view) fileSettings = settings;
      if (remoteImages.length) await importImages(remoteImages);
      if (m.localChanged) {
        let applied = false;
        commit((cur) => { if (cur !== local) return cur; applied = true; return m.state; });
        if (!applied) continue; // you changed something while syncing: start again with the newest data
      }
      if (viewLocal) updateSettings(viewLocal);
      if (m.remoteChanged || viewRemoteChanged) await io.write(JSON.stringify(buildExportFile(m.fileState, fileSettings, await exportAllImages(), new Date()), null, 1));
      await saveSyncBase(db, { state: m.state, at: Date.now(), view: sc.view ? { ...viewOf(settings), ...(viewLocal ?? {}) } : baseRec?.view });
      lastMerged.current = m.localChanged ? m.state : local;
      const now = Date.now();
      patch({ lastSyncAt: now });
      return !remote ? 'Sync file created.' : m.localChanged && m.remoteChanged ? 'Merged: this browser and the file were both updated.'
        : m.localChanged ? 'Updated this browser from the file.' : m.remoteChanged ? 'Saved your changes to the file.' : 'Already up to date.';
    }
    throw new Error('Your bookmarks kept changing while syncing. Try again.');
  }, [db, getData, commit, updateSettings, settings, patch]);

  const guard = useCallback(async (fn: () => Promise<string>) => {
    if (running.current) return;
    running.current = true;
    patch({ busy: true, error: null, message: null });
    try { patch({ message: await fn() }); }
    catch (e) { patch({ error: e instanceof Error ? e.message : 'Sync failed.' }); }
    finally { running.current = false; patch({ busy: false }); }
  }, [patch]);

  const fileIo = useCallback((h: FileHandle): Io => ({
    async read() { const f = await h.getFile(); return f.size ? await f.text() : null; },
    async write(text) { const w = await h.createWritable(); await w.write(text); await w.close(); },
  }), []);

  const hasPermission = async (h: FileHandle, ask: boolean) => {
    if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
    return ask && (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  };

  // On start: find the saved file; if the browser still allows it, sync quietly.
  useEffect(() => {
    let live = true;
    void (async () => {
      const saved = await getSyncScope(db).catch(() => undefined);
      if (saved) { const s = { ...DEFAULT_SCOPE, ...saved } as SyncScope; scopeRef.current = s; setScopeState(s); }
      const h = (await getSyncHandle(db).catch(() => undefined)) as FileHandle | undefined;
      const base = await getSyncBase(db).catch(() => undefined);
      if (!live || !h) return;
      handle.current = h;
      const allowed = await hasPermission(h, false).catch(() => false);
      patch({ linked: true, fileName: h.name, allowed, lastSyncAt: base?.at ?? null });
      if (allowed) void guard(() => runWith(fileIo(h)));
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After you change something: save it to the file a few seconds later (only when allowed).
  useEffect(() => {
    if (!status.linked || !status.allowed || data === lastMerged.current) return;
    const t = window.setTimeout(() => { const h = handle.current; if (h) void guard(() => runWith(fileIo(h))); }, 5000);
    return () => window.clearTimeout(t);
  }, [data, status.linked, status.allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Link a file: create a new one or pick an existing one. Must be called from a click. */
  const link = useCallback(async (mode: 'create' | 'existing') => {
    let h: FileHandle;
    try {
      if (mode === 'create') h = await win().showSaveFilePicker!({ suggestedName: SYNC_FILE_NAME, types: PICK_TYPES });
      else h = (await win().showOpenFilePicker!({ types: PICK_TYPES, multiple: false }))[0];
    } catch { return; } // cancelled
    if (!(await hasPermission(h, true))) { patch({ error: 'Permission to change the file was not given.' }); return; }
    await clearSync(db); // a new file starts with a first sync (matching by URL and name)
    await saveSyncHandle(db, h);
    handle.current = h;
    lastMerged.current = null;
    patch({ linked: true, fileName: h.name, allowed: true, lastSyncAt: null });
    await guard(() => runWith(fileIo(h)));
  }, [db, patch, guard, runWith, fileIo]);

  /** Sync now; asks the browser for permission first when needed (click needed). */
  const syncNow = useCallback(async () => {
    const h = handle.current;
    if (!h) return;
    if (!(await hasPermission(h, true))) { patch({ allowed: false, error: 'Allow access to the sync file to sync.' }); return; }
    patch({ allowed: true });
    await guard(() => runWith(fileIo(h)));
  }, [guard, runWith, fileIo, patch]);

  const unlink = useCallback(async () => {
    await clearSync(db);
    handle.current = null; lastMerged.current = null;
    setStatus({ linked: false, fileName: null, allowed: false, busy: false, lastSyncAt: null, error: null, message: 'Sync stopped. Your bookmarks and the file were not changed.' });
  }, [db]);

  /** Choose what is synced; saved per browser, then a sync runs right away (the click lets the browser ask for access). */
  const setScope = useCallback(async (next: SyncScope) => {
    scopeRef.current = next; setScopeState(next);
    await saveSyncScope(db, { ...next }).catch(() => undefined);
    if (handle.current) await syncNow();
  }, [db, syncNow]);

  return { status, link, syncNow, unlink, scope, setScope };
}

export type SyncApi = ReturnType<typeof useSync>;
