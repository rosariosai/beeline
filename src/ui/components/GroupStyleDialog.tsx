import { useEffect, useRef, useState } from 'react';
import { BROWSERS, GROUP_COLORS, type BrowserId } from '../../core/types';
import { setGroupBrowsers, setGroupPromoted, setGroupStyle } from '../../core/ops';
import { useStore } from '../store';

const EMOJI = ['⭐', '🏠', '💼', '🛠️', '💻', '🖥️', '📰', '📚', '🎓', '🎨', '🎵', '🎬', '🎮', '📷', '✈️', '🚗', '🛒', '💳', '💰', '📈', '💬', '✉️', '📅', '☁️', '🔒', '🔧', '🤖', '⚡', '💡', '🌡️', '📺', '🍳', '❤️', '🏋️', '🧪', '🌍', '🔥', '📁', '🧠', '🛡️'];
const COLOR_NAMES = ['Blue', 'Purple', 'Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Teal'];

/** Small sheet to pick a group's colour (8 dots) and an optional emoji. */
export function GroupStyleDialog(props: { groupId: string; onClose(): void }) {
  const { allData, commit, browser, settings, updateSettings } = useStore();
  const g = allData.groups[props.groupId];
  const ref = useRef<HTMLDialogElement>(null);
  const [color, setColor] = useState<string | null>(g?.color ?? null);
  const [emoji, setEmoji] = useState(g?.emoji ?? '');
  const [promoted, setPromoted] = useState(!!g?.promoted);
  const [shown, setShown] = useState<BrowserId[]>(g?.browsers?.length ? g.browsers : BROWSERS.map((b) => b.id));
  useEffect(() => { ref.current?.showModal(); }, []);
  if (!g) return null;

  const save = () => {
    commit((s) => setGroupPromoted(setGroupBrowsers(setGroupStyle(s, g.id, { color, emoji: emoji.trim() ? [...emoji.trim()].slice(0, 4).join('') : null }), g.id, shown), g.id, promoted));
    ref.current?.close();
  };

  return (
    <dialog ref={ref} className="dialog dialog--small" onClose={props.onClose} aria-labelledby="gs-title">
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2 id="gs-title">Group options: {g.name}</h2>
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches" role="radiogroup" aria-label="Group colour">
            <button type="button" role="radio" aria-checked={color === null} aria-label="Automatic" title="Automatic"
              className={`swatch swatch--auto${color === null ? ' swatch--on' : ''}`} onClick={() => setColor(null)}>A</button>
            {GROUP_COLORS.map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={COLOR_NAMES[i]} title={COLOR_NAMES[i]}
                className={`swatch${color === c ? ' swatch--on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Icon <span className="optional">(optional)</span></span>
          <div className="emoji-row">
            {EMOJI.map((e) => (
              <button key={e} type="button" className={`emoji-btn${emoji === e ? ' emoji-btn--on' : ''}`} aria-label={`Use ${e}`} aria-pressed={emoji === e}
                onClick={() => setEmoji(emoji === e ? '' : e)}>{e}</button>
            ))}
          </div>
          {settings.customIcons.length > 0 && (
            <div className="emoji-row" aria-label="My icons">
              {settings.customIcons.map((e) => (
                <span key={e} className="emoji-custom">
                  <button type="button" className={`emoji-btn${emoji === e ? ' emoji-btn--on' : ''}`} aria-pressed={emoji === e}
                    onClick={() => setEmoji(emoji === e ? '' : e)}>{e}</button>
                  <button type="button" className="emoji-del" aria-label={`Remove ${e} from my icons`} title="Remove from my icons"
                    onClick={() => updateSettings({ customIcons: settings.customIcons.filter((x) => x !== e) })}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="emoji-add">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} placeholder="Type any emoji or 1–4 letters" aria-label="Icon" />
            <button type="button" className="btn" disabled={!emoji.trim() || settings.customIcons.includes([...emoji.trim()].slice(0, 4).join('')) || EMOJI.includes(emoji.trim())}
              title="Keep this icon in the picker for every group"
              onClick={() => { const v = [...emoji.trim()].slice(0, 4).join(''); updateSettings({ customIcons: [...settings.customIcons, v].slice(0, 60) }); setEmoji(v); }}>
              + Add to my icons
            </button>
          </div>
        </div>
        <label className="check field">
          <input type="checkbox" checked={promoted} onChange={(e) => setPromoted(e.target.checked)} />
          Promote to Preferred: show all its bookmarks in the Preferred bar and hide the group itself
        </label>
        <fieldset className="field browsers">
          <legend className="field-label">Show this group in</legend>
          <div className="browser-row">
            {BROWSERS.map((b) => (
              <label key={b.id} className="check">
                <input type="checkbox" checked={shown.includes(b.id)}
                  onChange={(e) => setShown((cur) => (e.target.checked ? [...cur, b.id] : cur.length > 1 ? cur.filter((x) => x !== b.id) : cur))} />
                {b.label}{b.id === browser ? ' (this browser)' : ''}
              </label>
            ))}
          </div>
          <p className="hint">Untick a browser to hide this group there: it then counts as a hidden group (visible, dimmed, under 👁 Hidden). It stays in your backups and keeps syncing.{!shown.includes(browser) ? ' It will be hidden in this browser when you save.' : ''}</p>
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="btn btn--primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}
