// Atlas query language. Whitespace/comma separated terms are AND-combined:
//   variant ID / HGVS fragment (HV-1714P, Ala1714, 1714P) · position (1714) · range (1400-1450)
//   mechanism (GoF, LoF, mixed, indeterminate) · domain (DI…DIV) · segment (S1…S6, P / pore, IFM, linker)
//   patient (PX-001) · evidence (patch, summary, prior)
// A query that exactly names a region label (e.g. "DIV S4", "DIII–DIV linker") is matched as that region.
import type { EvidenceLevel, MechanismClass } from '../../domain/types';
import { PATIENTS } from '../../data/patients';
import { REGIONS } from '../../data/published';
import { type AtlasIndex, EVIDENCE_LEVELS, MECHS } from './atlasData';

type Term =
  | { kind: 'range'; a: number; b: number }
  | { kind: 'mech'; m: MechanismClass }
  | { kind: 'domain'; d: string }
  | { kind: 'segment'; s: string }
  | { kind: 'region'; ids: Set<string>; label: string }
  | { kind: 'patient'; pid: string }
  | { kind: 'evidence'; e: EvidenceLevel }
  | { kind: 'text'; t: string };

export interface SearchResult {
  query: string;
  terms: Term[];
  chips: string[];
  mask: Uint8Array | null;
  matches: number[];
  /** residue extent of matches (or of the queried range/region) */
  extent: [number, number] | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

const MECH_ALIASES: Record<string, MechanismClass> = {
  gof: 'GoF', gain: 'GoF', 'gain-of-function': 'GoF',
  lof: 'LoF', loss: 'LoF', 'loss-of-function': 'LoF',
  mixed: 'mixed', mix: 'mixed',
  indeterminate: 'indeterminate', indet: 'indeterminate', ind: 'indeterminate', unresolved: 'indeterminate',
};
const EV_ALIASES: Record<string, EvidenceLevel> = {
  patch: 'synthetic-patch-clamp', 'patch-clamp': 'synthetic-patch-clamp', 'synthetic-patch-clamp': 'synthetic-patch-clamp',
  summary: 'synthetic-summary', 'synthetic-summary': 'synthetic-summary',
  prior: 'computational-prior', computational: 'computational-prior', 'computational-prior': 'computational-prior',
};
const DOMAINS = ['di', 'dii', 'diii', 'div'];

function parseToken(tok: string): Term | null {
  const t = norm(tok);
  if (!t) return null;
  let m = /^(\d{1,4})\s*(?:-|\.\.|:|to)\s*(\d{1,4})$/.exec(t);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    return { kind: 'range', a: Math.min(a, b), b: Math.max(a, b) };
  }
  if (/^\d{1,4}$/.test(t)) return { kind: 'range', a: +t, b: +t };
  if (MECH_ALIASES[t]) return { kind: 'mech', m: MECH_ALIASES[t] };
  if (EV_ALIASES[t]) return { kind: 'evidence', e: EV_ALIASES[t] };
  m = /^px-?0*(\d{1,3})$/.exec(t);
  if (m) return { kind: 'patient', pid: `PX-${m[1].padStart(3, '0')}` };
  if (DOMAINS.includes(t)) return { kind: 'domain', d: t.toUpperCase() };
  if (/^s[1-6]$/.test(t)) return { kind: 'segment', s: t.toUpperCase() };
  if (t === 'p' || t === 'pore' || t === 'pore-loop') return { kind: 'segment', s: 'pore-loop' };
  if (t === 'ifm') return { kind: 'region', ids: new Set(['IFM']), label: 'IFM' };
  return { kind: 'text', t };
}

function wholeRegion(q: string): Term | null {
  const n = norm(q);
  if (!n.includes(' ') && !n.includes('-')) return null;
  const hits = REGIONS.filter((r) => norm(r.label) === n || norm(r.id) === n);
  if (!hits.length) return null;
  return { kind: 'region', ids: new Set(hits.map((r) => r.id)), label: hits[0].label };
}

function chip(t: Term): string {
  switch (t.kind) {
    case 'range': return t.a === t.b ? `RES ${t.a}` : `RES ${t.a}–${t.b}`;
    case 'mech': return `MECH ${t.m}`;
    case 'domain': return `DOMAIN ${t.d}`;
    case 'segment': return `SEGMENT ${t.s === 'pore-loop' ? 'PORE LOOP' : t.s}`;
    case 'region': return `REGION ${t.label}`;
    case 'patient': return `PATIENT ${t.pid}`;
    case 'evidence': return `EVIDENCE ${t.e}`;
    case 'text': return `TEXT “${t.t}”`;
  }
}

export function runSearch(index: AtlasIndex, query: string): SearchResult {
  const q = query.trim();
  if (!q) return { query, terms: [], chips: [], mask: null, matches: [], extent: null };
  const whole = wholeRegion(q);
  const terms: Term[] = whole ? [whole] : (q.split(/[\s,;]+/).map(parseToken).filter(Boolean) as Term[]);
  const patientVariant = new Map(PATIENTS.map((p) => [p.id, p.variantId]));
  const mask = new Uint8Array(index.n);
  const matches: number[] = [];
  const hay: string[] = [];
  for (let i = 0; i < index.n; i++) {
    const v = index.variants[i];
    const r = REGIONS[index.regionIdx[i]];
    let ok = true;
    for (const t of terms) {
      switch (t.kind) {
        case 'range': ok = v.position >= t.a && v.position <= t.b; break;
        case 'mech': ok = MECHS[index.mech[i]] === t.m; break;
        case 'domain': ok = r?.domain === t.d; break;
        case 'segment': ok = r?.kind === t.s; break;
        case 'region': ok = !!r && t.ids.has(r.id); break;
        case 'patient': ok = patientVariant.get(t.pid) === v.id; break;
        case 'evidence': ok = EVIDENCE_LEVELS[index.ev[i]] === t.e; break;
        case 'text': {
          const h = (hay[i] ??= norm(`${v.id} ${v.hgvsP} ${r?.label ?? ''} ${r?.id ?? ''} ${v.patientIds.join(' ')}`));
          ok = h.includes(t.t);
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) {
      mask[i] = 1;
      matches.push(i);
    }
  }
  let extent: [number, number] | null = null;
  const rangeT = terms.find((t) => t.kind === 'range') as Extract<Term, { kind: 'range' }> | undefined;
  const regionT = terms.find((t) => t.kind === 'region') as Extract<Term, { kind: 'region' }> | undefined;
  if (rangeT && terms.length === 1) extent = [rangeT.a, rangeT.b];
  else if (regionT && terms.length === 1) {
    const rs = REGIONS.filter((r) => regionT.ids.has(r.id));
    extent = [Math.min(...rs.map((r) => r.start)), Math.max(...rs.map((r) => r.end))];
  } else if (matches.length) extent = [index.pos[matches[0]], index.pos[matches[matches.length - 1]]];
  return { query, terms, chips: terms.map(chip), mask, matches, extent };
}

export const SEARCH_EXAMPLES = ['PX-001', '1400-1450', 'DIV S4', 'LoF DIII', 'GoF S4 patch', 'IFM', 'HV-1714P'];
