// Built-in icon set: simple stroke glyphs drawn as inline SVG, so they look identical in every browser
// and OS (emoji do not). Each value is the inner markup of a 24x24 viewBox, stroke="currentColor".
export const GLYPHS: Record<string, { label: string; svg: string }> = {
  puzzle: { label: 'Extension', svg: '<path d="M10 4a2 2 0 1 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 1 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 1 0-4 0v2H6a1 1 0 0 1-1-1v-4h2a2 2 0 1 0 0-4H5V7a1 1 0 0 1 1-1h4z"/>' },
  star: { label: 'Star', svg: '<polygon points="12 2.5 14.9 9 22 9.7 16.6 14.4 18.3 21.5 12 17.8 5.7 21.5 7.4 14.4 2 9.7 9.1 9"/>' },
  heart: { label: 'Heart', svg: '<path d="M12 20.5s-8-5-8-10.5a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10.5-8 10.5z"/>' },
  home: { label: 'Home', svg: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>' },
  mail: { label: 'Mail', svg: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>' },
  code: { label: 'Code', svg: '<polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/><line x1="14" y1="4" x2="10" y2="20"/>' },
  book: { label: 'Book', svg: '<path d="M4 4h16v13H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h14v-4"/>' },
  music: { label: 'Music', svg: '<circle cx="7" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M10 18V6l10-2v12"/>' },
  video: { label: 'Video', svg: '<rect x="2" y="5" width="20" height="14" rx="3"/><polygon points="10 9 16 12 10 15"/>' },
  cart: { label: 'Shopping', svg: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>' },
  camera: { label: 'Photos', svg: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>' },
  cloud: { label: 'Cloud', svg: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z"/>' },
  work: { label: 'Work', svg: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>' },
  globe: { label: 'Web', svg: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>' },
  game: { label: 'Games', svg: '<rect x="2" y="8" width="20" height="10" rx="5"/><line x1="7" y1="11" x2="7" y2="15"/><line x1="5" y1="13" x2="9" y2="13"/><circle cx="16" cy="12" r=".6"/><circle cx="18" cy="14" r=".6"/>' },
  news: { label: 'News', svg: '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>' },
  chart: { label: 'Finance', svg: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>' },
  calendar: { label: 'Calendar', svg: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>' },
};

/** `letter` is a pseudo-glyph: the first letter of the title. */
export const LETTER_GLYPH = 'letter';

export const ICON_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b', '#1f2937'];

export const ICON_COLOR_NAMES = ['Indigo', 'Sky', 'Teal', 'Green', 'Amber', 'Red', 'Pink', 'Violet', 'Slate', 'Ink'];
