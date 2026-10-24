// Measurement table and mechanism classification report.
import type { MeasurementKey, MechanismClassification } from '../../domain/types';
import { getProfile } from '../../data/variants';
import { CLASSIFIER_VERSION, RULES, THRESHOLDS } from '../../sim/classifier';
import { CELL_SYSTEM, MEASUREMENT_KEYS, MEASUREMENT_META, MODEL_VERSION, PROTOCOL_SUITE_VERSION } from '../../sim/channel';
import { C, MECH_COLOR } from '../../ui/tokens';
import { EvidenceBadge, Label, MechanismTag, Term, cx, fmt } from '../../ui/primitives';
import { GLOSSARY } from '../../ui/glossary';
import { MEASUREMENT_LINK, useLabUi } from './labUi';

const TERM: Record<MeasurementKey, keyof typeof GLOSSARY> = {
  peakDensity: 'peakDensity',
  vHalfAct: 'vHalfAct',
  vHalfInact: 'vHalfInact',
  persistentPct: 'persistent',
  tauRecovery: 'recovery',
};

const ruleFor = (k: MeasurementKey) => RULES.find((r) => r.key === k)!;

function deltaText(k: MeasurementKey, value: number, reference: number) {
  const r = ruleFor(k);
  const d = r.delta(value, reference);
  return r.deltaUnit === 'mV' ? `${fmt.signed(d, 1)} mV` : `${fmt.num(d, 2)}×`;
}

/** Linked-row hover handlers: highlight the measurement's structural correlate in 3D. */
function useLinkHover() {
  const set = useLabUi((s) => s.set);
  const linkKey = useLabUi((s) => s.linkKey);
  return {
    linkKey,
    bind: (k: MeasurementKey) => ({
      onMouseEnter: () => set({ linkKey: k }),
      onMouseLeave: () => set({ linkKey: null }),
      title: `Structural correlate: ${MEASUREMENT_LINK[k].label}`,
    }),
  };
}

