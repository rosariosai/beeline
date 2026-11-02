import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BrowserId, DataState, Settings } from '../core/types';
import { diffState, isEmptyDiff, recordOpen, revertChange, withoutForeignExtLinks } from '../core/ops';
import { applyDiff, saveSettings, type Db } from '../data/db';

export type View = { kind: 'all' } | { kind: 'preferred' } | { kind: 'group'; id: string };
export interface Toast { id: number; message: string; undo?: () => void }

interface Store {
  /** Local database handle (for features outside the bookmark state). */
  db: Db;
  data: DataState;
  /** Everything stored, including links that are not shown in this browser (backups, sync). */
  allData: DataState;
  browser: BrowserId;
  settings: Settings;
  view: View;
  /** Selected tag ids (AND filter). */
  tagFilter: string[];
  /** Search text. Non-empty switches the main area to search results. */
  query: string;
  setQuery(q: string): void;
  toast: Toast | null;
  setView(v: View): void;
  toggleTag(id: string): void;
  clearTags(): void;
  /** Apply a pure op. Pass `undoLabel` for destructive ops to get an Undo toast. */
  commit(fn: (s: DataState) => DataState, undoLabel?: string): void;
  updateSettings(patch: Partial<Settings>): void;
  dismissToast(): void;
  notify(message: string): void;
  undoLast(): void;
  /** Count an open of this bookmark (feeds "Often used"). */
  trackOpen(id: string): void;
  /** Always the newest data (also inside async code). */
  getData(): DataState;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

const TOAST_MS = 8000;

export function StoreProvider(props: { db: Db; browser: BrowserId; initialData: DataState; initialSettings: Settings; children: ReactNode }) {
  const { db } = props;
  const [allData, setData] = useState(props.initialData);
  // What the screens show: the extensions links of other browsers are left out. Backups, sync and edits use allData.
  const data = useMemo(() => withoutForeignExtLinks(allData, props.browser), [allData, props.browser]);
  const [settings, setSettings] = useState(props.initialSettings);
  const [view, setViewState] = useState<View>(() => {
    const { startView, lastGroupId } = props.initialSettings;
    return startView === 'last' && lastGroupId && props.initialData.groups[lastGroupId] ? { kind: 'group', id: lastGroupId } : { kind: 'all' };
  });
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const dataRef = useRef(allData);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number>();
  const toastSeq = useRef(0);

  const persist = useCallback(
    (prev: DataState, next: DataState) => {
      const d = diffState(prev, next);
      if (isEmptyDiff(d)) return;
      // Serialise writes so they land in order.
      queue.current = queue.current.then(() => applyDiff(db, d)).catch((e) => console.error('save failed', e));
    },
    [db],
  );

  const dismissToast = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, undo?: () => void) => {
    window.clearTimeout(timer.current);
    setToast({ id: ++toastSeq.current, message, undo });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const commit = useCallback(
    (fn: (s: DataState) => DataState, undoLabel?: string) => {
      const prev = dataRef.current;
      const next = fn(prev);
      if (next === prev) return;
      dataRef.current = next;
      setData(next);
      persist(prev, next);
      if (undoLabel) {
        showToast(undoLabel, () => {
          const cur = dataRef.current;
          const restored = revertChange(cur, prev, next);
          dataRef.current = restored;
          setData(restored);
          persist(cur, restored);
          setToast(null);
        });
      }
    },
    [persist, showToast],
  );

  const settingsRef = useRef(settings);
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      void saveSettings(db, next);
    },
    [db],
  );

  // Picking a group / All in the sidebar leaves search, and is remembered for "start where I left off".
  const setView = useCallback((v: View) => {
    setViewState(v);
    setQuery('');
    const id = v.kind === 'group' ? v.id : null;
    if (settingsRef.current.lastGroupId !== id) updateSettings({ lastGroupId: id });
  }, [updateSettings]);

  const undoLast = useCallback(() => toast?.undo?.(), [toast]);
  const trackOpen = useCallback((id: string) => commit((s) => recordOpen(s, id, Date.now())), [commit]);

  // If the active group disappears (deleted), fall back to All.
  useEffect(() => {
    if (view.kind === 'group' && !data.groups[view.id]) setView({ kind: 'all' });
  }, [data.groups, view]);

  // Drop filter entries for tags that no longer exist (deleted / merged).
  useEffect(() => {
    setTagFilter((cur) => (cur.every((id) => data.tags[id]) ? cur : cur.filter((id) => data.tags[id])));
  }, [data.tags]);
  const toggleTag = useCallback((id: string) => setTagFilter((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])), []);
  const clearTags = useCallback(() => setTagFilter([]), []);

  // Theme: apply attribute + remember a hint for the pre-paint script.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    try { localStorage.setItem('tilenest-theme', settings.theme); } catch { /* ignore */ }
    root.dataset.tile = settings.tileSize;
    root.dataset.layout = settings.layout;
    root.dataset.headers = settings.showGroupHeaders ? 'show' : 'hide';
    root.dataset.tags = settings.showTags ? 'show' : 'hide';
    root.dataset.autoTitle = settings.defaultTitle ? 'show' : 'hide';
  }, [settings]);

  // Ctrl/Cmd+Z undoes the last destructive action while its toast is visible.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && toast?.undo) {
        e.preventDefault();
        toast.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast]);

  const value = useMemo<Store>(
    () => ({ db, data, allData, browser: props.browser, settings, view, tagFilter, query, setQuery, toast, setView, toggleTag, clearTags, commit, updateSettings, dismissToast, undoLast, trackOpen, getData: () => dataRef.current, notify: showToast }),
    [db, data, allData, props.browser, settings, view, tagFilter, query, toast, setView, toggleTag, clearTags, commit, updateSettings, dismissToast, undoLast, trackOpen, showToast],
  );
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
