// Atlas sidebar: search, legends (mechanism + evidence level) with counts, patient variants.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimple } from '../../ui/simple';
import { PLAIN_MECH, PLAIN_MECH_SUB } from './plain';
import { Search, X, Crosshair } from 'lucide-react';
import { PATIENTS } from '../../data/patients';
import { EvidenceBadge, MechanismTag, SectionHeader, cx } from '../../ui/primitives';
import { C, MECH_COLOR } from '../../ui/tokens';
import { type AtlasIndex, EVIDENCE_LABEL, EVIDENCE_LEVELS, MECHS, regionOf, shortId } from './atlasData';
import { SEARCH_EXAMPLES, type SearchResult } from './atlasSearch';

const MAX_ROWS = 120;

function EvidenceGlyph({ level, color = C.mute }: { level: number; color?: string }) {
  return (
    <svg width="10" height="10" className="shrink-0">
      {level === 0 && <circle cx="5" cy="5" r="3.2" fill={color} />}
      {level === 1 && <circle cx="5" cy="5" r="3" fill={color} fillOpacity={0.42} stroke={color} strokeOpacity={0.6} strokeWidth={0.8} />}
      {level === 2 && <circle cx="5" cy="5" r="3" fill="none" stroke={color} strokeOpacity={0.75} />}
    </svg>
  );
}

