// Central application state. Scientific computation lives in sim/*; this store only records
// what the user has done and the artifacts those actions produced.
import { create } from 'zustand';
import type {
  EvidenceArtifact,
  LogEvent,
  LogEventType,
  ModuleId,
  ProtocolId,
  ReuseAssessment,
  ReuseScenarioId,
  ScreeningRun,
  StrategyId,
} from '../domain/types';
import { getPatient } from '../data/patients';
import { getClassification, getVariant } from '../data/variants';
import { regionById } from '../data/published';
import { PROTOCOLS } from '../sim/channel';
import { characterizationArtifacts, screeningArtifacts, seedLibrary, type ReuseContext } from '../sim/evidence';
import { generateCandidates, getStrategy } from '../sim/therapy';
import { runScreening } from '../sim/screening';
import { assessReuse } from '../sim/reuse';
import { CELL_SYSTEM, PROTOCOL_SUITE_VERSION } from '../sim/channel';

export const PRIMARY_PATIENT_ID = 'PX-001';
export const SECOND_PATIENT_ID = 'PX-002';

export type Decision = { choice: 'administer' | 'withhold'; at: number };
export type AnalysisStatus = 'idle' | 'running' | 'complete';
export type TraceMode = 'reference' | 'variant' | 'overlay';
export type Representation = 'cartoon' | 'trace' | 'spheres';

export interface TherapyState {
  strategyId: StrategyId | null;
  targetRegionId: string | null;
  nominated: string[];
  rejected: Record<string, string>;
  screeningRun: ScreeningRun | null;
  selectedWellId: string | null;
  savedArtifactIds: string[];
}

const emptyTherapy = (): TherapyState => ({
  strategyId: null,
  targetRegionId: null,
  nominated: [],
  rejected: {},
  screeningRun: null,
  selectedWellId: null,
  savedArtifactIds: [],
});

export interface LabView {
  protocolId: ProtocolId;
  traceMode: TraceMode;
  representation: Representation;
  showMembrane: boolean;
  showIons: boolean;
  channelState: 'reference' | 'variant';
  focusRegionId: string | null;
  /** increments to request a camera re-frame (focus mutation / reset) */
  cameraNonce: number;
  cameraTarget: 'overview' | 'mutation' | 'region';
}

const defaultLabView = (): LabView => ({
  protocolId: 'activation',
  traceMode: 'overlay',
  representation: 'cartoon',
  showMembrane: true,
  showIons: true,
  channelState: 'variant',
  focusRegionId: null,
  cameraNonce: 0,
  cameraTarget: 'overview',
});

export interface State {
  sessionStart: number;
  resetNonce: number;
  module: ModuleId;
  presentation: { active: boolean; step: number };
  paletteOpen: boolean;
  logOpen: boolean;
  provenanceOpen: boolean;

  activePatientId: string;
  loadedPatientIds: string[];
  selectedVariantId: string;
  /** requests the atlas to animate its viewport to a residue */
  atlasFocus: { position: number; nonce: number } | null;

  decision: Decision | null;
  mechanismRevealed: boolean;

  analyses: Record<string, { status: AnalysisStatus; startedAt: number; completedAt: number | null }>;
  lab: LabView;

  therapy: Record<string, TherapyState>;

  evidenceLibrary: EvidenceArtifact[];
  reuse: Record<string, ReuseAssessment>;
  selectedReuseNode: string | null;

  development: { scenarioId: ReuseScenarioId; patientId: string; selectedTaskId: string | null };

  log: LogEvent[];
}

export interface Actions {
  now: () => number;
  logEvent: (type: LogEventType, detail: string, patientId?: string | null) => void;
  setModule: (m: ModuleId) => void;
  setPaletteOpen: (open: boolean) => void;
  toggleLog: (open?: boolean) => void;
  toggleProvenance: (open?: boolean) => void;

  setActivePatient: (pid: string) => void;
  loadNewPatient: (pid: string) => void;
  selectVariant: (variantId: string, opts?: { focus?: boolean; silent?: boolean }) => void;
  focusAtlas: (position: number) => void;

  decide: (choice: Decision['choice']) => void;
  revealMechanism: () => void;

  setLab: (patch: Partial<LabView>) => void;
  requestCamera: (target: LabView['cameraTarget'], regionId?: string | null) => void;
  selectProtocol: (p: ProtocolId) => void;
  runAnalysis: (variantId: string, opts?: { immediate?: boolean }) => void;
  completeAnalysis: (variantId: string) => void;

