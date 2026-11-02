// Pure search: accent/case-insensitive, every word must match somewhere (AND), results ranked.
import type { DataState } from './types';
import { hostnameOf } from './url';

const MARKS = /\p{M}/gu;
/** Lower-case and strip accents ("Café" -> "cafe"). */
export const fold = (s: string): string => s.normalize('NFD').replace(MARKS, '').toLowerCase();

/** Like fold, but also returns, for each folded char, its index in the original string (for highlighting). */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
    i += ch.length;
  }
  return { folded, map };
}

export interface IndexEntry {
  id: string;
  title: string;
  url: string;
  host: string;
  desc: string;
  group: string;
  tags: string[];
}

/** Pre-fold every searchable field once per data change so each keystroke is just string scans. */
export function buildIndex(s: DataState): IndexEntry[] {
  return Object.values(s.bookmarks).map((b) => ({
    id: b.id,
    title: fold(b.title),
    url: fold(b.url.replace(/^https?:\/\/(www\.)?/, '')),
    host: fold(hostnameOf(b.url)),
    desc: fold(b.description ?? ''),
    group: b.groupId ? fold(s.groups[b.groupId]?.name ?? '') : '',
    tags: b.tagIds.map((id) => fold(s.tags[id]?.name ?? '')).filter(Boolean),
  }));
}

export interface ParsedQuery { terms: string[]; tagTerms: string[] }

/** "design #tools figma" -> terms [design, figma], tagTerms [tools]. */
export function parseQuery(q: string): ParsedQuery {
  const terms: string[] = [], tagTerms: string[] = [];
  for (const w of fold(q).split(/\s+/).filter(Boolean)) {
    if (w.startsWith('#')) { if (w.length > 1) tagTerms.push(w.slice(1)); }
    else terms.push(w);
  }
  return { terms, tagTerms };
}

const wordStart = (hay: string, t: string) => hay.startsWith(t) || hay.includes(' ' + t) || hay.includes('-' + t) || hay.includes('.' + t) || hay.includes('/' + t);

function scoreTerm(e: IndexEntry, t: string): number {
  let best = 0;
  const up = (n: number) => { if (n > best) best = n; };
  if (e.title.startsWith(t)) up(100); else if (wordStart(e.title, t)) up(80); else if (e.title.includes(t)) up(60);
  for (const tag of e.tags) { if (tag === t) up(70); else if (tag.startsWith(t)) up(55); else if (tag.includes(t)) up(35); }
  if (e.host.startsWith(t)) up(50); else if (e.host.includes(t)) up(40);
  if (e.group) { if (wordStart(e.group, t)) up(40); else if (e.group.includes(t)) up(25); }
  if (e.url.includes(t)) up(20);
  if (e.desc.includes(t)) up(20);
  return best;
}

function scoreTag(e: IndexEntry, t: string): number {
  let best = 0;
  for (const tag of e.tags) best = Math.max(best, tag === t ? 70 : tag.startsWith(t) ? 55 : 0);
  return best;
}

export interface SearchHit { id: string; score: number }

/** Empty query -> no hits (the UI shows the normal dashboard instead). */
export function search(index: IndexEntry[], query: string): SearchHit[] {
  const { terms, tagTerms } = parseQuery(query);
  if (!terms.length && !tagTerms.length) return [];
  const hits: (SearchHit & { title: string })[] = [];
  for (const e of index) {
    let total = 0, ok = true;
    for (const t of terms) { const s = scoreTerm(e, t); if (!s) { ok = false; break; } total += s; }
    if (!ok) continue;
    for (const t of tagTerms) { const s = scoreTag(e, t); if (!s) { ok = false; break; } total += s; }
    if (ok) hits.push({ id: e.id, score: total, title: e.title });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.map(({ id, score }) => ({ id, score }));
}

export interface Segment { text: string; hit: boolean }

/** Split `text` into segments, marking the parts that match any term (accent/case-insensitive). */
export function highlight(text: string, terms: string[]): Segment[] {
  const needles = terms.filter(Boolean);
  if (!needles.length || !text) return [{ text, hit: false }];
  const { folded, map } = foldWithMap(text);
  const flags = new Array<boolean>(text.length).fill(false);
  for (const n of needles) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(n, from);
      if (at < 0) break;
      const start = map[at], end = (map[at + n.length - 1] ?? text.length - 1) + 1;
      for (let i = start; i < end; i++) flags[i] = true;
      from = at + Math.max(1, n.length);
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === flags[i]) last.text += text[i];
    else out.push({ text: text[i], hit: flags[i] });
  }
  return out;
}
