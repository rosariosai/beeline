import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { Settings } from '../../core/types';
import { MAX_SCALE, MIN_SCALE, SCALE_STEP } from '../../core/tabs';

const R = { fill: 'currentColor', rx: 1.5 } as const;
const pic = (children: ReactNode) => <svg viewBox="0 0 36 26" width="36" height="26" aria-hidden="true">{children}</svg>;

const LAYOUTS: { value: Settings['layout']; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'tiles', label: 'Tiles', hint: 'Big cards with the name', icon: pic(<>{[0, 1, 2].map((i) => <rect key={i} x={2 + i * 11} y={4} width={9} height={18} {...R} />)}</>) },
  { value: 'compact', label: 'List', hint: 'One line each', icon: pic(<>{[0, 1, 2, 3].map((i) => <rect key={i} x={3} y={3 + i * 6} width={30} height={4} {...R} />)}</>) },
  { value: 'icons', label: 'Icons', hint: 'Only icons, name on hover', icon: pic(<>{[0, 1, 2, 3].flatMap((x) => [0, 1].map((y) => <rect key={`${x}${y}`} x={3 + x * 8.5} y={4 + y * 10} width={6} height={7} {...R} />))}</>) },
];
const GROUPS: { value: Settings['groupsPerRow']; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'one', label: 'Boxes', hint: 'Each group is a box, one under the other', icon: pic(<><rect x={3} y={3} width={30} height={9} {...R} /><rect x={3} y={15} width={30} height={9} {...R} /></>) },
  { value: 'many', label: 'Side by side', hint: 'Group boxes next to each other', icon: pic(<><rect x={3} y={3} width={14} height={20} {...R} /><rect x={19} y={3} width={14} height={20} {...R} /></>) },
  { value: 'raw', label: 'No boxes', hint: 'Raw: no group boxes, all bookmarks in one flat grid', icon: pic(<>{[0, 1, 2, 3].flatMap((x) => [0, 1, 2].map((y) => <rect key={`${x}${y}`} x={3 + x * 8.5} y={3 + y * 7} width={6} height={5} {...R} />))}</>) },
];
const LOOKS: { name: string; hint: string; set: Partial<Settings> }[] = [
  { name: 'Classic', hint: 'Big tiles in group boxes', set: { layout: 'tiles', groupsPerRow: 'one', showGroupHeaders: true, showNumbers: false, tileSize: 'm' } },
  { name: 'Compact', hint: 'One line per bookmark, boxes side by side', set: { layout: 'compact', groupsPerRow: 'many', showGroupHeaders: true, showNumbers: false, tileSize: 's' } },
  { name: 'Dense', hint: 'Small numbered icons, everything on one page', set: { layout: 'icons', groupsPerRow: 'raw', showNumbers: true, tileSize: 's' } },
];
/** Simple mode: three looks that only change layout, boxes and size (the advanced view options stay as they are). */
const SIMPLE_LOOKS: typeof LOOKS = [
  { name: 'Classic', hint: 'Big tiles in group boxes', set: { layout: 'tiles', groupsPerRow: 'one', tileSize: 'm' } },
  { name: 'Compact', hint: 'One line per bookmark, boxes side by side', set: { layout: 'compact', groupsPerRow: 'many', tileSize: 's' } },
  { name: 'Icons', hint: 'Small icons only, boxes side by side', set: { layout: 'icons', groupsPerRow: 'many', tileSize: 's' } },
];
const MODES: { value: Settings['mode']; label: string; hint: string }[] = [
  { value: 'simple', label: 'Simple', hint: 'Only the basics: bookmarks, groups, search, Preferred' },
  { value: 'advanced', label: 'Advanced', hint: 'Everything: tabs, tags, numbers, hiding, sync, sizes…' },
];
const SIZES: { value: Settings['tileSize']; label: string }[] = [{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }];

