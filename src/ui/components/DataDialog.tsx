import { useEffect, useMemo, useRef, useState } from 'react';
import { applyImport, folderList, fromBrowserTree, parseNetscapeHtml, pathKey, planImport, type FolderInfo, type ImportedBookmark } from '../../core/importing';
import { buildExportFile, buildNetscapeHtml, exportToImported, parseExportFile, stateFromExport, type ExportFile } from '../../core/exporting';
import { getBrowserBookmarkTree, requestBookmarksPermission } from '../../browser/api';
import { newId } from '../../core/id';
import { downloadText, readFileText, today } from '../files';
import { exportAllImages, importImages } from '../images';
import { useStore } from '../store';

interface Source {
  label: string;
  items: ImportedBookmark[];
  skipped: number;
  warnings: string[];
  /** Present for Beeline backups: enables "replace everything". */
  backup?: ExportFile;
}

export function DataDialog(props: { onClose(): void }) {
  const { allData: data, rawSettings, commit, updateSettings } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ref.current?.showModal(); }, []);

  // Loose items: backups keep them Ungrouped; browser/HTML files put them in a group called "Imported".
  const opts = useMemo(() => ({ emptyPathGroup: source?.backup ? null : 'Imported' }), [source]);
  const folders = useMemo(() => (source ? folderList(source.items) : []), [source]);
  const plan = useMemo(() => (source ? planImport(data, source.items, selected, opts) : null), [data, source, selected, opts]);

  const begin = (s: Source) => {
    setSource(s);
    setSelected(new Set(folderList(s.items).map((f) => f.key)));
    setMode('merge');
    setError('');
  };

  const fromBrowser = async () => {
    setBusy(true); setError('');
    try {
      if (!(await requestBookmarksPermission())) throw new Error('Permission to read your browser bookmarks was not granted. Nothing was imported.');
      const { items, skipped } = fromBrowserTree(await getBrowserBookmarkTree());
      if (!items.length) throw new Error('No web bookmarks were found in the browser.');
      begin({ label: 'your browser bookmarks', items, skipped, warnings: [] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the browser bookmarks.'); }
    finally { setBusy(false); }
  };

  const fromFile = async (f: File) => {
    setBusy(true); setError('');
    try {
      const text = await readFileText(f);
      if (text.trimStart().startsWith('{')) {
        const r = parseExportFile(text);
        if (!r.ok) throw new Error(r.error);
        begin({ label: f.name, items: exportToImported(r.file), skipped: 0, warnings: r.warnings, backup: r.file });
      } else {
        const { items, skipped } = parseNetscapeHtml(text);
        if (!items.length) throw new Error('No bookmarks were found in that file. Use a bookmarks .html file exported from a browser, or a Beeline .json backup.');
        begin({ label: f.name, items, skipped, warnings: [] });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read that file.'); }
    finally { setBusy(false); }
  };

  const toggle = (f: FolderInfo) => {
    const keys = folders.filter((x) => x.key === f.key || (f.path.length > 0 && x.path.length > f.path.length && pathKey(x.path.slice(0, f.path.length)) === f.key)).map((x) => x.key);
    setSelected((cur) => {
      const next = new Set(cur);
      const on = !cur.has(f.key);
      for (const k of keys) on ? next.add(k) : next.delete(k);
      return next;
    });
  };

  const doImport = async () => {
    if (!source || !plan) return;
    setBusy(true); setError('');
    try {
      if (source.backup) await importImages(source.backup.images);
      if (source.backup && mode === 'replace') {
        const backup = source.backup;
        commit(() => stateFromExport(backup), 'Replaced everything with the backup.');
        { const { mode: _keep, ...rest } = backup.settings; updateSettings(rest); } // the mode is a choice of this browser, not part of a backup
      } else {
        const g = plan.newGroups.length;
        commit((s) => {
          const p = planImport(s, source.items, selected, opts);
          return applyImport(s, p.toAdd, Date.now(), newId, opts);
        }, `Imported ${plan.toAdd.length} ${plan.toAdd.length === 1 ? 'bookmark' : 'bookmarks'}${g ? ` and ${g} ${g === 1 ? 'group' : 'groups'}` : ''}.`);
      }
      ref.current?.close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); setBusy(false); }
  };

  const exportJson = async () => {
    setBusy(true);
    try {
      const file = buildExportFile(data, rawSettings, await exportAllImages(), new Date());
      downloadText(`beeline-backup-${today()}.json`, JSON.stringify(file, null, 2), 'application/json');
    } finally { setBusy(false); }
  };
  const exportHtml = () => downloadText(`beeline-bookmarks-${today()}.html`, buildNetscapeHtml(data, new Date()), 'text/html');

  const count = Object.keys(data.bookmarks).length;
  const replacing = !!source?.backup && mode === 'replace';

  return (
    <dialog ref={ref} className="dialog dialog--wide" onClose={props.onClose} aria-labelledby="data-dlg-title">
      <div className="dialog-body">
        <h2 id="data-dlg-title">{source ? `Import from ${source.label}` : 'Import and export'}</h2>

        {!source && (
          <>
            <section className="data-section">
              <h3>Import</h3>
              <div className="data-actions">
                <button className="btn btn--primary" disabled={busy} onClick={() => void fromBrowser()}>Import my browser bookmarks</button>
                <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>Import from a file…</button>
                <input ref={fileRef} type="file" accept=".html,.htm,.json,text/html,application/json" hidden aria-label="Choose a bookmarks file"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromFile(f); e.target.value = ''; }} />
              </div>
              <p className="hint">Browser bookmarks: you will be asked to allow reading them. Files: a bookmarks <code>.html</code> exported from Chrome, Firefox or Edge, or a Beeline <code>.json</code> backup. Bookmarks you already have are never duplicated.</p>
            </section>
            <section className="data-section">
              <h3>Export</h3>
              <div className="data-actions">
                <button className="btn" disabled={busy || count === 0} onClick={() => void exportJson()}>Download backup (.json)</button>
                <button className="btn" disabled={count === 0} onClick={exportHtml}>Download bookmarks (.html)</button>
              </div>
              <p className="hint">The backup holds everything: bookmarks, groups, tags, icons and settings. The .html file is the standard format that any browser can import.</p>
            </section>
            <section className="data-section data-where">
              <h3>Where is my data?</h3>
              <p>Only in this browser, inside this extension's private storage on this computer. It is not synced, not uploaded and not shared. Removing the extension deletes it, so download a backup now and then.</p>
            </section>
          </>
        )}

        {source && plan && (
          <>
            <p>Found <strong>{source.items.length}</strong> {source.items.length === 1 ? 'bookmark' : 'bookmarks'} in {folders.filter((f) => f.count > 0).length} {folders.filter((f) => f.count > 0).length === 1 ? 'folder' : 'folders'}.
              {source.skipped > 0 && (source.skipped === 1
                ? <> 1 link that is not a web page was skipped.</>
                : <> {source.skipped} links that are not web pages were skipped.</>)}</p>
            {source.warnings.map((w) => <p key={w} className="hint">{w}</p>)}

            {source.backup && (
              <div className="radios" role="radiogroup" aria-label="How to restore">
                <label><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Add to what I have <span className="hint">(skips duplicates)</span></label>
                <label><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace everything with this backup <span className="hint">(you can undo)</span></label>
              </div>
            )}

            {!replacing && (
              <>
                <div className="data-actions">
                  <span className="field-label" style={{ margin: 0 }}>Folders to import</span>
                  <button className="btn btn--sm" onClick={() => setSelected(new Set(folders.map((f) => f.key)))}>All</button>
                  <button className="btn btn--sm" onClick={() => setSelected(new Set())}>None</button>
                </div>
                <ul className="foldertree" aria-label="Folders to import">
                  {folders.map((f) => (
                    <li key={f.key} style={{ paddingLeft: Math.max(0, f.depth - 1) * 20 }}>
                      <label>
                        <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f)} />
                        <span className="truncate">{f.path.length ? f.name : source.backup ? 'Ungrouped' : 'Not in a folder'}</span>
                        <span className="count">{f.count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="summary" role="status" aria-live="polite">
                  <strong>{plan.toAdd.length}</strong> new {plan.toAdd.length === 1 ? 'bookmark' : 'bookmarks'}
                  {plan.newGroups.length > 0 && <> in <strong>{plan.newGroups.length}</strong> new {plan.newGroups.length === 1 ? 'group' : 'groups'}</>}
                  {plan.duplicates > 0 && <> · {plan.duplicates} already here, skipped</>}
                </p>
              </>
            )}
            {replacing && <p className="summary">This replaces your <strong>{count}</strong> current bookmarks with the <strong>{source.backup!.bookmarks.length}</strong> in the backup, and restores its settings.</p>}
          </>
        )}

        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          {source ? (
            <>
              <button className="btn" onClick={() => { setSource(null); setError(''); }}>Back</button>
              <button className="btn btn--primary" disabled={busy || (!replacing && (plan?.toAdd.length ?? 0) === 0)} onClick={() => void doImport()}>
                {replacing ? 'Replace everything' : `Import ${plan?.toAdd.length ?? 0}`}
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => ref.current?.close()}>Close</button>
          )}
        </div>
      </div>
    </dialog>
  );
}
