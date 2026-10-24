// Molecular Lab: real NaV1.2 structure (PDB 6J8E) ↔ variant position ↔ synthetic voltage-clamp ↔ mechanism.
import { useViewMode } from '../../ui/viewMode';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import type { ProtocolId } from '../../domain/types';
import { useActivePatient, useStore } from '../../state/store';
import { getVariant } from '../../data/variants';
import { regionAt, regionById } from '../../data/published';
import { PROTOCOLS, REFERENCE_FIT, REFERENCE_PARAMS, deriveCurves, fitCurves, runProtocol } from '../../sim/channel';
import { C, prefersReducedMotion } from '../../ui/tokens';
import { Button, EmptyState, EvidenceBadge, KV, Label, MechanismTag, SectionHeader, Segmented, Term, Toggle, cx, fmt } from '../../ui/primitives';
import { Workspace } from '../../ui/Workspace';
import { MolecularViewer } from './MolecularViewer';
import { MiniPlot, VoltageClampPanel } from './plots';
import { ClassificationReport, MeasurementTable } from './Report';
import { ANNOTATION_GROUPS, KIND_LABEL, regionNote, useLabUi, useVariantStatus, type InspectorTab } from './labUi';
import { DOMAIN_COLOR, HELIX_FRACTION, HELIX_SOURCE, REGION_GEOM, RESIDUES, SEGMENT_RANGES, nearestResolved } from './structure';

const ANALYSIS_MS = 1800;

