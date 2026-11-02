import { useEffect, useRef } from 'react';
import type { Bookmark, DataState } from '../../core/types';
import { highlight, parseQuery } from '../../core/search';
import { hostnameOf } from '../../core/url';
import { TileIcon } from './TileIcon';

export const resultId = (i: number) => `search-result-${i}`;

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return <>{highlight(text, terms).map((seg, i) => (seg.hit ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}</>;
}

export function SearchResults(props: {
  data: DataState;
  results: Bookmark[];
  query: string;
  selected: number;
  onHover(i: number): void;
  /** Open a result. `modifier` is true for Ctrl/Cmd/Shift-click or middle-click. */
  onOpen(b: Bookmark, modifier: boolean): void;
}) {
  const { terms, tagTerms } = parseQuery(props.query);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.children[props.selected]?.scrollIntoView({ block: 'nearest' });
  }, [props.selected]);

  if (props.results.length === 0) {
    return (
      <div className="empty empty--search" id="search-results" role="status">
        <h2>No bookmarks match “{props.query.trim()}”</h2>
        <p>Search looks at titles, web addresses, groups, tags and short labels. Use #tag to search tags only.</p>
      </div>
    );
  }
  return (
    <>
      <p className="results-count" role="status" aria-live="polite">
        {props.results.length} {props.results.length === 1 ? 'result' : 'results'}
      </p>
      <ul className="results" id="search-results" role="listbox" aria-label="Search results" ref={listRef}>
        {props.results.map((b, i) => {
          const group = b.groupId ? props.data.groups[b.groupId]?.name : null;
          const tags = b.tagIds.map((id) => props.data.tags[id]).filter(Boolean);
          return (
            <li key={b.id} id={resultId(i)} role="option" aria-selected={i === props.selected}
              className={`result${i === props.selected ? ' result--sel' : ''}`} onMouseMove={() => props.onHover(i)}>
              <div className="result-link" title={b.url}
                onClick={(e) => props.onOpen(b, e.ctrlKey || e.metaKey || e.shiftKey)}
                onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); props.onOpen(b, true); } }}>
                <span className="result-icon"><TileIcon bookmark={b} /></span>
                <span className="result-main">
                  <span className="result-title"><Marked text={b.title || hostnameOf(b.url)} terms={terms} /></span>
                  <span className="result-url"><Marked text={hostnameOf(b.url) + new URL(b.url).pathname.replace(/\/$/, '')} terms={terms} /></span>
                  {b.description && <span className="result-desc"><Marked text={b.description} terms={terms} /></span>}
                </span>
                <span className="result-meta">
                  {group && <span className="chip chip--group"><Marked text={group} terms={terms} /></span>}
                  {tags.slice(0, 3).map((t) => (
                    <span key={t.id} className="tag-chip"><Marked text={t.name} terms={[...terms, ...tagTerms]} /></span>
                  ))}
                  {tags.length > 3 && <span className="tag-more">+{tags.length - 3}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
