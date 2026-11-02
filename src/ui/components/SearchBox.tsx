import { forwardRef } from 'react';

/** Combobox-style search field. Keyboard handling is supplied by the parent (it owns the results). */
export const SearchBox = forwardRef<HTMLInputElement, {
  value: string;
  onChange(v: string): void;
  onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void;
  activeId?: string;
  expanded: boolean;
  autoFocus?: boolean;
}>(function SearchBox(props, ref) {
  return (
    <div className="searchbox" role="search">
      <span className="searchbox-icon" aria-hidden>⌕</span>
      <input
        ref={ref}
        type="text"
        className="searchbox-input"
        placeholder="Search bookmarks, tags, groups…"
        aria-label="Search bookmarks"
        role="combobox"
        aria-expanded={props.expanded}
        aria-controls="search-results"
        aria-activedescendant={props.activeId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        autoFocus={props.autoFocus}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={props.onKeyDown}
      />
      {props.value ? (
        <button className="searchbox-clear" aria-label="Clear search" onClick={() => props.onChange('')}>×</button>
      ) : (
        <kbd className="searchbox-hint" aria-hidden>/</kbd>
      )}
    </div>
  );
});