function Choice<T extends string>(props: { legend: string; value: T; onChange(v: T): void; options: { value: T; label: string; hint?: string; icon?: ReactNode }[] }) {
  return (
    <div className="view-row" role="radiogroup" aria-label={props.legend}>
      <div className="view-legend">{props.legend}</div>
      <div className="view-choices">
        {props.options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={props.value === o.value} title={o.hint}
            className={`view-choice${props.value === o.value ? ' view-choice--on' : ''}`} onClick={() => props.onChange(o.value)}>
            {o.icon}<span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One "View" button that gathers every way of showing the bookmarks, instead of separate toggles. */
export function ViewMenu(props: { onEditTabs(): void }) {
  const { settings, rawSettings, updateSettings, advanced } = useStore();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const layout = LAYOUTS.find((l) => l.value === settings.layout)!;
  const groups = GROUPS.find((g) => g.value === settings.groupsPerRow)!;
  // A Quick look is "on" only while every setting it changes still has its value; once you tweak one, the row says Custom.
  const looks = advanced ? LOOKS : SIMPLE_LOOKS;
  const activeLook = looks.find((l) => (Object.keys(l.set) as (keyof Settings)[]).every((k) => settings[k] === l.set[k]));
  return (
    <div className="view-menu" ref={box}>
      <button className="btn btn--view" aria-label="View" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        title={`How bookmarks and groups are shown: ${layout.label}, ${groups.label}`}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" opacity=".75" />
          <rect x="3" y="13" width="8" height="8" rx="2" opacity=".75" /><rect x="13" y="10" width="8" height="11" rx="2" />
        </svg>
      </button>
      {open && (
        <div className="view-pop" role="dialog" aria-label="View options">
          <div className="view-row" role="radiogroup" aria-label="Quick looks">
            <div className="view-legend">Quick looks{activeLook ? '' : ' · Custom'}</div>
            <div className="view-choices">
              {looks.map((l) => (
                <button key={l.name} type="button" role="radio" aria-checked={activeLook?.name === l.name} title={l.hint}
                  className={`view-choice${activeLook?.name === l.name ? ' view-choice--on' : ''}`} onClick={() => updateSettings(l.set)}><span>{l.name}</span></button>
              ))}
            </div>
          </div>
          <Choice legend="Bookmarks look like" value={settings.layout} onChange={(v) => updateSettings({ layout: v })} options={LAYOUTS} />
          <Choice legend="Groups are shown as" value={settings.groupsPerRow} onChange={(v) => updateSettings({ groupsPerRow: v })} options={advanced ? GROUPS : GROUPS.filter((g) => g.value !== 'raw')} />
          {advanced && settings.layout === 'tiles' && (
            <Choice legend="Tags on tiles" value={settings.showTags ? 'show' : 'hide'} onChange={(v) => updateSettings({ showTags: v === 'show' })}
              options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]} />
          )}
          {advanced && settings.groupsPerRow !== 'raw' && <Choice legend="Group headers" value={settings.showGroupHeaders ? 'show' : 'hide'} onChange={(v) => updateSettings({ showGroupHeaders: v === 'show' })}
            options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide (more room)' }]} />}
          {advanced && <Choice legend="Numbers on bookmarks" value={settings.showNumbers ? 'show' : 'hide'} onChange={(v) => updateSettings({ showNumbers: v === 'show' })}
            options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]} />}
          <Choice legend="Size" value={settings.tileSize} onChange={(v) => updateSettings({ tileSize: v })} options={SIZES} />
          {advanced && <div className="view-row">
            <div className="view-legend"><label htmlFor="pref-scale">Preferred size</label></div>
            <div className="view-slider">
              <input id="pref-scale" type="range" min={MIN_SCALE} max={MAX_SCALE} step={SCALE_STEP} value={settings.preferredScale}
                aria-valuetext={settings.preferredScale === 1 ? 'Same size as other bookmarks' : `${settings.preferredScale} times the size of other bookmarks`}
                onChange={(e) => updateSettings({ preferredScale: Number(e.target.value) })} />
              <output htmlFor="pref-scale" className="view-slider-val">{settings.preferredScale === 1 ? 'Same' : `${settings.preferredScale}×`}</output>
            </div>
            <div className="view-slider-ends" aria-hidden="true"><span>Same as others</span><span>4× bigger</span></div>
          </div>}
          {advanced && <div className="view-row">
            <div className="view-legend">Tabs</div>
            <button type="button" className="btn view-tabs-btn" onClick={() => { setOpen(false); props.onEditTabs(); }}>
              {settings.tabs.length ? `✎ Edit tabs (${settings.tabs.map((t) => t.name).join(', ')})` : '＋ Add tabs to sort your groups'}
            </button>
          </div>}
          <Choice legend="Mode" value={rawSettings.mode} onChange={(v) => updateSettings({ mode: v })} options={MODES} />
          <p className="view-note">
            {!advanced ? 'Drag bookmarks inside a box to reorder them, or onto another box or a group in the side panel to move them. Need tabs, tags, numbers or hiding? Switch Mode to Advanced.' : settings.groupsPerRow === 'raw'
              ? 'No boxes: drag an icon to move it; its number follows its place. An icon dropped on another one joins that one’s group.'
              : 'Drag bookmarks inside a box to reorder them, or onto another box or a group in the sidebar to move them. Numbers follow the order you see.'}
          </p>
        </div>
      )}
    </div>
  );
}
