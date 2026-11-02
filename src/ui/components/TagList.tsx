import { useEffect, useRef, useState } from 'react';
import { deleteTag, renameTag, sortedTags, tagCounts } from '../../core/tags';
import { useStore } from '../store';
import { ContextMenu } from './ContextMenu';

function RenameTag(props: { initial: string; onDone(v: string | null): void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="rename-input" defaultValue={props.initial} aria-label="Tag name" maxLength={40}
      onBlur={(e) => props.onDone(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') props.onDone(e.currentTarget.value); if (e.key === 'Escape') props.onDone(null); }} />
  );
}

export function TagList() {
  const { data, tagFilter, toggleTag, commit } = useStore();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const tags = sortedTags(data);
  const counts = tagCounts(data);
  if (tags.length === 0) {
    return (
      <>
        <h2 className="side-heading">Tags</h2>
        <p className="hint side-hint">No tags yet. Add tags when you edit a bookmark.</p>
      </>
    );
  }

  return (
    <>
      <h2 className="side-heading">Tags</h2>
      {tags.map((t) => (
        <div key={t.id} className="side-row" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }); }}>
          {renaming === t.id ? (
            <RenameTag initial={t.name} onDone={(v) => { setRenaming(null); if (v !== null) commit((s) => renameTag(s, t.id, v)); }} />
          ) : (
            <>
              <button className={`side-item side-tag${tagFilter.includes(t.id) ? ' side-tag--on' : ''}`} aria-pressed={tagFilter.includes(t.id)}
                onClick={() => toggleTag(t.id)} onDoubleClick={() => setRenaming(t.id)}>
                <span className="truncate"># {t.name}</span><span className="count">{counts[t.id]}</span>
              </button>
              <button className="side-more" aria-label={`Actions for tag ${t.name}`} aria-haspopup="menu"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, id: t.id }); }}>⋯</button>
            </>
          )}
        </div>
      ))}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Rename tag', onSelect: () => setRenaming(menu.id) },
          { label: 'Delete tag', danger: true,
            onSelect: () => commit((s) => deleteTag(s, menu.id), `Tag “${data.tags[menu.id]?.name}” deleted. It was removed from its bookmarks.`) },
        ]} />
      )}
    </>
  );
}
