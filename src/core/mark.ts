// Optional one-character label drawn in the centre of a bookmark's icon, so several bookmarks with the same icon
// (for example three ZimaOS servers) can be told apart at a glance.

export const MARK_COLORS = [
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'black', label: 'Black', hex: '#000000' },
  { id: 'yellow', label: 'Yellow', hex: '#facc15' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
] as const;

export type MarkColor = (typeof MARK_COLORS)[number]['id'];
export interface Mark { char: string; color: MarkColor }

export const DEFAULT_MARK_COLOR: MarkColor = 'white';
export const markHex = (c: MarkColor): string => MARK_COLORS.find((m) => m.id === c)?.hex ?? '#ffffff';

/** First visible character of the input (a letter, digit or symbol); null if there is none. */
export const firstChar = (s: string): string => {
  const t = s.trim();
  return t ? (Array.from(t)[0] ?? '') : '';
};

/** Strict check for stored or imported data: anything else is dropped. */
export function cleanMark(x: unknown): Mark | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const o = x as Record<string, unknown>;
  if (typeof o.char !== 'string') return undefined;
  const char = firstChar(o.char);
  if (!char || char !== o.char.trim()) return undefined;
  const color = MARK_COLORS.find((m) => m.id === o.color)?.id;
  return color ? { char, color } : undefined;
}