/** 0→1 progressive reveal of variant data while the analysis is running. */
function useReveal(status: 'idle' | 'running' | 'complete') {
  const [p, setP] = useState(status === 'complete' ? 1 : 0);
  useEffect(() => {
    if (status === 'complete') return setP(1);
    if (status === 'idle') return setP(0);
    if (prefersReducedMotion()) return setP(1);
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ANALYSIS_MS);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);
  return p;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────

function Sidebar() {
  const patient = useActivePatient();
  const variantId = useStore((s) => s.selectedVariantId);
  const lab = useStore((s) => s.lab);
  const setLab = useStore((s) => s.setLab);
  const requestCamera = useStore((s) => s.requestCamera);
  const hoverRegionId = useLabUi((s) => s.hoverRegionId);
  const setUi = useLabUi((s) => s.set);
  const v = getVariant(variantId);
  const { status, classification } = useVariantStatus(variantId);
  if (!v) return <EmptyState title="No variant selected" />;
  const region = regionAt(v.position);
  const anchor = nearestResolved(v.position);
  const fromPatient = v.patientIds.includes(patient.id);
  const focus = lab.focusRegionId ? regionById(lab.focusRegionId) : null;
  const focusGeom = focus ? REGION_GEOM.get(focus.id) : null;

  return (
    <div className="flex flex-col">
      <SectionHeader title="Case context" right={<EvidenceBadge category="hypothetical" />} />
      <div className="px-3 py-2 border-b border-line2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-sm text-ink">{patient.id}</span>
          <span className="font-mono text-[10px] text-mute">AGE {patient.ageAtPresentation}</span>
        </div>
        <div className="text-xs text-mute mt-0.5">{patient.presentation}</div>
        {!fromPatient && <div className="mt-1 font-mono text-[10px] text-warn">Variant selected from atlas — not this patient's variant</div>}
      </div>

      <SectionHeader title="Variant" right={<EvidenceBadge category="hypothetical" />} />
      <div className="px-3 py-2 border-b border-line2">
        <div className="font-mono text-md text-ink">{v.hgvsP}</div>
        <div className="font-mono text-[10px] text-dim mb-1.5">{v.id}</div>
        <KV k="Residue" v={`${v.refAA}${v.position}${v.altAA}`} />
        <KV k="Region" v={region.label} sub={region.topology} />
        <KV k="Structure" v={anchor.resolved ? 'resolved in 6J8E' : `unresolved → ${anchor.residue.res}`} color={anchor.resolved ? undefined : C.warn} />
        <KV k="Synthetic cells" v={v.nCells || '—'} unit="n" />
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-mute">Mechanism</span>
          {classification ? <MechanismTag mechanism={classification.mechanism} /> : <span className="font-mono text-[10px] text-dim">{status === 'running' ? 'ANALYZING…' : 'NOT YET CHARACTERIZED'}</span>}
        </div>
        {!anchor.resolved && (
          <div className="mt-1.5 text-[11px] leading-snug text-warn/90">
            Residue {v.position} lies in a segment not resolved in 6J8E (resolved: {SEGMENT_RANGES.map(([a, b]) => `${a}–${b}`).join(', ')}). The marker is placed at the nearest resolved residue {anchor.residue.res} ({fmt.signed(anchor.offset, 0)} residues).
          </div>
        )}
      </div>

      <SectionHeader title="Scene" />
      <div className="px-3 py-2 border-b border-line2 flex flex-col gap-0.5">
        <Toggle checked={lab.showMembrane} onChange={(x) => setLab({ showMembrane: x })} label="Membrane (lipid headgroups)" />
        <Toggle checked={lab.showIons} onChange={(x) => setLab({ showIons: x })} label="Na⁺ flux (illustrative)" />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-mute">Flux channel</span>
          <Segmented
            value={lab.channelState}
            onChange={(x) => setLab({ channelState: x })}
            options={[{ value: 'reference', label: 'Reference' }, { value: 'variant', label: 'Variant' }]}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-mute">Representation</span>
          <Segmented
            value={lab.representation}
            onChange={(x) => setLab({ representation: x })}
            options={[{ value: 'cartoon', label: 'Cart' }, { value: 'trace', label: 'Trace' }, { value: 'spheres', label: 'Sph' }]}
          />
        </div>
        <div className="mt-1.5 font-mono text-[9px] text-dim leading-[13px]">
          {RESIDUES.length} resolved Cα · helices {fmt.pct(HELIX_FRACTION)} ({HELIX_SOURCE === 'deposited' ? '6J8E HELIX records' : 'geometric assignment'} ∪ UniProt TM) · colour = repeat domain
        </div>
      </div>

      <SectionHeader title="Region annotation" right={<EvidenceBadge category="published" />} />
      <div className="px-3 py-2 border-b border-line2 min-h-[92px]">
        {focus ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink">
                {focus.label}
                {KIND_LABEL[focus.kind] && <span className="ml-1.5 font-mono text-[10px] text-mute">{KIND_LABEL[focus.kind]}</span>}
              </span>
              <button className="font-mono text-[10px] text-dim hover:text-ink" onClick={() => setLab({ focusRegionId: null })}>CLEAR</button>
            </div>
            <div className="font-mono text-[10px] text-mute mt-0.5">
              res {focus.start}–{focus.end} · {focus.topology} · 6J8E {focusGeom?.resolved}/{focusGeom?.total} resolved
            </div>
            <p className="text-xs text-mute leading-snug mt-1.5">{regionNote(focus)}</p>
            {focus.id === region.id && <div className="mt-1 font-mono text-[10px] text-ink">Contains {v.hgvsP}</div>}
            <div className="mt-1 font-mono text-[9px] text-dim">Topology: UniProt Q99250 · functional note: general NaV structure–function</div>
          </>
        ) : (
          <div className="text-xs text-dim leading-snug">Click a segment in the structure, or a region below, to frame it and show its annotation.</div>
        )}
      </div>
      <div className="py-1">
        {ANNOTATION_GROUPS.map((g) => (
          <div key={g.title} className="px-3 py-1">
            <Label className="mb-0.5">{g.title}</Label>
            {g.regions.map((r) => {
              const geom = REGION_GEOM.get(r.id)!;
              const active = lab.focusRegionId === r.id;
              const hasVariant = r.id === region.id;
              return (
                <button
                  key={r.id}
                  disabled={!geom.resolved}
                  onClick={() => requestCamera('region', r.id)}
                  onMouseEnter={() => geom.resolved && setUi({ hoverRegionId: r.id })}
                  onMouseLeave={() => setUi({ hoverRegionId: null })}
                  className={cx(
                    'w-full flex items-center gap-2 h-[22px] px-1.5 -mx-1.5 rounded-sm text-left transition-colors disabled:opacity-40',
                    active ? 'bg-surface2 text-ink' : hoverRegionId === r.id ? 'bg-surface2/60 text-ink' : 'text-mute hover:text-ink',
                  )}
                >
                  <span className="inline-block w-[7px] h-[7px] rounded-[1px] shrink-0" style={{ background: DOMAIN_COLOR[r.domain] }} />
                  <span className="text-xs truncate flex-1">
                    {r.label}
                    {KIND_LABEL[r.kind] && <span className="ml-1 font-mono text-[9px] text-dim">{KIND_LABEL[r.kind]}</span>}
                  </span>
                  {hasVariant && <span className="font-mono text-[9px] text-ink">◆</span>}
                  <span className="font-mono text-[9px] text-dim tabular-nums">
                    {r.start}–{r.end}
                    {geom.resolved < geom.total && <span className="text-dim/70"> ({Math.round((100 * geom.resolved) / geom.total)}%)</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Inspector ───────────────────────────────────────────────────────────

const PROTOCOL_OPTIONS: { value: ProtocolId; label: string }[] = [
  { value: 'activation', label: 'Activation' },
  { value: 'ssi', label: 'SSI' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'persistent', label: 'Persistent' },
];

function Ephys({ variantId, reveal, color }: { variantId: string; reveal: number; color: string }) {
  const lab = useStore((s) => s.lab);
  const setLab = useStore((s) => s.setLab);
  const selectProtocol = useStore((s) => s.selectProtocol);
  const v = getVariant(variantId)!;
  const { status } = useVariantStatus(variantId);
  const showVariant = status !== 'idle';
  const protocol = PROTOCOLS[lab.protocolId];
  const refRun = useMemo(() => runProtocol(REFERENCE_PARAMS, lab.protocolId), [lab.protocolId]);
  const varRun = useMemo(() => (showVariant ? runProtocol(v.params, lab.protocolId) : null), [showVariant, v.params, lab.protocolId]);
  const refCurves = useMemo(() => deriveCurves(REFERENCE_PARAMS), []);
  const varCurves = useMemo(() => (showVariant ? deriveCurves(v.params) : null), [showVariant, v.params]);
  const varFit = useMemo(() => (varCurves ? fitCurves(v.params, varCurves) : null), [varCurves, v.params]);
  const ref = C.mute;
  const simple = useViewMode((m) => m.simple);
  const vr = reveal;
  const persistentPts = (pts: { t: number; i: number }[]) => pts.map((p) => ({ x: p.t, y: p.i * 100 }));
  const tail = (pts: { t: number; i: number }[]) => Math.max(...pts.filter((p) => p.t >= 80).map((p) => p.i * 100));
  const perMax = Math.max(1, tail(refCurves.persistentTrace), varCurves ? tail(varCurves.persistentTrace) : 0) * 2.2;

  return (
    <div className="flex flex-col">
      {!simple && <>
      <div className="px-3 pt-2 pb-2 border-b border-line2">
        <div className="flex items-center justify-between gap-2">
          <Segmented value={lab.protocolId} onChange={selectProtocol} options={PROTOCOL_OPTIONS} />
          <Segmented
            value={lab.traceMode}
            onChange={(x) => setLab({ traceMode: x })}
            options={[{ value: 'reference', label: 'Ref' }, { value: 'variant', label: 'Var' }, { value: 'overlay', label: 'Both' }]}
          />
        </div>
        <div className="mt-1.5 text-xs text-ink">{protocol.name} <span className="font-mono text-[10px] text-dim">· {protocol.version}</span></div>
        <div className="text-[11px] text-mute leading-snug">{protocol.description}</div>
        <div className="font-mono text-[9px] text-dim mt-0.5">{protocol.cellSystem} · {protocol.temperatureC} °C · {protocol.sweeps.length} sweeps</div>
      </div>
      </>}

      <div className="flex items-center justify-between px-3 h-7">
        <Label><Term k="voltageClamp">Voltage clamp</Term></Label>
        <div className="flex items-center gap-2.5 font-mono text-[10px]">
          {lab.traceMode !== 'variant' && <span className="inline-flex items-center gap-1 text-mute"><span className="w-3 h-px" style={{ background: ref }} />REF</span>}
          {lab.traceMode !== 'reference' && (
            <span className="inline-flex items-center gap-1" style={{ color: showVariant ? color : C.dim }}>
              <span className="w-3 h-px" style={{ background: showVariant ? color : C.dim }} />
              VAR
            </span>
          )}
          <EvidenceBadge category="simulated" />
        </div>
      </div>
      <div className="px-1.5" data-tour="lab.traces">
        <VoltageClampPanel protocolId={lab.protocolId} mode={lab.traceMode} reference={refRun} variant={varRun} variantColor={color} reveal={vr} variantPending={!showVariant} />
      </div>
      {simple && <div className="px-3 pb-2 text-[12px] leading-[17px] text-mute">Each curve is the current after a voltage step; deeper dips mean more sodium flowing in. <span className="text-ink">Gray = normal channel</span>{showVariant ? <>, <span style={{ color }}>colour = patient</span>.</> : '. Run the analysis to add the patient.'}</div>}

      {!simple && <>
      <div className="flex items-center justify-between px-3 h-7 mt-1 border-t border-line2">
        <Label>Derived curves · model fits</Label>
        <span className="font-mono text-[9px] text-dim">{showVariant ? 'ref vs variant' : 'reference only'}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
        <MiniPlot
          title="I–V"
          unitNote="peak"
          xDomain={[-80, 40]}
          xLabel="mV"
          yLabel="pA/pF"
          reveal={vr}
          series={[{ key: 'r', points: refCurves.iv, color: ref, markers: true }, ...(varCurves ? [{ key: 'v', points: varCurves.iv, color, variant: true, markers: true }] : [])]}
        />
        <MiniPlot
          title="G–V"
          unitNote="Boltzmann V½"
          xDomain={[-80, 40]}
          yDomain={[0, 1]}
          xLabel="mV"
          yLabel="G/Gmax"
          reveal={vr}
          series={[{ key: 'r', points: refCurves.gv, color: ref, markers: true }, ...(varCurves ? [{ key: 'v', points: varCurves.gv, color, variant: true, markers: true }] : [])]}
          vlines={[{ x: REFERENCE_FIT.vHalfAct, color: ref, label: `${fmt.num(REFERENCE_FIT.vHalfAct, 1)}` }, ...(varFit && vr >= 1 ? [{ x: varFit.vHalfAct, color, label: `${fmt.num(varFit.vHalfAct, 1)}` }] : [])]}
        />
        <MiniPlot
          title="SSI"
          unitNote="V½ inact"
          xDomain={[-130, -20]}
          yDomain={[0, 1]}
          xLabel="mV"
          yLabel="I/Imax"
          reveal={vr}
          series={[{ key: 'r', points: refCurves.ssi, color: ref, markers: true }, ...(varCurves ? [{ key: 'v', points: varCurves.ssi, color, variant: true, markers: true }] : [])]}
          vlines={[{ x: REFERENCE_FIT.vHalfInact, color: ref, label: `${fmt.num(REFERENCE_FIT.vHalfInact, 1)}` }, ...(varFit && vr >= 1 ? [{ x: varFit.vHalfInact, color, label: `${fmt.num(varFit.vHalfInact, 1)}` }] : [])]}
        />
        <MiniPlot
          title="Recovery"
          unitNote="−100 mV · τ"
          xDomain={[0.5, 80]}
          xLog
          yDomain={[0, 1]}
          xLabel="Δt ms"
          yLabel="P2/P1"
          reveal={vr}
          series={[{ key: 'r', points: refCurves.recovery, color: ref, markers: true }, ...(varCurves ? [{ key: 'v', points: varCurves.recovery, color, variant: true, markers: true }] : [])]}
          vlines={[{ x: REFERENCE_FIT.tauRecovery, color: ref, label: `τ ${fmt.num(REFERENCE_FIT.tauRecovery, 1)}` }, ...(varFit && vr >= 1 ? [{ x: varFit.tauRecovery, color, label: `τ ${fmt.num(varFit.tauRecovery, 1)}` }] : [])]}
        />
        <MiniPlot
          title="Persistent"
          unitNote="late 80–100 ms"
          xDomain={[0, 100]}
          yDomain={[0, perMax]}
          band={[80, 100]}
          xLabel="ms"
          yLabel="% peak"
          yFormat={(x) => x.toFixed(1)}
          reveal={vr}
          series={[{ key: 'r', points: persistentPts(refCurves.persistentTrace), color: ref }, ...(varCurves ? [{ key: 'v', points: persistentPts(varCurves.persistentTrace), color, variant: true }] : [])]}
        />
        <div className="border border-line2 rounded-sm bg-canvas/60 px-2 py-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-0.5">Model fit</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 font-mono text-[10px] tabular-nums leading-[15px]">
            <span className="text-dim" />
            <span className="text-dim text-right">REF</span>
            <span className="text-dim text-right">VAR</span>
            {(
              [
                ['Peak pA/pF', 'peakDensity', 0],
                ['V½ act mV', 'vHalfAct', 1],
                ['k act mV', 'kAct', 1],
                ['V½ inact mV', 'vHalfInact', 1],
                ['τ rec ms', 'tauRecovery', 2],
                ['Persist %', 'persistentPct', 2],
              ] as const
            ).map(([l, k, d]) => (
              <div key={k} className="contents">
                <span className="text-mute">{l}</span>
                <span className="text-right text-mute">{fmt.num(REFERENCE_FIT[k], d)}</span>
                <span className="text-right" style={{ color: varFit && vr >= 1 ? color : C.dim }}>{varFit && vr >= 1 ? fmt.num(varFit[k], d) : '—'}</span>
              </div>
            ))}
          </div>
          <div className="font-mono text-[8.5px] text-dim leading-[11px] mt-1">Noise-free population fits; measured means ± SE in Mechanism tab.</div>
        </div>
      </div>
      </>}
    </div>
  );
}

function Inspector() {
  const variantId = useStore((s) => s.selectedVariantId);
  const runAnalysis = useStore((s) => s.runAnalysis);
  const setModule = useStore((s) => s.setModule);
  const tab = useLabUi((s) => s.tab);
  const setUi = useLabUi((s) => s.set);
  const v = getVariant(variantId);
  const { status, classified, classification, color } = useVariantStatus(variantId);
  const reveal = useReveal(status);
  if (!v) return <EmptyState title="No variant selected" />;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center h-8 border-b border-line2 shrink-0">
        {(
          [
            ['ephys', 'Electrophysiology'],
            ['mechanism', 'Measurements · Mechanism'],
          ] as [InspectorTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setUi({ tab: id })}
            className={cx(
              'h-full px-3 font-mono text-[10px] uppercase tracking-[0.1em] border-b transition-colors',
              tab === id ? 'text-ink border-cyan' : 'text-mute border-transparent hover:text-ink',
            )}
          >
            {label}
            {id === 'mechanism' && classified && <span className="ml-1.5 inline-block w-[6px] h-[6px] rounded-[1px] align-middle" style={{ background: color }} />}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {tab === 'ephys' ? (
          <Ephys variantId={v.id} reveal={reveal} color={color} />
        ) : (
          <>
            <MeasurementTable variantId={v.id} characterized={classified} color={color} />
            {classification ? (
              <div className="border-t border-line2">
                <ClassificationReport c={classification} />
              </div>
            ) : (
              <div className="border-t border-line2 h-40">
                <EmptyState title="Not yet characterized" detail="Run the voltage-clamp analysis to compute the functional profile and mechanism classification." />
              </div>
            )}
          </>
        )}
      </div>

      {/* Primary actions */}
      <div className="shrink-0 border-t border-line2 bg-bg px-3 py-2.5">
        {status === 'idle' && (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[10px] text-dim">VARIANT · NOT YET CHARACTERIZED</span>
              <span className="font-mono text-[10px] text-dim">{PROTOCOLS.activation.version.split(' · ')[0]} · 4 protocols · n = {v.nCells || 4}</span>
            </div>
            <Button variant="primary" size="lg" className="w-full" data-tour="lab.run" onClick={() => runAnalysis(v.id)}>
              <Play size={13} /> Run voltage-clamp analysis
            </Button>
          </>
        )}
        {status === 'running' && (
          <>
            <div className="flex items-center justify-between mb-1.5 font-mono text-[10px]">
              <span className="text-cyan">ACQUIRING · FITTING · CLASSIFYING</span>
              <span className="text-mute tabular-nums">{fmt.pct(reveal)}</span>
            </div>
            <div className="h-10 border border-line rounded flex items-center px-3">
              <div className="flex-1 h-[3px] bg-line2 rounded-full overflow-hidden">
                <div className="h-full bg-cyan" style={{ width: `${reveal * 100}%` }} />
              </div>
            </div>
          </>
        )}
        {status === 'complete' && classification && (
          <>
            <button data-tour="lab.report" className="w-full flex items-center justify-between mb-1.5 group" onClick={() => setUi({ tab: 'mechanism' })}>
              <span className="flex items-center gap-2">
                <MechanismTag mechanism={classification.mechanism} />
                <span className="font-mono text-[10px] text-mute tabular-nums">net {fmt.signed(classification.netScore, 2)} · conf {fmt.pct(classification.confidence)}</span>
              </span>
              <span className="font-mono text-[10px] text-dim group-hover:text-ink">{tab === 'mechanism' ? '' : 'REPORT →'}</span>
            </button>
            <Button variant="primary" size="lg" className="w-full" data-tour="lab.explore" onClick={() => setModule('therapy')}>
              Explore therapeutic strategies <ArrowRight size={13} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Module ──────────────────────────────────────────────────────────────

export function LabModule() {
  const setUi = useLabUi((s) => s.set);
  // clear transient hover/link state when leaving the module
  useEffect(() => () => setUi({ hoverRegionId: null, linkKey: null }), [setUi]);
  return (
    <Workspace sidebar={<Sidebar />} inspector={<Inspector />} sidebarWidth={272} inspectorWidth={424}>
      <MolecularViewer />
    </Workspace>
  );
}
