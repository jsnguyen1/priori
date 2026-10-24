// Inspector for the selected atlas record / patient variant.
import { ArrowRight } from 'lucide-react';
import type { MechanismClass } from '../../domain/types';
import { getClassification, getProfile } from '../../data/variants';
import { regionById } from '../../data/published';
import { CELL_SYSTEM, MEASUREMENT_KEYS, MEASUREMENT_META, MODEL_VERSION, PROTOCOL_SUITE_VERSION } from '../../sim/channel';
import { THRESHOLDS } from '../../sim/classifier';
import { useStore } from '../../state/store';
import { Button, EvidenceBadge, KV, Label, MechanismTag, SectionHeader, Term, fmt } from '../../ui/primitives';
import { C, MECH_COLOR } from '../../ui/tokens';
import { type AtlasIndex, EVIDENCE_LABEL, shortId } from './atlasData';
import type { CharacterizationStatus } from './evidenceStatus';
import { RegionalPrior, StackBar, regionalPrior } from './RegionalPrior';
import { useSimple } from '../../ui/simple';
import { SCN2A_LENGTH } from '../../data/published';
import { MECHS } from './atlasData';
import { PLAIN_MECH, PLAIN_MECH_SUB, plainSwap, plainWhere } from './plain';

const DOMAIN_LABEL: Record<string, string> = { DI: 'Repeat DI', DII: 'Repeat DII', DIII: 'Repeat DIII', DIV: 'Repeat DIV', linker: 'Inter-domain linker', termini: 'Terminus' };

const INDET_REASON: Record<string, string> = {
  'no-significant-deviation': 'No measurement deviates meaningfully from reference.',
  'low-confidence': 'Effects lie near decision boundaries relative to measurement uncertainty; perturbation draws do not reproduce a directional call.',
  'insufficient-data': 'No direct measurement, regional computational prior only.',
};

const DIRECTIONS: Record<MechanismClass, { title: React.ReactNode; detail: string }[]> = {
  LoF: [
    { title: <>RNA upregulation research</>, detail: 'Increase productive output of the reference allele (e.g. regulatory / NMD elements).' },
    { title: <Term k="spliceModulation">Splice-modulation research</Term>, detail: 'Oligonucleotide-directed exon inclusion changes to raise functional transcript.' },
  ],
  GoF: [
    { title: <Term k="alleleSelective">Allele-selective suppression</Term>, detail: 'Reduce the variant-carrying allele while sparing the reference allele.' },
    { title: <>Mechanism-matched small molecules</>, detail: 'Compounds that counter the specific gating defect (e.g. persistent current).' },
  ],
  mixed: [{ title: <>Further characterization</>, detail: 'Opposing effects: neuronal-context assays are needed before any direction can be chosen.' }],
  indeterminate: [{ title: <>Further characterization</>, detail: 'Additional protocols, larger n or direct measurement before a direction can be chosen.' }],
};

function ContributionBar({ contrib }: { contrib: number }) {
  const w = 96;
  const mid = w / 2;
  const max = 1.2;
  const len = (Math.min(max, Math.abs(contrib)) / max) * mid;
  const color = contrib < -0.01 ? MECH_COLOR.LoF : contrib > 0.01 ? MECH_COLOR.GoF : C.indet;
  return (
    <svg width={w} height={8} className="block shrink-0">
      <line x1={0} x2={w} y1={4} y2={4} stroke={C.line} />
      <line x1={mid} x2={mid} y1={0} y2={8} stroke={C.mute} strokeOpacity={0.6} />
      <rect x={contrib < 0 ? mid - len : mid} y={1.5} width={Math.max(1, len)} height={5} fill={color} />
    </svg>
  );
}

