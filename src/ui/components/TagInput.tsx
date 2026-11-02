import { useId, useState } from 'react';
import { normalizeTagName } from '../../core/tags';

/**
 * Chip input. Enter or comma adds the typed tag; Backspace on an empty field removes the last one.
 * Suggestions come from the browser-native <datalist> (accessible, no custom popup to maintain).
 */
export function TagInput(props: { value: string[]; suggestions: string[]; onChange(v: string[]): void }) {
  const [text, setText] = useState('');
  const listId = useId();
  const has = (n: string) => props.value.some((v) => v.toLocaleLowerCase() === n.toLocaleLowerCase());

  const commit = (raw: string) => {
    const name = normalizeTagName(raw);
    setText('');
    if (name && !has(name)) props.onChange([...props.value, name]);
  };

  return (
    <div className="taginput">
      <ul className="taginput-chips" aria-label="Tags">
        {props.value.map((t) => (
          <li key={t} className="chip">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => props.onChange(props.value.filter((v) => v !== t))}>×</button>
          </li>
        ))}
      </ul>
      <input
        value={text}
        list={listId}
        placeholder={props.value.length ? 'Add another…' : 'Type a tag, press Enter'}
        aria-label="Add a tag"
        maxLength={40}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(',')) { v.split(',').slice(0, -1).forEach(commit); setText(v.split(',').pop() ?? ''); }
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(text); }
          else if (e.key === 'Backspace' && !text && props.value.length) props.onChange(props.value.slice(0, -1));
        }}
        onBlur={() => text.trim() && commit(text)}
      />
      <datalist id={listId}>
        {props.suggestions.filter((s) => !has(s)).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
