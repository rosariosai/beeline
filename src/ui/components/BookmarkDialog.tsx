import { useEffect, useRef, useState } from 'react';
import type { Bookmark, DataState, IconSpec } from '../../core/types';
import { normalizeUrl } from '../../core/url';
import { sortedGroups } from '../../core/ops';
import { useStore } from '../store';
import { sortedTags } from '../../core/tags';
import { TagInput } from './TagInput';
import { isHiddenFlag, HIDE_CHOICES } from '../../core/hidden';
import { IconEditor, draftFromIcon, resolveIcon, type IconDraft } from './IconEditor';

export interface BookmarkFormValue { url: string; title: string; description: string; groupId: string | null; tagNames: string[]; icon: IconSpec; preferred: boolean;
  /** undefined = leave as it is; 'show' = unhide; otherwise hide for that many days ('forever' = until unhidden) */
  hide?: 'show' | 'forever' | number }

export function BookmarkDialog(props: {
  data: DataState;
  editing: Bookmark | null;
  defaultGroupId: string | null;
  onSave(v: BookmarkFormValue): void;
  onClose(): void;
}) {
  const { editing } = props;
  const { settings, advanced } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState(editing?.url ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [groupId, setGroupId] = useState<string | null>(editing ? editing.groupId : props.defaultGroupId);
  const [tagNames, setTagNames] = useState<string[]>(() => (editing?.tagIds ?? []).map((id) => props.data.tags[id]?.name).filter(Boolean) as string[]);
  const [iconDraft, setIconDraft] = useState<IconDraft>(() => draftFromIcon(editing?.icon ?? { kind: 'auto' }));
  const nowHidden = !!editing && isHiddenFlag(editing, Date.now());
  const [hide, setHide] = useState<string>(nowHidden ? 'keep' : 'show');
  const [preferred, setPreferred] = useState(!!editing?.preferred);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ref.current?.showModal(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeUrl(url);
    if (!clean) { setError('Enter a valid web address, e.g. example.com'); return; }
    setSaving(true);
    try {
      const icon = await resolveIcon(iconDraft);
      props.onSave({ url: clean, title: title.trim(), description: description.trim(), groupId, tagNames, icon, preferred,
        hide: hide === 'keep' ? undefined : hide === 'show' || hide === 'forever' ? hide : Number(hide) });
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Could not save the icon.');
    }
  };

  return (
    <dialog ref={ref} className="dialog" onClose={props.onClose} aria-labelledby="bm-dlg-title">
      <form onSubmit={submit}>
        <h2 id="bm-dlg-title">{editing ? 'Edit bookmark' : 'Add bookmark'}</h2>
        <label>Web address
          <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }}
            placeholder="example.com" inputMode="url" aria-invalid={!!error} aria-describedby={error ? 'bm-err' : undefined} />
        </label>
        {error && <p id="bm-err" className="field-error" role="alert">{error}</p>}
        <label>Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={settings.defaultTitle ? 'Optional: empty shows the site name' : 'Optional: empty shows only the icon'} />
        </label>
        {advanced && <label><span>Short label <span className="optional">(optional)</span></span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={60} />
        </label>}
        <label>Group
          <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value || null)}>
            <option value="">Ungrouped</option>
            {sortedGroups(props.data).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="check check--preferred">
          <input type="checkbox" checked={preferred} onChange={(e) => setPreferred(e.target.checked)} />
          <span><span className="launch-star" aria-hidden>★</span> Preferred <span className="optional">: show it as a large button at the top</span></span>
        </label>
        {advanced && <label>Visibility
          <select value={hide} onChange={(e) => setHide(e.target.value)}>
            {nowHidden && <option value="keep">Hidden (keep as it is)</option>}
            <option value="show">Visible</option>
            <option value="forever">Hidden until I unhide it</option>
            {HIDE_CHOICES.filter((c) => c.days !== null).map((c) => <option key={c.days} value={String(c.days)}>{c.label.replace('Hide', 'Hidden')}</option>)}
          </select>
        </label>}
        <IconEditor url={url} title={title} value={iconDraft} onChange={setIconDraft} />
        {advanced && <div className="field">
          <span className="field-label">Tags</span>
          <TagInput value={tagNames} onChange={setTagNames} suggestions={sortedTags(props.data).map((t) => t.name)} />
        </div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>{editing ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </dialog>
  );
}
