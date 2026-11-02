import { useEffect, useRef, useState } from 'react';
import { canKeepFile, type SyncApi } from '../sync';
import { CONTENT_SCOPE, DEFAULT_SCOPE, FULL_SCOPE, type SyncScope } from '../../core/syncfile';
import type { Settings } from '../../core/types';
import { extensionVersion } from '../../browser/api';
import { useStore } from '../store';
import { saveBrowserOverride } from '../../data/db';
import { canSaveFavicons, collectFavicons } from '../saveFavicons';
import { restoreExtensionLinks, updateBookmark } from '../../core/ops';

function Radios<T extends string>(props: {
  legend: string; name: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void;
}) {
  return (
    <fieldset className="setting">
      <legend>{props.legend}</legend>
      <div className="radios">
        {props.options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={props.name} value={o.value} checked={props.value === o.value}
              onChange={() => props.onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsDialog(props: { onClose(): void; onOpenData(): void; sync: SyncApi }) {
  const { status: st } = props.sync;
  const { settings, updateSettings, browser, db, commit, getData, notify } = useStore();
  const [iconMsg, setIconMsg] = useState<string | null>(null);
  const [iconBusy, setIconBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => updateSettings({ [k]: v } as Partial<Settings>);

  return (
    <dialog ref={ref} className="dialog dialog--wide" onClose={props.onClose} aria-labelledby="settings-title">
      <div className="dialog-body">
        <h2 id="settings-title">Settings</h2>

        <section className="data-section settings-card" style={{ '--sc': '#14b8a6' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>🧭</span><span className="sc-num">1</span>This browser</h3>
          <p className="hint">Beeline thinks this is <strong>{browser === 'brave' ? 'Brave' : browser === 'firefox' ? 'Firefox' : 'Chrome'}</strong>. It uses this to know which “Top …” group is yours. Brave can look like Chrome to extensions, so if it is wrong, choose the right one (the page reloads).</p>
          <div className="data-actions">
            {(['chrome', 'brave', 'firefox'] as const).map((b) => (
              <button key={b} className={`btn${browser === b ? ' btn--primary' : ''}`} aria-pressed={browser === b}
                onClick={() => { void saveBrowserOverride(db, b).then(() => location.reload()); }}>{b === 'chrome' ? 'Chrome' : b === 'brave' ? 'Brave' : 'Firefox'}</button>
            ))}
          </div>
        </section>

        <section className="data-section settings-card" style={{ '--sc': '#3b82f6' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>⟳</span><span className="sc-num">2</span>Sync between browsers</h3>
          <p className="hint">Keep Chrome and Brave in step through <strong>one file</strong> in a folder that your cloud drive already syncs (Google Drive, OneDrive, Dropbox, Syncthing…). Beeline only reads and writes that file; nothing goes anywhere else.</p>
          {canKeepFile() ? (
            st.linked ? (
              <>
                <p className="summary">Linked file: <strong>{st.fileName}</strong>{st.lastSyncAt ? ` · last synced ${new Date(st.lastSyncAt).toLocaleString()}` : ''}{!st.allowed ? ' · click “Sync now” to allow access again' : ''}</p>
                <div className="data-actions">
                  <button className="btn btn--primary" disabled={st.busy} onClick={() => void props.sync.syncNow()}>{st.busy ? 'Syncing…' : 'Sync now'}</button>
                  <button className="btn" disabled={st.busy} onClick={() => void props.sync.unlink()}>Stop syncing</button>
                </div>
                <fieldset className="field sync-scope">
                  <legend className="field-label">What is synced</legend>
                  <div className="data-actions">
                    {([['Content only', CONTENT_SCOPE], ['Recommended', DEFAULT_SCOPE], ['Everything', FULL_SCOPE]] as [string, SyncScope][]).map(([label, sc]) => {
                      const on = (['order', 'look', 'hidden', 'view'] as const).every((k) => props.sync.scope[k] === sc[k]);
                      return <button key={label} className={`btn${on ? ' btn--primary' : ''}`} aria-pressed={on} disabled={st.busy} onClick={() => void props.sync.setScope(sc)}>{label}</button>;
                    })}
                  </div>
                  <label className="check"><input type="checkbox" checked disabled /> Bookmarks, groups, tags (always)</label>
                  {([
                    ['order', 'Order and Preferred (order of groups and tiles, ★ Preferred, promoted groups)'],
                    ['look', 'Group look (colour, icon, collapsed)'],
                    ['hidden', 'Hidden items and which browsers show a group'],
                    ['view', 'View settings (layout, size, theme, Launchpad…)'],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="check"><input type="checkbox" checked={props.sync.scope[k]} disabled={st.busy}
                      onChange={(e) => void props.sync.setScope({ ...props.sync.scope, [k]: e.target.checked })} /> {label}</label>
                  ))}
                  <p className="hint">What you switch off stays as it is in this browser; the file keeps the values the other browsers wrote.</p>
                </fieldset>
              </>
            ) : (
              <div className="data-actions">
                <button className="btn btn--primary" onClick={() => void props.sync.link('create')}>Create sync file…</button>
                <button className="btn" onClick={() => void props.sync.link('existing')}>Use an existing sync file…</button>
              </div>
            )
          ) : (
            browser === 'brave' ? (
              <p className="hint">Brave switches off the feature that lets Beeline keep a sync file. To turn it on: open <strong>brave://flags/#file-system-access-api</strong>, set it to <strong>Enabled</strong>, click <strong>Relaunch</strong>, then come back here. Until then use <strong>Import / Export</strong> (Download backup in the other browser, then import it here).</p>
            ) : (
            <p className="hint">Automatic sync works in Chrome and Brave. This browser ({browser === 'firefox' ? 'Firefox' : 'it'}) cannot keep a file linked, so use <strong>Import / Export</strong> to bring your bookmarks here: in the other browser choose <em>Download backup</em>, then here import it and choose <em>Replace everything</em>.</p>
            )
          )}
          {st.message && <p className="summary" role="status">{st.message}</p>}
          {st.error && <p className="field-error" role="alert">{st.error}</p>}
        </section>

        <section className="data-section settings-card" style={{ '--sc': '#f59e0b' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>★</span><span className="sc-num">3</span>Preferred</h3>
          <label className="check">
            <input type="checkbox" checked={settings.showLaunchpad} onChange={(e) => set('showLaunchpad', e.target.checked)} />
            Show the Preferred Launchpad
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.showOften} onChange={(e) => set('showOften', e.target.checked)} />
            Show an “Often used” row
          </label>
          <p className="hint">Set a bookmark as preferred in its Edit dialog. Preferred bookmarks are the same in every browser.</p>
          <p className="hint">Each browser has its own group (Top Chrome, Top Brave, Top Firefox), shown normally only in that browser; the others appear under 👁 Hidden. Promote a group to Preferred from its menu.</p>
        </section>

        <section className="data-section settings-card" style={{ '--sc': '#a855f7' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>🔖</span><span className="sc-num">4</span>Bookmarks</h3>
          <label className="check">
            <input type="checkbox" checked={settings.showTags} onChange={(e) => set('showTags', e.target.checked)} />
            Show tags on big tiles (List and Icons never show them)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.defaultTitle} onChange={(e) => set('defaultTitle', e.target.checked)} />
            Show the site name for bookmarks without a title
          </label>
          <p className="hint">Applies to every layout (tiles, list, icons) and to bookmarks you already have. Turn it off and bookmarks without a title show only their icon (the site name is still used for screen readers and menus).</p>
          <div className="data-actions">
            <button className="btn" onClick={() => {
              const before = getData();
              const after = restoreExtensionLinks(before, Date.now(), browser);
              if (after === before) { notify('Nothing to restore: the built-in links are all there.'); return; }
              commit(() => after);
              notify('Built-in links restored (Personal extensions for this browser, and the two Beeline documentation links). Look in Top ' + (browser === 'brave' ? 'Brave' : browser === 'firefox' ? 'Firefox' : 'Chrome') + ' or Ungrouped.');
            }}>Restore built-in links</button>
          </div>
          <p className="hint">Brings back the built-in links if they are missing: this browser’s extensions page link (also unhidden) and the two Beeline documentation links. It does not touch any other bookmark (unlike importing a backup, which replaces or merges your whole collection).</p>
        </section>

        <section className="data-section settings-card" style={{ '--sc': '#22c55e' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>➕</span><span className="sc-num">5</span>New tab behaviour</h3>
          <label className="check">
            <input type="checkbox" checked={settings.focusSearch} onChange={(e) => set('focusSearch', e.target.checked)} />
            Put the cursor in the search box when a new tab opens
          </label>
          <Radios legend="Open bookmarks in" name="openin" value={settings.openIn} onChange={(v) => set('openIn', v)}
            options={[{ value: 'same', label: 'The same tab' }, { value: 'new', label: 'A new tab' }]} />
          <Radios legend="Start on" name="startview" value={settings.startView} onChange={(v) => set('startView', v)}
            options={[{ value: 'all', label: 'All bookmarks' }, { value: 'last', label: 'Where I left off' }]} />
        </section>

        <section className="data-section settings-card" style={{ '--sc': '#94a3b8' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>💾</span><span className="sc-num">6</span>Your data</h3>
          <p className="hint">Your bookmarks are stored in this browser: no accounts, no tracking, nothing is sent anywhere.{canKeepFile() ? ' The only thing that leaves is the sync file you choose above.' : ''}</p>
          <div className="data-actions">
            <button className="btn" onClick={() => { ref.current?.close(); props.onOpenData(); }}>Import / Export…</button>
            {canSaveFavicons() && (
              <button className="btn" disabled={iconBusy} title="Copies the site icons your browser already has into Beeline, so they appear in backups, sync and Firefox"
                onClick={async () => {
                  setIconBusy(true); setIconMsg('Copying icons…');
                  try {
                    const r = await collectFavicons(getData(), (d, t) => setIconMsg(`Copying icons… ${d} of ${t}`));
                    if (r.saved) commit((s) => { let n = s; const now = Date.now(); for (const [bid, img] of r.map) if (n.bookmarks[bid]?.icon.kind === 'auto') n = updateBookmark(n, bid, { icon: { kind: 'image', imageId: img } }, now); return n; });
                    setIconMsg(`Saved ${r.saved} site icon${r.saved === 1 ? '' : 's'} into your bookmarks.${r.missing ? ` ${r.missing} had no icon in this browser (they stay letters; open the site once or pick an image).` : ''}`);
                  } catch { setIconMsg('Could not copy the icons.'); }
                  finally { setIconBusy(false); }
                }}>Save site icons into my bookmarks</button>
            )}
          </div>
          {iconMsg && <p className="summary" role="status">{iconMsg}</p>}
        </section>

        <section className="data-section settings-card" style={{ '--sc': '#ec4899' } as React.CSSProperties}>
          <h3><span className="sc-icon" aria-hidden>🎨</span><span className="sc-num">7</span>Display</h3>
          <Radios legend="Theme" name="theme" value={settings.theme} onChange={(v) => set('theme', v)}
            options={[{ value: 'system', label: 'Match my system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <p className="hint">Layout (tiles, list, icons), size, groups per row and tags on tiles are in the <strong>◫ View</strong> menu in the top bar; the side panel opens with ☰.</p>
        </section>

        <p className="hint about">Beeline {extensionVersion()}</p>
        <div className="dialog-actions">
          <button className="btn btn--primary" onClick={() => ref.current?.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}