  therapyFor: (pid: string) => TherapyState;
  selectStrategy: (pid: string, sid: StrategyId) => void;
  selectTargetRegion: (pid: string, regionId: string) => void;
  toggleNominate: (pid: string, candidateId: string) => void;
  rejectCandidate: (pid: string, candidateId: string, reason: string) => void;
  restoreCandidate: (pid: string, candidateId: string) => void;
  advanceToScreening: (pid: string) => void;
  selectWell: (pid: string, wellId: string | null) => void;
  saveScreeningEvidence: (pid: string) => void;

  buildReuseContext: (pid: string) => ReuseContext;
  runReuseAssessment: (pid: string) => void;
  selectReuseNode: (id: string | null) => void;

  setScenario: (s: ReuseScenarioId) => void;
  setDevelopmentPatient: (pid: string) => void;
  selectTask: (id: string | null) => void;

  setPresentation: (patch: Partial<State['presentation']>) => void;
  resetDemo: () => void;
}

export const ANALYSIS_MS = 1800;

const initialState = (): State => {
  const pid = PRIMARY_PATIENT_ID;
  const start = Date.now();
  return {
    sessionStart: start,
    resetNonce: 0,
    module: 'patient',
    presentation: { active: false, step: 0 },
    paletteOpen: false,
    logOpen: false,
    provenanceOpen: false,
    activePatientId: pid,
    loadedPatientIds: [pid],
    selectedVariantId: getPatient(pid).variantId,
    atlasFocus: null,
    decision: null,
    mechanismRevealed: false,
    analyses: {},
    lab: defaultLabView(),
    therapy: {},
    evidenceLibrary: seedLibrary(),
    reuse: {},
    selectedReuseNode: null,
    development: { scenarioId: 'conservative', patientId: SECOND_PATIENT_ID, selectedTaskId: null },
    log: [
      { id: 1, t: 0, type: 'SESSION STARTED', detail: 'Research workspace initialised · synthetic demonstration dataset', patientId: null },
      { id: 2, t: 0, type: 'PATIENT LOADED', detail: `${pid} · ${getPatient(pid).presentation}`, patientId: pid },
    ],
  };
};

let logId = 10;
let analysisTimers: ReturnType<typeof setTimeout>[] = [];

