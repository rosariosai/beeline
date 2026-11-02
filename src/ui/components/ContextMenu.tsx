import { useEffect, useRef, useState } from 'react';

/** An item either does something (onSelect) or opens a sub-list (children). */
export interface MenuItem { label: string; onSelect?(): void; children?: MenuItem[]; danger?: boolean }

/** Small fixed-position menu. Closes on outside click, Esc, or selection. Arrow keys move focus. */
export function ContextMenu(props: { x: number; y: number; items: MenuItem[]; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  const [stack, setStack] = useState<MenuItem[][]>([]);
  const items = stack.length ? [...stack[stack.length - 1], { label: '‹ Back', onSelect: () => setStack((s) => s.slice(0, -1)) }] : props.items;
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [stack]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); opener?.focus?.(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[n]?.focus();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);

  const left = Math.min(props.x, window.innerWidth - 190);
  const top = Math.min(props.y, window.innerHeight - items.length * 40 - 16);
  return (
    <div className="ctxmenu" ref={ref} role="menu" style={{ left, top }}>
      {items.map((it) => (
        <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} aria-haspopup={it.children ? 'menu' : undefined}
          onClick={() => {
            if (it.children) { setStack((s) => [...s, it.children as MenuItem[]]); return; }
            if (it.label === '‹ Back') { it.onSelect?.(); return; }
            onClose(); it.onSelect?.();
          }}>
          {it.label}{it.children ? ' ›' : ''}
        </button>
      ))}
    </div>
  );
}