export function AtlasInspector({ index, i, status, onHighlight }: { index: AtlasIndex; i: number; status: CharacterizationStatus; onHighlight: (q: string) => void }) {
  const selectVariant = useStore((s) => s.selectVariant);
  const selectedVariantId = useStore((s) => s.selectedVariantId);
  const setModule = useStore((s) => s.setModule);
  const simple = useSimple();
  if (i < 0) return null;
  const v = index.variants[i];
  const region = regionById(v.regionId);
  const c = getClassification(v.id);
  const prof = getProfile(v.id);
  const known = status === 'characterized' || status === 'atlas-record';
  const prior = v.evidenceLevel === 'computational-prior';

  const inspect = () => {
    if (selectedVariantId !== v.id) selectVariant(v.id, { silent: true });
    setModule('lab');
  };

  if (simple) return <SimpleInspector index={index} i={i} status={status} known={known} onHighlight={onHighlight} onInspect={inspect} />;

  return (
    <div data-tour="atlas.inspector" className="flex flex-col min-h-full">
      <SectionHeader title="Variant" right={<EvidenceBadge category="hypothetical" />} />
      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-md text-ink">{shortId(v.id)}</span>
          {v.patientIds.length > 0 && <span className="font-mono text-xs text-cyan">{v.patientIds.join(' · ')}</span>}
        </div>
        <div className="mt-0.5 font-mono text-sm text-mute">{v.hgvsP}</div>
        <div className="text-2xs text-dim">Hypothetical substitution · reference residue from UniProt Q99250</div>
        <div className="mt-2">
          <KV k="Protein position" v={v.position} sub={`${v.refAA} → ${v.altAA}`} />
          <KV k="Region" v={region?.label ?? v.regionId} sub={region ? `res ${region.start}–${region.end} · ${region.topology}` : undefined} />
          <KV k="Domain" v={DOMAIN_LABEL[region?.domain ?? ''] ?? region?.domain} />
        </div>
      </div>

      <SectionHeader title="Mechanism hypothesis" right={<EvidenceBadge category="illustrative" />} />
      <div className="px-3 py-2">
        {known ? (
          <>
            <div className="flex items-center justify-between">
              <MechanismTag mechanism={c.mechanism} size="md" />
              <span className="font-mono text-xs text-mute">conf. {fmt.pct(c.confidence)}</span>
            </div>
            <div className="mt-1.5">
              <KV k="Net score" v={fmt.signed(c.netScore, 2)} sub={`GoF ${fmt.num(c.gofEvidence, 2)} · LoF ${fmt.num(c.lofEvidence, 2)}`} />
              <KV k="Classifier" v={c.modelVersion} />
            </div>
            {c.indeterminateReason && (
              <div className="mt-1.5 px-2 py-1.5 border border-line2 rounded text-2xs text-mute leading-[15px]">
                <span className="font-mono text-dim">UNCERTAINTY · {c.indeterminateReason.toUpperCase()}</span>
                <br />
                {INDET_REASON[c.indeterminateReason]}
              </div>
            )}
            {!c.indeterminateReason && c.confidence < 0.9 && (
              <div className="mt-1.5 text-2xs text-dim">
                {fmt.pct(1 - c.confidence)} of SE-perturbation draws yield a different class.
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-mute leading-[17px]">
            <span className="font-mono text-2xs tracking-[0.08em] text-warn">{status === 'running' ? 'CHARACTERIZATION IN PROGRESS' : 'PENDING CHARACTERIZATION'}</span>
            <br />
            The functional consequence of this patient variant has not been measured. Run the synthetic protocol suite in the Molecular Lab.
          </div>
        )}
      </div>

      <SectionHeader title="Evidence context" />
      <RegionalPrior index={index} i={i} status={status} onHighlight={onHighlight} />

      {known && (
        <>
          <SectionHeader title={prior ? 'Prior estimates' : 'Synthetic measurements'} right={<EvidenceBadge category="simulated" />} />
          <div className="px-3 py-1.5">
            {prior && <div className="text-2xs text-warn/90 mb-1">No direct measurement. Values are regional-prior estimates with SE inflated ×3.</div>}
            <table className="w-full font-mono text-2xs tabular-nums">
              <thead>
                <tr className="text-dim text-left">
                  <th className="font-normal py-1">Measurement</th>
                  <th className="font-normal text-right">Value ± SE</th>
                  <th className="font-normal text-right">Ref</th>
                  <th className="font-normal text-right w-6">n</th>
                </tr>
              </thead>
              <tbody>
                {MEASUREMENT_KEYS.map((k) => {
                  const m = prof[k];
                  const meta = MEASUREMENT_META[k];
                  return (
                    <tr key={k} className="border-t border-line2 align-top">
                      <td className="py-1 pr-1 text-mute font-sans text-2xs">
                        {meta.label}
                        <div className="font-mono text-[9px] text-dim">{meta.unit}</div>
                      </td>
                      <td className="py-1 text-right text-ink whitespace-nowrap">
                        {fmt.num(m.value, meta.digits)}
                        <span className="text-dim"> ± {fmt.num(m.se, meta.digits === 0 ? 0 : Math.max(1, meta.digits))}</span>
                      </td>
                      <td className="py-1 text-right text-dim whitespace-nowrap">{fmt.num(m.reference, meta.digits)}</td>
                      <td className="py-1 text-right text-dim">{prior ? 'n/a' : m.n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-1 text-[9.5px] text-dim font-mono">{PROTOCOL_SUITE_VERSION} · {MODEL_VERSION}</div>
          </div>

          <SectionHeader title="Classifier contributions" right={<EvidenceBadge category="illustrative" />} />
          <div className="px-3 py-2 space-y-2">
            {c.rules.map((r) => {
              const contrib = r.score * r.weight;
              return (
                <div key={r.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs text-mute">{r.label}</span>
                    <span className="font-mono text-2xs text-ink tabular-nums">
                      {r.deltaUnit === 'mV' ? fmt.signed(r.delta, 1) : fmt.num(r.delta, 2)} <span className="text-dim">{r.deltaUnit}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ContributionBar contrib={contrib} />
                    <span className="font-mono text-2xs tabular-nums" style={{ color: r.direction === 'GoF' ? MECH_COLOR.GoF : r.direction === 'LoF' ? MECH_COLOR.LoF : C.dim }}>
                      {fmt.signed(contrib, 2)}
                    </span>
                    <span className="font-mono text-[9px] text-dim">w {r.weight}</span>
                  </div>
                  <div className="font-mono text-[9px] text-dim leading-[12px] mt-0.5">{r.boundary}</div>
                </div>
              );
            })}
            <div className="pt-1.5 border-t border-line2 font-mono text-[9px] text-dim leading-[13px]">
              DIRECTIONAL CALL |net| ≥ {THRESHOLDS.directional} · MIXED: GoF and LoF evidence each ≥ {THRESHOLDS.mixedEach} · KEEP CALL IF ≥ {fmt.pct(THRESHOLDS.minConfidence)} OF {THRESHOLDS.draws} SE DRAWS AGREE
            </div>
          </div>
        </>
      )}

      <SectionHeader title="Provenance" />
      <div className="px-3 py-2">
        <KV k="Evidence level" v={EVIDENCE_LABEL[v.evidenceLevel]} />
        <KV k="Dataset" v={v.patientIds.length ? 'Patient characterization (synthetic)' : 'PRIORI atlas v1 (synthetic)'} />
        <KV k="Cell system" v={<span className="font-sans">{CELL_SYSTEM}</span>} />
        <KV k="Protocol" v={PROTOCOL_SUITE_VERSION} />
        <div className="mt-1.5">
          <Label className="mb-1">Available experimental support</Label>
          <div className="text-2xs text-mute leading-[15px]">
            {v.evidenceLevel === 'synthetic-patch-clamp' && `Full synthetic voltage-clamp protocol suite (activation, SSI, recovery, persistent) · n = ${v.nCells} cells.`}
            {v.evidenceLevel === 'synthetic-summary' && `Summary measurements only (n = ${v.nCells} cells). Raw traces not available.`}
            {v.evidenceLevel === 'computational-prior' && 'None. Regional computational prior only; no direct functional measurement.'}
            {v.evidenceLevel === 'uncharacterized' && 'None.'}
          </div>
        </div>
      </div>

      {known && (
        <>
          <SectionHeader title="Limitations" />
          <ul className="px-3 py-2 space-y-1">
            {c.limitations.map((l) => (
              <li key={l} className="flex gap-2 text-2xs text-mute leading-[15px]">
                <span className="text-dim">n/a</span>
                {l}
              </li>
            ))}
          </ul>

          <SectionHeader title="Potential research directions" right={<EvidenceBadge category="illustrative" />} />
          <div className="px-3 py-2 space-y-1.5">
            {DIRECTIONS[c.mechanism].map((d, k) => (
              <div key={k}>
                <div className="text-xs text-ink">{d.title}</div>
                <div className="text-2xs text-dim leading-[14px]">{d.detail}</div>
              </div>
            ))}
            <div className="pt-1 text-[9.5px] font-mono text-dim">RESEARCH HYPOTHESES · NOT TREATMENT RECOMMENDATIONS</div>
          </div>
        </>
      )}

      <div className="flex-1" />
      <div className="sticky bottom-0 p-3 border-t border-line2 bg-bg">
        <Button data-tour="atlas.inspect" variant="primary" size="lg" className="w-full" onClick={inspect}>
          INSPECT MOLECULAR MECHANISM <ArrowRight size={14} strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

const Cap = ({ children }: { children: React.ReactNode }) => <div className="font-mono text-[10px] tracking-[0.14em] text-dim uppercase mb-1.5">{children}</div>;

/** Simple view: one short card — what, where, what it does, what its neighbours do. */
function SimpleInspector({
  index,
  i,
  status,
  known,
  onHighlight,
  onInspect,
}: {
  index: AtlasIndex;
  i: number;
  status: CharacterizationStatus;
  known: boolean;
  onHighlight: (q: string) => void;
  onInspect: () => void;
}) {
  const v = index.variants[i];
  const region = regionById(v.regionId);
  const where = plainWhere(region);
  const mech = known ? getClassification(v.id).mechanism : null;
  const patient = v.patientIds[0];
  const pr = regionalPrior(index, i);
  const plainCounts = MECHS.map((m, k) => ({ m, n: pr.cm[k] })).filter((c) => c.n > 0);
  const agrees = mech && pr.lean && patient ? mech === pr.lean : null;
  const posPct = ((v.position - 0.5) / SCN2A_LENGTH) * 100;

  return (
    <div data-tour="atlas.inspector" className="flex flex-col min-h-full">
      <SectionHeader title="Selected change" right={<EvidenceBadge category="simulated" />} />
      <div className="px-4 pt-4 pb-3">
        {patient && <div className="font-mono text-[11px] tracking-[0.1em] text-cyan mb-1">OUR PATIENT · {patient}</div>}
        <div className="text-[18px] leading-[24px] text-ink">{patient ? `${patient}’s change` : `Change at position ${v.position.toLocaleString('en-US')}`}</div>
        <div className="mt-1 text-[13px] leading-[19px] text-mute">
          One building block swapped: {plainSwap(v.hgvsP)}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-line2">
        <Cap>Where</Cap>
        <div className="text-[15px] leading-[21px] text-ink">
          {where.short}
          {where.detail && <span className="text-mute">, {where.detail}</span>}
        </div>
        <div className="relative mt-2.5 h-[14px]" title={`Position ${v.position} of ${SCN2A_LENGTH}`}>
          <div className="absolute left-0 right-0 top-[6px] h-[2px] bg-line rounded-full" />
          <div className="absolute top-0 w-[2px] h-[14px] bg-ink" style={{ left: `calc(${posPct}% - 1px)` }} />
        </div>
        <div className="flex justify-between font-mono text-[10px] text-dim mt-0.5">
          <span>start</span>
          <span className="text-mute tabular-nums">{v.position.toLocaleString('en-US')} of {SCN2A_LENGTH.toLocaleString('en-US')}</span>
          <span>end</span>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-line2">
        <Cap>What it does to the channel</Cap>
        {mech ? (
          <div className="flex items-baseline gap-2">
            <span className="inline-block w-[10px] h-[10px] rounded-full self-center" style={{ background: MECH_COLOR[mech] }} />
            <span className="text-[22px] leading-[28px]" style={{ color: MECH_COLOR[mech] }}>
              {PLAIN_MECH[mech]}
            </span>
            <span className="text-[13px] text-dim">({PLAIN_MECH_SUB[mech]})</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="inline-block w-[10px] h-[10px] rounded-full self-center border border-dashed border-ink" />
              <span className="text-[22px] leading-[28px] text-ink">{status === 'running' ? 'Being measured…' : 'Not measured yet'}</span>
            </div>
            <div className="mt-1 text-[13px] text-mute">Testing it in the lab is the only way to know.</div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-line2">
        <Cap>What nearby changes do</Cap>
        {pr.measured.length > 0 ? (
          <>
            <StackBar counts={pr.cm} h={10} />
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums">
              {plainCounts.map(({ m, n }) => (
                <span key={m} style={{ color: MECH_COLOR[m] }}>
                  {n} {PLAIN_MECH[m].toLowerCase()}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[13px] leading-[19px] text-mute">
              {pr.lean ? (
                <>
                  Most clear-cut neighbours are <span style={{ color: MECH_COLOR[pr.lean] }}>{PLAIN_MECH[pr.lean].toLowerCase()}</span> ({fmt.pct(pr.leanFrac)} of {pr.directional}).{' '}
                  {agrees === true ? 'Its own test agrees.' : agrees === false ? 'Its own test disagrees.' : 'A hint, not proof.'}
                </>
              ) : (
                <>Neighbours don’t point one way.</>
              )}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-mute">No measured neighbours here yet.</div>
        )}
        <button onClick={() => onHighlight(pr.region.label)} className="mt-2 text-[12px] text-mute hover:text-ink underline decoration-dotted underline-offset-2">
          Show them on the map
        </button>
      </div>

      <div className="flex-1" />
      <div className="sticky bottom-0 p-3 border-t border-line2 bg-bg">
        <Button data-tour="atlas.inspect" variant="primary" size="lg" className="w-full" onClick={onInspect}>
          INSPECT MOLECULAR MECHANISM <ArrowRight size={14} strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