export const useStore = create<State & Actions>()((set, get) => ({
  ...initialState(),

  now: () => Date.now() - get().sessionStart,

  logEvent: (type, detail, patientId = get().activePatientId) =>
    set((s) => ({ log: [...s.log, { id: ++logId, t: Date.now() - s.sessionStart, type, detail, patientId }] })),

  setModule: (m) => set({ module: m }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  toggleLog: (open) => set((s) => ({ logOpen: open ?? !s.logOpen })),
  toggleProvenance: (open) => set((s) => ({ provenanceOpen: open ?? !s.provenanceOpen })),

  setActivePatient: (pid) => {
    if (pid === get().activePatientId) return;
    const p = getPatient(pid);
    set((s) => ({
      activePatientId: pid,
      loadedPatientIds: s.loadedPatientIds.includes(pid) ? s.loadedPatientIds : [...s.loadedPatientIds, pid],
      selectedVariantId: p.variantId,
      lab: { ...s.lab, focusRegionId: null, cameraTarget: 'mutation', cameraNonce: s.lab.cameraNonce + 1 },
    }));
    get().logEvent('PATIENT LOADED', `${pid} · ${p.presentation}`, pid);
    get().focusAtlas(getVariant(p.variantId)!.position);
  },

  loadNewPatient: (pid) => {
    const p = getPatient(pid);
    const v = getVariant(p.variantId)!;
    get().setActivePatient(pid);
    get().logEvent('VARIANT LOADED', `${v.id} ${v.hgvsP} · ${regionById(v.regionId)?.label ?? v.regionId} · evidence library retained (${get().evidenceLibrary.length} artifacts)`, pid);
  },

  selectVariant: (variantId, opts = {}) => {
    const v = getVariant(variantId);
    if (!v) return;
    set({ selectedVariantId: variantId });
    if (opts.focus) get().focusAtlas(v.position);
    if (!opts.silent) get().logEvent('VARIANT SELECTED', `${v.id} ${v.hgvsP}`);
  },

  focusAtlas: (position) => set((s) => ({ atlasFocus: { position, nonce: (s.atlasFocus?.nonce ?? 0) + 1 } })),

  decide: (choice) => {
    if (get().decision) return;
    set({ decision: { choice, at: get().now() } });
    get().logEvent('CLINICAL DECISION RECORDED', choice === 'administer' ? 'ADMINISTER sodium-channel blocker (educational simulation)' : 'WITHHOLD / SEEK FURTHER EVIDENCE (educational simulation)', PRIMARY_PATIENT_ID);
  },

  revealMechanism: () => {
    if (get().mechanismRevealed) return;
    set({ mechanismRevealed: true });
    const v = getVariant(getPatient(PRIMARY_PATIENT_ID).variantId)!;
    get().logEvent('MECHANISM REVEALED', `${v.hgvsP} modelled as ${getClassification(v.id).mechanism} (simulated)`, PRIMARY_PATIENT_ID);
  },

  setLab: (patch) => set((s) => ({ lab: { ...s.lab, ...patch } })),
  requestCamera: (target, regionId = null) =>
    set((s) => ({ lab: { ...s.lab, cameraTarget: target, focusRegionId: target === 'region' ? regionId : s.lab.focusRegionId, cameraNonce: s.lab.cameraNonce + 1 } })),
  selectProtocol: (p) => {
    if (get().lab.protocolId === p) return;
    set((s) => ({ lab: { ...s.lab, protocolId: p } }));
    get().logEvent('PROTOCOL SELECTED', `${PROTOCOLS[p].name} · ${PROTOCOLS[p].version}`);
  },

  runAnalysis: (variantId, opts = {}) => {
    const cur = get().analyses[variantId];
    if (cur && cur.status !== 'idle') return;
    set((s) => ({ analyses: { ...s.analyses, [variantId]: { status: 'running', startedAt: get().now(), completedAt: null } } }));
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (opts.immediate || reduced) get().completeAnalysis(variantId);
    else analysisTimers.push(setTimeout(() => get().completeAnalysis(variantId), ANALYSIS_MS));
  },

  completeAnalysis: (variantId) => {
    const cur = get().analyses[variantId];
    if (cur?.status === 'complete') return;
    const v = getVariant(variantId)!;
    const c = getClassification(variantId);
    const pid = v.patientIds[0] ?? get().activePatientId;
    set((s) => ({ analyses: { ...s.analyses, [variantId]: { status: 'complete', startedAt: cur?.startedAt ?? get().now(), completedAt: get().now() } } }));
    get().logEvent('FUNCTIONAL PROFILE ANALYZED', `${v.hgvsP} · ${PROTOCOL_SUITE_VERSION} · n = ${v.nCells} cells (simulated)`, pid);
    get().logEvent('MECHANISM CLASSIFIED', `${c.mechanism} · net score ${c.netScore.toFixed(2)} · confidence ${(c.confidence * 100).toFixed(0)}%`, pid);
    const created = characterizationArtifacts(pid, v, c, get().evidenceLibrary, get().now());
    set((s) => ({ evidenceLibrary: [...s.evidenceLibrary, ...created] }));
    for (const a of created) get().logEvent('EVIDENCE ARTIFACT CREATED', `${a.id} · ${a.title}`, pid);
  },

  therapyFor: (pid) => get().therapy[pid] ?? emptyTherapy(),

  selectStrategy: (pid, sid) => {
    const t = get().therapyFor(pid);
    if (t.strategyId === sid) return;
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...emptyTherapy(), strategyId: sid } } }));
    get().logEvent('STRATEGY SELECTED', getStrategy(sid).name, pid);
  },

  selectTargetRegion: (pid, regionId) => {
    const t = get().therapyFor(pid);
    if (t.targetRegionId === regionId) return;
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...t, targetRegionId: regionId, nominated: [], rejected: {}, screeningRun: null, selectedWellId: null, savedArtifactIds: [] } } }));
    get().logEvent('TARGET REGION SELECTED', regionId, pid);
  },

  toggleNominate: (pid, cid) => {
    const t = get().therapyFor(pid);
    const on = t.nominated.includes(cid);
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...t, nominated: on ? t.nominated.filter((x) => x !== cid) : [...t.nominated, cid] } } }));
    if (!on) get().logEvent('CANDIDATE NOMINATED', cid, pid);
  },

  rejectCandidate: (pid, cid, reason) => {
    const t = get().therapyFor(pid);
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...t, nominated: t.nominated.filter((x) => x !== cid), rejected: { ...t.rejected, [cid]: reason } } } }));
    get().logEvent('CANDIDATE REJECTED', `${cid} · ${reason}`, pid);
  },

  restoreCandidate: (pid, cid) => {
    const t = get().therapyFor(pid);
    const rejected = { ...t.rejected };
    delete rejected[cid];
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...t, rejected } } }));
  },

  advanceToScreening: (pid) => {
    const t = get().therapyFor(pid);
    if (!t.strategyId || !t.targetRegionId || t.nominated.length === 0) return;
    const p = getPatient(pid);
    const v = getVariant(p.variantId)!;
    const all = generateCandidates(pid, v, t.strategyId, t.targetRegionId);
    const chosen = all.filter((c) => t.nominated.includes(c.id) && !t.rejected[c.id]);
    if (chosen.length === 0) return;
    get().logEvent('CANDIDATE ADVANCED', `${chosen.map((c) => c.id).join(', ')} → virtual screening`, pid);
    const run = runScreening(pid, v, getStrategy(t.strategyId), chosen, get().now());
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...t, screeningRun: run, selectedWellId: null, savedArtifactIds: [] } } }));
    const counts = run.results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
    get().logEvent('SIMULATED SCREEN COMPLETE', `${run.id} · ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(' · ')}`, pid);
  },

  selectWell: (pid, wellId) => {
    const t = get().therapyFor(pid);
    set((s) => ({ therapy: { ...s.therapy, [pid]: { ...t, selectedWellId: wellId } } }));
  },

  saveScreeningEvidence: (pid) => {
    const t = get().therapyFor(pid);
    if (!t.screeningRun || !t.strategyId || !t.targetRegionId || t.savedArtifactIds.length > 0) return;
    const p = getPatient(pid);
    const v = getVariant(p.variantId)!;
    const c = getClassification(v.id);
    const strategy = getStrategy(t.strategyId);
    const cands = generateCandidates(pid, v, t.strategyId, t.targetRegionId).filter((x) => t.screeningRun!.candidateIds.includes(x.id));
    const created = screeningArtifacts(pid, v, c.mechanism, strategy, t.targetRegionId, t.screeningRun, cands, get().evidenceLibrary, get().now());
    set((s) => ({
      evidenceLibrary: [...s.evidenceLibrary, ...created],
      therapy: { ...s.therapy, [pid]: { ...t, savedArtifactIds: created.map((a) => a.id) } },
    }));
    for (const a of created) get().logEvent('EVIDENCE ARTIFACT CREATED', `${a.id} · ${a.title}`, pid);
  },

  buildReuseContext: (pid) => {
    const p = getPatient(pid);
    const v = getVariant(p.variantId)!;
    const region = regionById(v.regionId)!;
    const characterized = get().analyses[v.id]?.status === 'complete';
    const c = getClassification(v.id);
    // The new patient's own therapy choice if any; otherwise inherit the modality explored for the
    // most recent patient with the same mechanism (the hypothesis being tested for transfer).
    let t = get().therapy[pid];
    if (!t?.strategyId) {
      const prior = Object.entries(get().therapy).find(([k, x]) => k !== pid && x.strategyId && getClassification(getVariant(getPatient(k).variantId)!.id).mechanism === c.mechanism);
      t = prior?.[1] ?? emptyTherapy();
    }
    const strategy = t.strategyId ? getStrategy(t.strategyId) : null;
    return {
      patientId: pid,
      variantId: v.id,
      mechanism: characterized ? c.mechanism : 'indeterminate',
      characterized,
      domain: region.domain,
      regionKind: region.kind,
      protocolVersion: PROTOCOL_SUITE_VERSION,
      cellSystem: CELL_SYSTEM,
      modality: strategy && strategy.modality !== 'none' ? strategy.modality : null,
      targetRegionId: t.targetRegionId,
    };
  },

  runReuseAssessment: (pid) => {
    const ctx = get().buildReuseContext(pid);
    const a = assessReuse(ctx, get().evidenceLibrary, get().now());
    set((s) => ({ reuse: { ...s.reuse, [pid]: a } }));
    const tally = a.nodes.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.reuseClass]: (acc[n.reuseClass] ?? 0) + 1 }), {});
    get().logEvent('REUSE ASSESSMENT COMPLETED', `${pid} vs ${a.libraryArtifactIds.length} artifacts · ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(' · ')}`, pid);
  },

  selectReuseNode: (id) => set({ selectedReuseNode: id }),

  setScenario: (sid) => {
    if (get().development.scenarioId === sid) return;
    set((s) => ({ development: { ...s.development, scenarioId: sid } }));
    get().logEvent('SCENARIO CHANGED', `Reuse scenario → ${sid}`);
  },
  setDevelopmentPatient: (pid) => set((s) => ({ development: { ...s.development, patientId: pid } })),
  selectTask: (id) => set((s) => ({ development: { ...s.development, selectedTaskId: id } })),

  setPresentation: (patch) => set((s) => ({ presentation: { ...s.presentation, ...patch } })),

  resetDemo: () => {
    analysisTimers.forEach(clearTimeout);
    analysisTimers = [];
    const nonce = get().resetNonce + 1;
    const presenting = get().presentation.active;
    logId = 10;
    set({ ...initialState(), resetNonce: nonce, presentation: { active: presenting, step: 0 } });
    get().logEvent('DEMO RESET', 'Workspace restored to initial state', null);
  },
}));

/** Convenience selectors */
export const useActivePatient = () => getPatient(useStore((s) => s.activePatientId));
