// "How previously collected evidence changes what is known": the regional prior from nearby atlas
// records, contrasted with the selected variant's own characterization status.
import type { MechanismClass } from '../../domain/types';
import { getClassification } from '../../data/variants';
import { regionById } from '../../data/published';
import { EvidenceBadge, Label, MechanismTag, cx, fmt } from '../../ui/primitives';
import { MECH_COLOR, MECH_LABEL } from '../../ui/tokens';
import { type AtlasIndex, MECHS, lowerBound } from './atlasData';
import type { CharacterizationStatus } from './evidenceStatus';

function tally(index: AtlasIndex, idxs: number[]) {
  const c = [0, 0, 0, 0];
  for (const i of idxs) c[index.mech[i]]++;
  return c;
}

function StackBar({ counts }: { counts: number[] }) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex h-[8px] w-full rounded-[1px] overflow-hidden bg-line2">
      {MECHS.map((m, k) => (counts[k] ? <span key={m} style={{ width: `${(counts[k] / total) * 100}%`, background: MECH_COLOR[m], opacity: m === 'indeterminate' ? 0.6 : 0.9 }} /> : null))}
    </div>
  );
}

function Counts({ counts }: { counts: number[] }) {
  return (
    <div className="flex gap-2.5 mt-1 font-mono text-2xs tabular-nums">
      {MECHS.map((m, k) => (
        <span key={m} style={{ color: MECH_COLOR[m] }}>
          {m === 'indeterminate' ? 'IND' : m.toUpperCase()} {counts[k]}
        </span>
      ))}
    </div>
  );
}

export function RegionalPrior({ index, i, status, onHighlight }: { index: AtlasIndex; i: number; status: CharacterizationStatus; onHighlight: (q: string) => void }) {
  const v = index.variants[i];
  const region = regionById(v.regionId)!;
  const inRegion: number[] = [];
  for (let k = lowerBound(index.pos, region.start); k < index.n && index.pos[k] <= region.end; k++) {
    if (k === i || index.variants[k].patientIds.length) continue;
    inRegion.push(k);
  }
  const measured = inRegion.filter((k) => index.ev[k] <= 1);
  const priorOnly = inRegion.filter((k) => index.ev[k] === 2);
  const cm = tally(index, measured);
  const cp = tally(index, priorOnly);
  const directional = cm[0] + cm[1];
  let lean: MechanismClass | null = null;
  let leanFrac = 0;
  if (directional >= 3) {
    const k = cm[0] >= cm[1] ? 0 : 1;
    leanFrac = cm[k] / directional;
    if (leanFrac >= 0.65) lean = MECHS[k];
  }
  const own = status === 'characterized' || status === 'atlas-record' ? getClassification(v.id).mechanism : null;
  const agrees = own && lean ? own === lean : null;
  const isPatient = v.patientIds.length > 0;

  return (
    <div className="px-3 py-2.5 space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <Label>Regional prior · {region.label}</Label>
          <EvidenceBadge category="simulated" />
        </div>
        <div className="mt-1.5 text-2xs text-dim">
          Measured atlas records in res {region.start}–{region.end} (excluding patient variants), n = {measured.length}
        </div>
        <div className="mt-1.5">
          <StackBar counts={cm} />
          <Counts counts={cm} />
        </div>
        <div className="mt-2 text-2xs text-dim">Prior-only records (no measurement), n = {priorOnly.length}</div>
        <div className="mt-1 opacity-70">
          <StackBar counts={cp} />
        </div>
        <div className="mt-2 text-xs text-mute leading-[17px]">
          {lean ? (
            <>
              Directional calls in this region lean <span style={{ color: MECH_COLOR[lean] }}>{MECH_LABEL[lean].toLowerCase()}</span> ({fmt.pct(leanFrac)} of {directional}).
            </>
          ) : directional >= 3 ? (
            <>Directional calls in this region are split ({cm[0]} GoF · {cm[1]} LoF). The region alone does not suggest a direction.</>
          ) : (
            <>Too few directional calls in this region to form a prior.</>
          )}
        </div>
        <button onClick={() => onHighlight(region.label)} className="mt-1 font-mono text-2xs text-mute hover:text-ink underline decoration-dotted underline-offset-2">
          HIGHLIGHT REGION RECORDS
        </button>
      </div>

      <div className="border-t border-line2 pt-2.5">
        <Label>{isPatient ? 'This variant' : 'This record'}</Label>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className={cx(
              'font-mono text-2xs tracking-[0.08em]',
              status === 'characterized' ? 'text-cyan' : status === 'running' ? 'text-gof' : status === 'pending' ? 'text-warn' : 'text-mute',
            )}
          >
            {status === 'characterized' && 'CHARACTERIZED · SYNTHETIC PROTOCOL SUITE'}
            {status === 'running' && 'CHARACTERIZATION IN PROGRESS'}
            {status === 'pending' && 'NOT YET CHARACTERIZED'}
            {status === 'atlas-record' && 'ATLAS RECORD · PRIOR DATASET'}
          </span>
          {own && <MechanismTag mechanism={own} />}
        </div>
        <div className="mt-1.5 text-xs text-mute leading-[17px]">
          {!own &&
            (lean
              ? `Before its own characterization, the regional prior is the best available evidence: it suggests ${MECH_LABEL[lean].toLowerCase()}, but does not establish this variant's mechanism.`
              : 'Before its own characterization, prior evidence does not indicate a direction. Direct functional measurement is required.')}
          {own && isPatient && agrees === true && 'The variant’s own simulated characterization is consistent with the regional prior. Previously collected evidence anticipated it; the direct measurement confirmed it.'}
          {own && isPatient && agrees === false && 'The variant’s own simulated characterization departs from the regional prior. Regional evidence narrows hypotheses but cannot replace direct measurement.'}
          {own && isPatient && agrees === null && 'The variant’s own simulated characterization provides the directional evidence the region could not.'}
          {own && !isPatient && 'Atlas records form part of the prior that informs new variants in this region.'}
        </div>
      </div>
    </div>
  );
}