export function AtlasSidebar({
  index,
  query,
  setQuery,
  search,
  selected,
  hidden,
  onPick,
  onFit,
  onSubmit,
}: {
  index: AtlasIndex;
  query: string;
  setQuery: (q: string) => void;
  search: SearchResult;
  selected: number;
  hidden: Set<number>;
  onPick: (i: number) => void;
  onFit: () => void;
  onSubmit: (q: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  // debounce typing → query
  useEffect(() => {
    if (draft === query) return;
    const t = setTimeout(() => setQuery(draft), 140);
    return () => clearTimeout(t);
  }, [draft, query, setQuery]);

  const total = index.n;
  const rows = search.matches.slice(0, MAX_ROWS);
  const simple = useSimple();
  // Simple-view legend counts: atlas records only (patient variants are not part of the map's prior).
  const atlasCounts = useMemo(() => {
    const c = [0, 0, 0, 0];
    for (let i = 0; i < index.n; i++) if (!index.variants[i].patientIds.length) c[index.mech[i]]++;
    return c;
  }, [index]);
  const atlasTotal = atlasCounts.reduce((a, b) => a + b, 0) || 1;
  const pickQuery = (q: string) => (setDraft(q), setQuery(q));

  const resultsList = query && (
    <div className="border-t border-line2 max-h-[300px] overflow-y-auto scroll-thin">
      {rows.length === 0 && <div className="px-3 py-3 text-2xs text-dim">{simple ? 'Nothing found.' : 'No records match. Terms are AND-combined.'}</div>}
      {rows.map((i) => {
        const v = index.variants[i];
        const known = !hidden.has(i);
        const m = MECHS[index.mech[i]];
        return (
          <button
            key={v.id}
            onClick={() => onPick(i)}
            className={cx('w-full flex items-center gap-2 px-3 h-[26px] text-left border-l-2', i === selected ? 'border-ink bg-surface' : 'border-transparent hover:bg-surface/60')}
          >
            <EvidenceGlyph level={simple ? 0 : Math.min(2, index.ev[i])} color={known ? MECH_COLOR[m] : C.ink} />
            <span className="font-mono text-2xs text-ink w-[78px] shrink-0">{shortId(v.id)}</span>
            <span className="font-mono text-2xs text-dim truncate flex-1">{simple ? (known ? PLAIN_MECH[m] : 'Not measured') : regionOf(index, i)?.label}</span>
            {v.patientIds.length > 0 && <span className="font-mono text-[9px] text-cyan">{v.patientIds[0]}</span>}
          </button>
        );
      })}
      {search.matches.length > MAX_ROWS && (
        <div className="px-3 py-1.5 font-mono text-2xs text-dim">+{(search.matches.length - MAX_ROWS).toLocaleString('en-US')} more · refine query</div>
      )}
    </div>
  );

  if (simple) {
    return (
      <div className="flex flex-col">
        <SectionHeader title="What the colours mean" right={<EvidenceBadge category="simulated" />} />
        <div data-tour="atlas.legend" className="px-4 pt-3 pb-2 space-y-3">
          {MECHS.map((m, k) => (
            <button key={m} onClick={() => pickQuery(m)} className="w-full text-left group" title={`Show only: ${PLAIN_MECH[m]}`}>
              <div className="flex items-center gap-2.5">
                <span className="w-[11px] h-[11px] rounded-full shrink-0" style={{ background: MECH_COLOR[m] }} />
                <span className="flex-1 min-w-0">
                  <span className="text-[14px] text-ink group-hover:text-white">{PLAIN_MECH[m]}</span>
                  <span className="ml-1.5 text-[12px] text-dim">{PLAIN_MECH_SUB[m]}</span>
                </span>
                <span className="font-mono text-[12px] text-mute tabular-nums">{atlasCounts[k].toLocaleString('en-US')}</span>
              </div>
              <div className="mt-1.5 ml-[21px] h-[3px] bg-line2 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(atlasCounts[k] / atlasTotal) * 100}%`, background: MECH_COLOR[m], opacity: 0.85 }} />
              </div>
            </button>
          ))}
          <div className="pt-1">
            <div className="flex items-center gap-2.5">
              <svg width="11" height="11" className="shrink-0">
                <path d="M5.5 0.8 L10.2 5.5 L5.5 10.2 L0.8 5.5 Z" fill="none" stroke={C.ink} />
              </svg>
              <span className="text-[14px] text-ink">A patient’s change</span>
            </div>
            <div className="mt-2 ml-[21px] flex flex-wrap gap-1.5">
              {PATIENTS.map((p) => {
                const i = index.idToIdx.get(p.variantId)!;
                return (
                  <button
                    key={p.id}
                    onClick={() => onPick(i)}
                    className={cx('h-6 px-2 rounded-sm border font-mono text-[11px]', i === selected ? 'border-cyan/70 text-cyan' : 'border-line text-mute hover:text-ink')}
                  >
                    {p.id}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <SectionHeader title="Find a change" className="border-t mt-2" />
        <div className="px-4 pt-3 pb-3">
          <div data-tour="atlas.search" className="flex items-center h-8 border border-line rounded bg-canvas focus-within:border-cyan/60">
            <Search size={13} strokeWidth={1.5} className="ml-2 text-dim shrink-0" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit(draft);
                if (e.key === 'Escape') pickQuery('');
              }}
              placeholder="e.g. PX-002 or 1400-1450"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent px-2 text-[13px] text-ink placeholder:text-dim outline-none"
            />
            {draft && (
              <button onClick={() => pickQuery('')} className="mr-1.5 text-dim hover:text-ink" title="Clear">
                <X size={12} />
              </button>
            )}
          </div>
          {query && (
            <div className="mt-2 flex items-center justify-between text-[12px] text-mute">
              <span>{search.matches.length.toLocaleString('en-US')} found</span>
              {search.extent && (
                <button onClick={onFit} className="inline-flex items-center gap-1 hover:text-ink">
                  <Crosshair size={11} strokeWidth={1.5} /> Show on map
                </button>
              )}
            </div>
          )}
        </div>
        {resultsList}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <SectionHeader title="Search atlas" right={<span className="font-mono text-2xs text-dim">{total.toLocaleString('en-US')} RECORDS</span>} />
      <div className="px-3 pt-2.5 pb-2">
        <div data-tour="atlas.search" className="flex items-center h-7 border border-line rounded bg-canvas focus-within:border-cyan/60">
          <Search size={12} strokeWidth={1.5} className="ml-2 text-dim shrink-0" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSubmit(draft);
              }
              if (e.key === 'Escape') {
                setDraft('');
                setQuery('');
              }
            }}
            placeholder="ID, 1400-1450, DIV S4, LoF, PX-002"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent px-2 font-mono text-xs text-ink placeholder:text-dim outline-none"
          />
          {draft && (
            <button onClick={() => (setDraft(''), setQuery(''))} className="mr-1.5 text-dim hover:text-ink" title="Clear">
              <X size={12} />
            </button>
          )}
        </div>
        {!query && (
          <div className="mt-2 flex flex-wrap gap-1">
            {SEARCH_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => (setDraft(ex), setQuery(ex))} className="h-5 px-1.5 border border-line2 rounded-sm font-mono text-[9.5px] text-mute hover:text-ink hover:border-line">
                {ex}
              </button>
            ))}
          </div>
        )}
        {query && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-1">
              {search.chips.map((c, i) => (
                <span key={i} className="h-5 px-1.5 inline-flex items-center border border-cyan/30 text-cyan/90 rounded-sm font-mono text-[9.5px]">
                  {c}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-2xs text-mute">
                {search.matches.length.toLocaleString('en-US')} MATCH{search.matches.length === 1 ? '' : 'ES'}
              </span>
              {search.extent && (
                <button onClick={onFit} className="inline-flex items-center gap-1 font-mono text-2xs text-mute hover:text-ink">
                  <Crosshair size={11} strokeWidth={1.5} /> FRAME {search.extent[0]}–{search.extent[1]}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {resultsList}

      <SectionHeader title="Mechanism" className="border-t" right={<EvidenceBadge category="illustrative" />} />
      <div data-tour="atlas.legend" className="px-3 py-2 space-y-1">
        {MECHS.map((m) => {
          const n = index.counts[m];
          return (
            <button key={m} onClick={() => (setDraft(m), setQuery(m))} className="w-full flex items-center gap-2 group" title={`Filter: ${m}`}>
              <span className="w-[120px] shrink-0 text-left">
                <MechanismTag mechanism={m} />
              </span>
              <span className="flex-1 h-[5px] bg-line2 rounded-[1px] overflow-hidden">
                <span className="block h-full" style={{ width: `${(n / total) * 100}%`, background: MECH_COLOR[m], opacity: 0.8 }} />
              </span>
              <span className="w-[38px] text-right font-mono text-2xs text-mute tabular-nums group-hover:text-ink">{n}</span>
            </button>
          );
        })}
        <div className="pt-1 text-2xs text-dim leading-[14px]">Classes are computed by the rule-based classifier from synthetic measurements. Never assigned directly.</div>
      </div>

      <SectionHeader title="Evidence level" right={<EvidenceBadge category="simulated" />} />
      <div className="px-3 py-2 space-y-1">
        {EVIDENCE_LEVELS.map((e, k) => (
          <button key={e} onClick={() => { const q = ['patch', 'summary', 'prior'][k]; setDraft(q); setQuery(q); }} className="w-full flex items-center gap-2 group">
            <EvidenceGlyph level={k} />
            <span className="flex-1 text-left text-xs text-mute group-hover:text-ink">{EVIDENCE_LABEL[e]}</span>
            <span className="font-mono text-2xs text-mute tabular-nums">{index.evCounts[e] ?? 0}</span>
          </button>
        ))}
        <div className="flex items-center gap-2 pt-0.5">
          <svg width="10" height="10" className="shrink-0">
            <path d="M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z" fill="none" stroke={C.ink} />
          </svg>
          <span className="flex-1 text-xs text-mute">Patient variant (hypothetical)</span>
        </div>
        <div className="pt-1 text-2xs text-dim leading-[14px]">Filled: full synthetic protocol suite. Translucent: summary measurements. Hollow: regional computational prior, no direct measurement.</div>
      </div>

      <SectionHeader title="Patient variants" right={<EvidenceBadge category="hypothetical" />} />
      <div className="py-1">
        {PATIENTS.map((p) => {
          const i = index.idToIdx.get(p.variantId)!;
          const v = index.variants[i];
          const known = !hidden.has(i);
          return (
            <button
              key={p.id}
              onClick={() => onPick(i)}
              className={cx('w-full px-3 py-1 text-left border-l-2', i === selected ? 'border-ink bg-surface' : 'border-transparent hover:bg-surface/60')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink">{p.id}</span>
                {known ? <MechanismTag mechanism={MECHS[index.mech[i]]} /> : <span className="font-mono text-[9px] tracking-[0.08em] text-dim">UNCHARACTERIZED</span>}
              </div>
              <div className="font-mono text-2xs text-dim truncate">
                {v.hgvsP} · {regionOf(index, i)?.label}
              </div>
            </button>
          );
        })}
      </div>

      <SectionHeader title="Sources" />
      <div className="px-3 py-2 space-y-1.5 text-2xs text-mute leading-[14px]">
        <div className="flex items-start gap-2">
          <EvidenceBadge category="published" className="shrink-0" /> <span>Topology and sequence: UniProt Q99250.</span>
        </div>
        <div className="flex items-start gap-2">
          <EvidenceBadge category="hypothetical" className="shrink-0" /> <span>All atlas records are hypothetical substitutions.</span>
        </div>
        <div className="flex items-start gap-2">
          <EvidenceBadge category="simulated" className="shrink-0" /> <span>Measurements from a deterministic illustrative gating model.</span>
        </div>
      </div>
    </div>
  );
}