export function MeasurementTable({ variantId, characterized, color }: { variantId: string; characterized: boolean; color: string }) {
  const profile = getProfile(variantId);
  const { bind, linkKey } = useLinkHover();
  return (
    <div>
      <div className="flex items-center justify-between px-3 h-8 border-b border-line2">
        <Label>Functional measurements</Label>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-dim">{PROTOCOL_SUITE_VERSION}</span>
          <EvidenceBadge category="simulated" />
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
            <th className="text-left font-normal px-3 py-1.5">Measurement</th>
            <th className="text-right font-normal px-1 py-1.5">Variant ± SE</th>
            <th className="text-right font-normal px-1 py-1.5">Ref</th>
            <th className="text-right font-normal px-1 py-1.5">Δ</th>
            <th className="text-right font-normal pl-1 pr-3 py-1.5">n</th>
          </tr>
        </thead>
        <tbody>
          {MEASUREMENT_KEYS.map((k) => {
            const m = profile[k];
            const meta = MEASUREMENT_META[k];
            return (
              <tr key={k} {...bind(k)} className={cx('border-t border-line2 cursor-default transition-colors', linkKey === k ? 'bg-cyan/[0.06]' : 'hover:bg-surface2/60')}>
                <td className="px-3 py-1.5">
                  <div className="text-ink leading-tight"><Term k={TERM[k]}>{meta.label}</Term></div>
                  <div className="font-mono text-[9px] text-dim">{meta.unit}</div>
                </td>
                <td className="text-right px-1 py-1.5 font-mono tabular-nums whitespace-nowrap">
                  {characterized ? (
                    <>
                      <span style={{ color }}>{fmt.num(m.value, meta.digits)}</span>
                      <span className="text-dim"> ±{fmt.num(m.se, meta.digits)}</span>
                    </>
                  ) : (
                    <span className="text-dim">pending</span>
                  )}
                </td>
                <td className="text-right px-1 py-1.5 font-mono tabular-nums text-mute">{fmt.num(m.reference, meta.digits)}</td>
                <td className="text-right px-1 py-1.5 font-mono tabular-nums text-ink whitespace-nowrap">{characterized ? deltaText(k, m.value, m.reference) : '—'}</td>
                <td className="text-right pl-1 pr-3 py-1.5 font-mono tabular-nums text-mute">{characterized ? m.n : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-1.5 border-t border-line2 font-mono text-[9px] text-dim leading-[13px]">
        Mean ± SE across synthetic cells; reference = matched synthetic wild-type dataset (n = 16). Hover a row to highlight its structural correlate.
      </div>
    </div>
  );
}

// ─── Classification report ───────────────────────────────────────────────

function ScoreAxis({ c }: { c: MechanismClassification }) {
  const W = 380;
  const lim = 3.5;
  const x = (v: number) => 10 + ((Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim)) * (W - 20);
  const th = THRESHOLDS.directional;
  return (
    <svg viewBox={`0 0 ${W} 54`} className="w-full block">
      <rect x={x(-th)} width={x(th) - x(-th)} y={14} height={14} fill={C.indet} fillOpacity={0.12} />
      <line x1={x(-lim)} x2={x(lim)} y1={21} y2={21} stroke={C.line} />
      {[-3, -2, -1, 0, 1, 2, 3].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={28} y2={31} stroke={C.line} />
          <text x={x(t)} y={41} fontSize={9} textAnchor="middle" fill={C.dim} className="font-mono">{t > 0 ? `+${t}` : t}</text>
        </g>
      ))}
      {[-th, th].map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={12} y2={30} stroke={C.mute} strokeDasharray="2 2" />)}
      {/* evidence bars */}
      <rect x={x(0)} width={x(c.gofEvidence) - x(0)} y={16} height={4} fill={C.gof} fillOpacity={0.75} />
      <rect x={x(-c.lofEvidence)} width={x(0) - x(-c.lofEvidence)} y={22} height={4} fill={C.lof} fillOpacity={0.75} />
      {/* net marker */}
      <path d={`M${x(c.netScore)},11 l-4,-6 h8 z`} fill={C.ink} />
      <line x1={x(c.netScore)} x2={x(c.netScore)} y1={11} y2={30} stroke={C.ink} strokeWidth={1.5} />
      <text x={x(-lim)} y={52} fontSize={9} fill={C.lof} className="font-mono">← LoF</text>
      <text x={x(0)} y={52} fontSize={9} textAnchor="middle" fill={C.dim} className="font-mono">indeterminate |net| &lt; {th}</text>
      <text x={x(lim)} y={52} fontSize={9} textAnchor="end" fill={C.gof} className="font-mono">GoF →</text>
    </svg>
  );
}

function RuleBar({ score }: { score: number }) {
  const w = 56;
  const mid = w / 2;
  const color = score > 0.05 ? C.gof : score < -0.05 ? C.lof : C.indet;
  return (
    <svg width={w} height={10} className="block">
      <line x1={0} x2={w} y1={5} y2={5} stroke={C.line2} />
      <line x1={mid} x2={mid} y1={1} y2={9} stroke={C.line} />
      <rect x={score >= 0 ? mid : mid + score * mid} width={Math.abs(score) * mid} y={2.5} height={5} fill={color} />
    </svg>
  );
}

const REASON: Record<NonNullable<MechanismClassification['indeterminateReason']>, string> = {
  'no-significant-deviation': 'No measurement deviates beyond its decision boundary (total evidence below minimum).',
  'low-confidence': 'Effects lie near decision boundaries relative to measurement uncertainty; perturbation agreement below threshold.',
  'insufficient-data': 'No direct functional measurement; regional computational prior only.',
};

export function ClassificationReport({ c }: { c: MechanismClassification }) {
  const { bind, linkKey } = useLinkHover();
  const color = MECH_COLOR[c.mechanism];
  return (
    <div>
      <div className="flex items-center justify-between px-3 h-8 border-b border-line2">
        <Label>Mechanism classification</Label>
        <EvidenceBadge category="illustrative" />
      </div>
      <div className="px-3 py-2.5 border-b border-line2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <MechanismTag mechanism={c.mechanism} size="md" />
            <div className="mt-1 text-xs text-mute max-w-[230px]">
              {c.mechanism === 'indeterminate' ? GLOSSARY.indeterminate.definition : c.mechanism === 'mixed' ? GLOSSARY.mixed.definition : c.mechanism === 'GoF' ? GLOSSARY.gof.definition : GLOSSARY.lof.definition}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] shrink-0">
            <span className="text-dim">NET</span>
            <span className="text-right text-ink tabular-nums">{fmt.signed(c.netScore, 2)}</span>
            <span className="text-dim">GoF EV</span>
            <span className="text-right tabular-nums" style={{ color: C.gof }}>{fmt.num(c.gofEvidence, 2)}</span>
            <span className="text-dim">LoF EV</span>
            <span className="text-right tabular-nums" style={{ color: C.lof }}>{fmt.num(c.lofEvidence, 2)}</span>
            <span className="text-dim">CONF</span>
            <span className="text-right tabular-nums" style={{ color }}>{fmt.pct(c.confidence)}</span>
          </div>
        </div>
        <div className="mt-2">
          <ScoreAxis c={c} />
        </div>
        <div className="font-mono text-[9px] text-dim leading-[13px]">
          Directional call |net| ≥ {THRESHOLDS.directional} · mixed if GoF and LoF evidence each ≥ {THRESHOLDS.mixedEach} · min evidence {THRESHOLDS.minEvidence} · confidence = agreement across {THRESHOLDS.draws} seeded draws perturbing every measurement by its SE (keep call if ≥ {fmt.pct(THRESHOLDS.minConfidence)}).
        </div>
        {c.indeterminateReason && (
          <div className="mt-2 px-2 py-1.5 border border-indet/40 rounded-sm text-xs text-ink">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-indet mr-1.5">{c.indeterminateReason}</span>
            {REASON[c.indeterminateReason]}
          </div>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
            <th className="text-left font-normal px-3 py-1.5">Rule</th>
            <th className="text-right font-normal px-1 py-1.5">Δ</th>
            <th className="text-center font-normal px-1 py-1.5">Score</th>
            <th className="text-right font-normal px-1 py-1.5">w</th>
            <th className="text-right font-normal pl-1 pr-3 py-1.5">Contrib</th>
          </tr>
        </thead>
        <tbody>
          {c.rules.map((r) => (
            <tr key={r.key} {...bind(r.key)} className={cx('border-t border-line2 align-top', linkKey === r.key ? 'bg-cyan/[0.06]' : 'hover:bg-surface2/60')}>
              <td className="px-3 py-1.5">
                <div className="text-ink leading-tight">{r.label}</div>
                <div className="font-mono text-[9px] text-dim leading-[12px] mt-0.5">{r.boundary}</div>
              </td>
              <td className="text-right px-1 py-1.5 font-mono tabular-nums whitespace-nowrap text-ink">
                {r.deltaUnit === 'mV' ? fmt.signed(r.delta, 1) : fmt.num(r.delta, 2)}
                <span className="text-dim"> {r.deltaUnit === 'mV' ? 'mV' : '×'}</span>
              </td>
              <td className="px-1 py-2">
                <div className="flex justify-center"><RuleBar score={r.score} /></div>
              </td>
              <td className="text-right px-1 py-1.5 font-mono tabular-nums text-mute">{r.weight.toFixed(1)}</td>
              <td className="text-right pl-1 pr-3 py-1.5 font-mono tabular-nums" style={{ color: r.direction === 'GoF' ? C.gof : r.direction === 'LoF' ? C.lof : C.indet }}>
                {fmt.signed(r.score * r.weight, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="px-3 py-2 border-t border-line2">
        <Label className="mb-1">Limitations</Label>
        <ul className="space-y-0.5">
          {c.limitations.map((l) => (
            <li key={l} className="text-xs text-mute leading-snug pl-2.5 relative">
              <span className="absolute left-0 text-dim">·</span>
              {l}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-3 py-2 border-t border-line2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[9px]">
        <span className="text-dim">MODEL</span><span className="text-mute">{MODEL_VERSION}</span>
        <span className="text-dim">CLASSIFIER</span><span className="text-mute">{CLASSIFIER_VERSION}</span>
        <span className="text-dim">PROTOCOLS</span><span className="text-mute">{PROTOCOL_SUITE_VERSION}</span>
        <span className="text-dim">CELL SYSTEM</span><span className="text-mute">{CELL_SYSTEM}</span>
      </div>
    </div>
  );
}
