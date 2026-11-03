import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { newId } from '../../core/id';
import { sortedGroups } from '../../core/ops';
import { MAX_TABS, pruneTabs } from '../../core/tabs';
import type { Tab } from '../../core/types';

/** Edit mode for tabs: name 2 to 5 tabs and tick, for every group, the tabs it appears in. */
export function TabsDialog(props: { onClose(): void }) {
  const { allData, settings, updateSettings } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const groups = sortedGroups(allData);
  const [tabs, setTabs] = useState<Tab[]>(() => (settings.tabs.length ? settings.tabs.map((t) => ({ ...t, groupIds: [...t.groupIds] })) : []));
  const [showAll, setShowAll] = useState(settings.showAllTab);
  useEffect(() => { ref.current?.showModal(); }, []);

  const tabName = (i: number) => tabs[i].name.trim() || `Tab ${i + 1}`;
  const add = () => { if (tabs.length < MAX_TABS) setTabs([...tabs, { id: newId(), name: tabs.length === 0 ? 'Work' : tabs.length === 1 ? 'Free time' : '', groupIds: [] }]); };
  const remove = (i: number) => setTabs(tabs.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= tabs.length) return; const n = [...tabs]; [n[i], n[j]] = [n[j], n[i]]; setTabs(n); };
  const rename = (i: number, name: string) => setTabs(tabs.map((t, j) => (j === i ? { ...t, name } : t)));
  const tick = (i: number, gid: string, on: boolean) =>
    setTabs(tabs.map((t, j) => (j === i ? { ...t, groupIds: on ? [...t.groupIds, gid] : t.groupIds.filter((x) => x !== gid) } : t)));
  const setColumn = (i: number, on: boolean) =>
    setTabs(tabs.map((t, j) => (j === i ? { ...t, groupIds: on ? groups.map((g) => g.id) : [] } : t)));
  const inNone = (gid: string) => !tabs.some((t) => t.groupIds.includes(gid));

  const save = () => {
    const ok = pruneTabs(tabs.map((t, i) => ({ ...t, name: tabName(i).slice(0, 40) })), new Set(groups.map((g) => g.id)));
    const keepActive = ok.some((t) => t.id === settings.activeTabId) || settings.activeTabId === '__all' || settings.activeTabId === '__other';
    updateSettings({ tabs: ok, showAllTab: showAll, ...(keepActive ? {} : { activeTabId: null }) });
    ref.current?.close();
  };

  const unassigned = groups.filter((g) => inNone(g.id)).length;
  return (
    <dialog ref={ref} className="dialog dialog--tabs" onClose={props.onClose} aria-labelledby="tabs-title">
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2 id="tabs-title">Tabs</h2>
        <p className="hint">Tabs split your groups into sets, for example <em>Work</em> and <em>Free time</em>. Use 2 to {MAX_TABS}. A group can be in more than one tab, and moving it is just a tick. Nothing is deleted or moved: a tab only chooses which groups you see. Shortcut: drag a group from the side panel onto a tab to copy it there, or drag with the right mouse button to move it from the tab you are on.</p>

        <div className="tabs-names">
          {tabs.map((t, i) => (
            <div key={t.id} className="tabs-name">
              <input value={t.name} maxLength={40} placeholder={`Tab ${i + 1}`} aria-label={`Name of tab ${i + 1}`} onChange={(e) => rename(i, e.target.value)} />
              <button type="button" className="btn btn--sm" aria-label={`Move ${tabName(i)} left`} disabled={i === 0} onClick={() => move(i, -1)}>←</button>
              <button type="button" className="btn btn--sm" aria-label={`Move ${tabName(i)} right`} disabled={i === tabs.length - 1} onClick={() => move(i, 1)}>→</button>
              <button type="button" className="btn btn--sm" aria-label={`Remove tab ${tabName(i)}`} onClick={() => remove(i)}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn--sm" onClick={add} disabled={tabs.length >= MAX_TABS}>+ Add tab{tabs.length >= MAX_TABS ? ` (max ${MAX_TABS})` : ''}</button>
        </div>

        {tabs.length > 0 && (
          <>
            <label className="check">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Keep an “All” tab first (shows every group)
            </label>
            {!showAll && <p className="hint">Without “All”, groups in no tab (and bookmarks without a group) go to an automatic “Other” tab.</p>}
            <div className="tabs-grid-wrap">
              <table className="tabs-grid">
                <caption className="sr-only">Which groups appear in which tab</caption>
                <thead>
                  <tr>
                    <th scope="col">Group</th>
                    {tabs.map((t, i) => (
                      <th key={t.id} scope="col" title={tabName(i)}>
                        <span className="truncate">{tabName(i)}</span>
                        <span className="tabs-colbtns">
                          <button type="button" className="link" onClick={() => setColumn(i, true)} aria-label={`Put every group in ${tabName(i)}`}>all</button>
                          <button type="button" className="link" onClick={() => setColumn(i, false)} aria-label={`Take every group out of ${tabName(i)}`}>none</button>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className={inNone(g.id) ? 'tabs-row--none' : undefined}>
                      <th scope="row"><span className="truncate">{g.color && <span className="side-dot" style={{ background: g.color }} aria-hidden />}{g.emoji ? `${g.emoji} ` : ''}{g.name}</span></th>
                      {tabs.map((t, i) => (
                        <td key={t.id}>
                          <input type="checkbox" checked={t.groupIds.includes(g.id)} aria-label={`${g.name} in ${tabName(i)}`} onChange={(e) => tick(i, g.id, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">{unassigned === 0 ? 'Every group is in at least one tab.' : `${unassigned} group${unassigned === 1 ? ' is' : 's are'} in no tab yet (marked).${showAll ? ' They still show under “All”.' : ' They show under “Other”.'}`}</p>
          </>
        )}
        {tabs.length === 0 && <p className="hint">No tabs yet: the dashboard shows all groups, as before. Add a tab to start.</p>}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="btn btn--primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}
