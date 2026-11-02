import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Bookmark } from '../../core/types';
import { LAUNCH_PREFIX } from '../dnd';
import { bookmarkLabel } from '../../core/url';
import { TileIcon } from './TileIcon';

type MenuPos = { x: number; y: number };

function LaunchItem(props: { b: Bookmark; num?: number; newTab: boolean; hidden: boolean; onOpen(id: string): void; onMenu(b: Bookmark, p: MenuPos): void }) {
  const { b } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: LAUNCH_PREFIX + b.id, data: { type: 'launch' },
  });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`launch-item${props.hidden ? ' launch-item--hidden' : ''}${isDragging ? ' launch-item--drag' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); props.onMenu(b, { x: e.clientX, y: e.clientY }); }}>
      <a ref={setActivatorNodeRef} {...listeners} aria-describedby={attributes['aria-describedby']} draggable={false}
        className="launch-link" href={b.url} title={`${bookmarkLabel(b)}\n${b.url}`} onClick={() => props.onOpen(b.id)}
        {...(props.newTab ? { target: '_blank', rel: 'noopener' } : {})}>
        <TileIcon bookmark={b} />
        <span className={`launch-label tile-title${b.title.trim() ? '' : ' tile-title--auto'}`}>{bookmarkLabel(b)}</span>
      </a>
      {props.num !== undefined && <span className="num-badge" aria-label={`Number ${props.num}`}>{props.num}</span>}
      <button className="launch-menu-btn" aria-label={`Actions for ${bookmarkLabel(b)}`} aria-haspopup="menu"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); props.onMenu(b, { x: r.left, y: r.bottom + 4 }); }}>⋯</button>
    </li>
  );
}

/** The large Preferred Launchpad: big, easy-to-reach targets for the bookmarks you use most. Also shown in the compact layout. */
export function Launchpad(props: {
  preferred: Bookmark[];
  often: Bookmark[];
  newTab: boolean;
  isHidden(b: Bookmark): boolean;
  numbers?: Map<string, number>;
  onOpen(id: string): void;
  onMenu(b: Bookmark, p: MenuPos): void;
}) {
  const { preferred, often } = props;
  return (
    <section className="launchpad" aria-label="Preferred bookmarks">
      <h2 className="launch-title"><span className="launch-star" aria-hidden>★</span> Preferred <span className="count">{preferred.length}</span></h2>
      {preferred.length === 0 ? (
        <p className="hint launch-empty">Set a bookmark as preferred in its Edit dialog (or with “Set as preferred” in its menu) and it appears here as a large button.</p>
      ) : (
        <SortableContext items={preferred.map((b) => LAUNCH_PREFIX + b.id)} strategy={rectSortingStrategy}>
          <ul className="launch-row">
            {preferred.map((b) => (
              <LaunchItem key={b.id} b={b} num={props.numbers?.get(b.id)} newTab={props.newTab} hidden={props.isHidden(b)} onOpen={props.onOpen} onMenu={props.onMenu} />
            ))}
          </ul>
        </SortableContext>
      )}
      {often.length > 0 && (
        <div className="often">
          <h3 className="often-title">Often used</h3>
          <ul className="often-row">
            {often.map((b) => (
              <li key={b.id} onContextMenu={(e) => { e.preventDefault(); props.onMenu(b, { x: e.clientX, y: e.clientY }); }}>
                <a className="often-link" href={b.url} title={b.url} onClick={() => props.onOpen(b.id)}
                  {...(props.newTab ? { target: '_blank', rel: 'noopener' } : {})}>
                  <TileIcon bookmark={b} />
                  <span className={`truncate${b.title.trim() ? '' : ' tile-title--auto'}`}>{bookmarkLabel(b)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
