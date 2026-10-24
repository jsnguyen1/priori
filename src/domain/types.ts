// Shared domain model for PRIORI. Every module consumes these types.
// Data categories are kept explicit so the UI can always label what is real vs. simulated.

/** Epistemic category of any datum shown in the UI. Never mix categories in one value. */
export type DataCategory =
  | 'published' // published biological fact with citation
  | 'hypothetical' // invented patient / clinical characteristics
  | 'simulated' // synthetic experimental measurement produced by a deterministic model
  | 'illustrative' // illustrative model prediction (therapy scores, structure annotations)
  | 'assumption'; // financial / scheduling scenario assumption

export interface UncertaintyRange {
  low: number;
  mid: number;
  high: number;
  /** e.g. '95% CI', 'scenario range', '±1 SE' */
  basis: string;
}

export type MechanismClass = 'GoF' | 'LoF' | 'mixed' | 'indeterminate';

export type ProteinRegionKind =
  | 'N-term'
  | 'C-term'
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'
  | 'pore-loop'
  | 'extracellular-loop'
  | 'intracellular-loop'
  | 'domain-linker'
  | 'inactivation-gate';

export type DomainId = 'DI' | 'DII' | 'DIII' | 'DIV' | 'linker' | 'termini';

export interface ProteinRegion {
  id: string; // e.g. 'DIV-S4', 'DIII-DIV-linker'
  label: string;
  kind: ProteinRegionKind;
  domain: DomainId;
  start: number; // residue, inclusive (UniProt Q99250 numbering)
  end: number;
  topology: 'transmembrane' | 'intramembrane' | 'cytoplasmic' | 'extracellular';
}

// ─── Channel biophysics ──────────────────────────────────────────────────

/** Parameters of the illustrative NaV1.2 gating model (see sim/channel.ts). */
export interface ChannelParams {
  /** Relative maximal conductance (surface expression × unitary conductance), reference = 1. */
  gmaxScale: number;
  /** Activation gate (m) half-activation voltage, mV. */
  vHalfAct: number;
  /** Activation slope factor, mV. */
  kAct: number;
  /** Inactivation gate (h) half-inactivation voltage, mV. */
  vHalfInact: number;
  /** Inactivation slope factor, mV (positive number; sign handled in model). */
  kInact: number;
  /** Time constant of open-state inactivation at 0 mV, ms. */
  tauInact: number;
  /** Time constant of recovery from inactivation at −100 mV, ms. */
  tauRecovery: number;
  /** Non-inactivating fraction of conductance (persistent current), 0–1. */
  persistentFrac: number;
}

export type ProtocolId = 'activation' | 'ssi' | 'recovery' | 'persistent';

export interface ExperimentalProtocol {
  id: ProtocolId;
  name: string;
  version: string; // e.g. 'VC-ACT v1.0'
  description: string;
  holdingMv: number;
  /** Ordered sweep definitions; each sweep is a list of (duration ms, voltage mV) segments. */
  sweeps: { label: string; segments: { durMs: number; mv: number }[] }[];
  /** Index of the segment (per sweep) in which the analysed response is measured. */
  measureSegment: number;
  cellSystem: string; // e.g. 'HEK293T, transient SCN2A (illustrative)'
  temperatureC: number;
}

export interface Trace {
  sweepLabel: string;
  /** ms */
  t: Float32Array;
  /** mV */
  v: Float32Array;
  /** pA/pF */
  i: Float32Array;
}

/** A single synthetic biophysical measurement with uncertainty. */
export interface FunctionalMeasurement {
  key: MeasurementKey;
  label: string;
  unit: string;
  value: number;
  se: number; // standard error of the mean
  n: number; // cells
  reference: number; // matched reference (wild-type) value under the same protocol
  category: DataCategory; // 'simulated' for patient-derived synthetic data
  protocolVersion: string;
}

export type MeasurementKey =
  | 'peakDensity' // pA/pF (negative)
  | 'vHalfAct' // mV
  | 'vHalfInact' // mV
  | 'persistentPct' // % of peak
  | 'tauRecovery'; // ms

export type FunctionalProfile = Record<MeasurementKey, FunctionalMeasurement>;

export interface ClassificationRuleResult {
  key: MeasurementKey;
  label: string;
  /** observed deviation from reference, in the rule's units (ratio or mV) */
  delta: number;
  deltaUnit: string;
  /** −1 (LoF) … +1 (GoF); 0 within the indeterminate zone */
  score: number;
  weight: number;
  /** Human-readable boundary description, e.g. 'ratio < 0.70 → LoF; > 1.40 → GoF' */
  boundary: string;
  direction: 'GoF' | 'LoF' | 'neutral';
}

export interface MechanismClassification {
  variantId: string;
  mechanism: MechanismClass;
  netScore: number; // weighted sum, −∞..+∞ in practice ~ −3..+3
  gofEvidence: number; // sum of positive contributions
  lofEvidence: number; // sum of |negative| contributions
  /** Fraction of seeded perturbation draws (measurement SE) that reproduce `mechanism`. */
  confidence: number;
  rules: ClassificationRuleResult[];
  limitations: string[];
  /** why indeterminate, if applicable */
  indeterminateReason?: 'no-significant-deviation' | 'low-confidence' | 'insufficient-data';
  modelVersion: string;
  category: 'illustrative';
}

// ─── Variants & patients ─────────────────────────────────────────────────

export type EvidenceLevel =
  | 'synthetic-patch-clamp' // full synthetic characterization (simulated)
  | 'synthetic-summary' // synthetic summary measurements only
  | 'computational-prior' // structure/region prior only, no synthetic measurement
  | 'uncharacterized';

export interface GeneticVariant {
  id: string; // e.g. 'SCN2A:HV-1714'
  gene: 'SCN2A';
  position: number; // protein residue (Q99250)
  refAA: string; // from published reference sequence
  altAA: string; // hypothetical substitution
  hgvsP: string; // e.g. 'p.(Ser1714Pro)' — hypothetical
  regionId: string;
  /** Ground-truth parameters of the synthetic model (hidden from the "clinic" view). */
  params: ChannelParams;
  evidenceLevel: EvidenceLevel;
  /** cells in the synthetic dataset */
  nCells: number;
  patientIds: string[];
  isHypothetical: true;
}

export interface Patient {
  id: string; // 'PX-001'
  label: string;
  ageAtPresentation: string; // 'AGE: 12 HOURS'
  presentation: string;
  variantId: string;
  inheritance: 'de novo (hypothetical)' | 'unknown';
  scenario: string; // one-line clinical scenario (hypothetical)
  /** Narrative role in the demo. */
  role: 'primary' | 'second' | 'browser';
  category: 'hypothetical';
}

// ─── Therapy ─────────────────────────────────────────────────────────────

export type StrategyId =
  | 'rna-upregulation' // e.g. targeting regulatory / NMD / uORF elements to raise WT allele output
  | 'splice-modulation'
  | 'allele-selective-suppression'
  | 'small-molecule-mechanism-matched'
  | 'further-characterization';

export interface TherapeuticStrategy {
  id: StrategyId;
  name: string;
  modality: 'ASO' | 'small molecule' | 'none';
  rationale: string;
  /** Mechanisms for which this strategy is research-relevant. */
  applicableTo: MechanismClass[];
  /** Expected direction of effect on channel function. */
  intendedEffect: 'increase-function' | 'decrease-function' | 'none';
  /** Which model parameter the strategy is hypothesised to act on. */
  actsOn: 'gmaxScale' | 'persistentFrac' | 'none';
  caveats: string[];
  category: 'illustrative';
}

export interface StrategyRecommendation {
  strategy: TherapeuticStrategy;
  relevance: 'primary' | 'secondary' | 'not-indicated';
  reason: string;
}

export interface TranscriptRegion {
  id: string; // 'ex12', 'int12', 'utr5'...
  kind: 'exon' | 'intron' | 'utr5' | 'utr3' | 'uorf' | 'poison-exon' | 'regulatory';
  label: string;
  /** schematic transcript coordinates (nt, illustrative) */
  start: number;
  end: number;
  /** protein residues encoded, for coding exons */
  aaStart?: number;
  aaEnd?: number;
  targetable: boolean;
  /** strategies that may target this region */
  strategies: StrategyId[];
}

export interface Candidate {
  id: string; // 'PRI-ASO-0417' (fictional, non-actionable)
  strategyId: StrategyId;
  targetRegionId: string;
  /** schematic binding window inside the region, transcript coordinates */
  bindStart: number;
  bindEnd: number;
  bindingScore: number; // 0–1 illustrative
  specificityScore: number; // 0–1 illustrative
  uncertainty: number; // 0–1 model uncertainty
  platformCompatibility: 'shared-chemistry' | 'modified-chemistry' | 'novel';
  /** Hypothesised fractional effect on the targeted parameter (e.g. +0.6 → gmax × 1.6). */
  predictedEffect: UncertaintyRange;
  developmentRequirements: string[];
  category: 'illustrative';
}

export type WellKind = 'reference' | 'untreated-variant' | 'vehicle' | 'candidate' | 'empty';

export interface Well {
  id: string; // 'A01'
  row: number;
  col: number;
  kind: WellKind;
  candidateId?: string;
  doseNm?: number;
  /** simulated peak current density, pA/pF */
  response?: number;
  replicate?: number;
}

export type ScreeningOutcome = 'pass' | 'mixed' | 'fail' | 'excluded-uncertainty';

export interface ScreeningResult {
  candidateId: string;
  patientId: string;
  variantId: string;
  measurementKey: MeasurementKey;
  /** mean simulated response per dose, nM → value */
  doseResponse: { doseNm: number; mean: number; sd: number; n: number }[];
  referenceMean: number;
  untreatedMean: number;
  vehicleMean: number;
  /** fraction of the reference–variant gap recovered at the top dose */
  rescueFraction: UncertaintyRange;
  outcome: ScreeningOutcome;
  outcomeReason: string;
  category: 'simulated';
}

export interface ScreeningRun {
  id: string;
  patientId: string;
  variantId: string;
  candidateIds: string[];
  plate: Well[];
  results: ScreeningResult[];
  protocolVersion: string;
  completedAt: number;
  seed: number;
}

// ─── Evidence & provenance ───────────────────────────────────────────────

export type EvidenceKind =
  | 'variant-characterization'
  | 'assay-protocol'
  | 'reference-cell-system'
  | 'mechanism-evidence'
  | 'therapeutic-design-strategy'
  | 'candidate-screening'
  | 'chemistry-process'
  | 'quality-control'
  | 'safety-testing'
  | 'clinical-evidence'
  | 'regulatory-documentation'
  | 'published-biology'
  | 'atlas-prior';

export type SourceType =
  | 'published-literature'
  | 'atlas-synthetic'
  | 'simulated-experiment'
  | 'platform-process'
  | 'patient-specific';

export type ValidationStatus = 'published' | 'simulated-unvalidated' | 'internally-validated-simulated' | 'not-validated';

/** Typed predicate that must hold for an artifact to transfer to a new context. */
export type ReuseCondition =
  | { kind: 'same-gene' }
  | { kind: 'same-mechanism' }
  | { kind: 'same-variant' }
  | { kind: 'same-domain' }
  | { kind: 'same-region-kind' }
  | { kind: 'same-protocol-version'; version: string }
  | { kind: 'same-cell-system'; cellSystem: string }
  | { kind: 'same-modality'; modality: 'ASO' | 'small molecule' }
  | { kind: 'same-target-region'; regionId: string }
  | { kind: 'never-transfers'; reason: string };

export interface EvidenceProvenance {
  sourceType: SourceType;
  originatingPatientId: string | null; // null for platform / published
  originatingProgram: string; // 'SCN2A program'
  gene: 'SCN2A';
  mechanism: MechanismClass | null;
  variantId: string | null;
  domain: DomainId | null;
  regionKind: ProteinRegionKind | null;
  protocolVersion: string | null;
  cellSystem: string | null;
  modality: 'ASO' | 'small molecule' | null;
  targetRegionId: string | null;
  limitations: string[];
  reuseConditions: ReuseCondition[];
  validationStatus: ValidationStatus;
  citation?: string;
}

export interface EvidenceArtifact {
  id: string; // 'EV-0007'
  kind: EvidenceKind;
  title: string;
  summary: string;
  createdAt: number; // session ms
  provenance: EvidenceProvenance;
  category: DataCategory;
  /** IDs of artifacts this artifact depends on */
  dependsOn: string[];
}

// ─── Reuse assessment ────────────────────────────────────────────────────

export type ReuseClass = 'reusable' | 'reuse-with-validation' | 'new-work' | 'not-transferable';

/** The 11 evidence-graph nodes of the reuse graph / development plan. */
export type EvidenceNodeId =
  | 'variant-characterization'
  | 'assay-protocol'
  | 'reference-cell-system'
  | 'mechanism-evidence'
  | 'therapeutic-design-strategy'
  | 'candidate-screening'
  | 'chemistry-process'
  | 'quality-control'
  | 'safety-testing'
  | 'clinical-evidence'
  | 'regulatory-documentation';

export interface ConditionCheck {
  condition: ReuseCondition;
  satisfied: boolean;
  detail: string;
}

export interface NodeReuseAssessment {
  nodeId: EvidenceNodeId;
  label: string;
  reuseClass: ReuseClass;
  /** artifacts from the library that were evaluated for this node */
  sourceArtifactIds: string[];
  checks: ConditionCheck[];
  explanation: string;
  requiredWork: string[];
}

export interface ReuseAssessment {
  targetPatientId: string;
  targetVariantId: string;
  targetMechanism: MechanismClass;
  libraryArtifactIds: string[];
  nodes: NodeReuseAssessment[];
  edges: { from: EvidenceNodeId; to: EvidenceNodeId }[];
  computedAt: number;
  rulesVersion: string;
}

// ─── Development model ───────────────────────────────────────────────────

export type CostCategory = 'evidence-generation' | 'manufacturing' | 'clinical' | 'regulatory';

export interface DevelopmentTask {
  id: string;
  name: string;
  nodeId: EvidenceNodeId;
  costCategory: CostCategory;
  /** de-novo effort, FTE-weeks */
  effortWeeks: UncertaintyRange;
  /** de-novo duration, calendar weeks */
  durationWeeks: UncertaintyRange;
  /** de-novo cost, USD */
  costUsd: UncertaintyRange;
  dependsOn: string[];
  /** true if this task may never be skipped regardless of reuse (e.g. patient-specific safety) */
  mandatory: boolean;
  assumptionNote: string;
  category: 'assumption';
}

export type ReuseScenarioId = 'conservative' | 'optimistic';

export interface DevelopmentScenario {
  id: ReuseScenarioId;
  label: string;
  /** remaining fraction of de-novo effort/cost/duration per reuse class */
  multipliers: Record<ReuseClass, number>;
  /** fixed cost of validation when reuse-with-validation applies, USD */
  validationOverheadUsd: number;
  category: 'assumption';
}

export interface ScheduledTask {
  task: DevelopmentTask;
  reuseClass: ReuseClass;
  effortWeeks: number;
  durationWeeks: number;
  costUsd: number;
  startWeek: number;
  endWeek: number;
  onCriticalPath: boolean;
}

export interface DevelopmentPlan {
  patientId: string;
  approach: 'bespoke' | 'priori';
  scenarioId: ReuseScenarioId;
  tasks: ScheduledTask[];
  totalEffortWeeks: UncertaintyRange;
  timelineWeeks: UncertaintyRange;
  costByCategory: Record<CostCategory, UncertaintyRange>;
  preclinicalEvidenceCostUsd: UncertaintyRange;
  duplicatedEffortAvoidedWeeks: number;
  validationEffortWeeks: number;
}

// ─── Session ─────────────────────────────────────────────────────────────

export type ModuleId = 'patient' | 'atlas' | 'lab' | 'therapy' | 'reuse' | 'development';

export type LogEventType =
  | 'SESSION STARTED'
  | 'PATIENT LOADED'
  | 'CLINICAL DECISION RECORDED'
  | 'MECHANISM REVEALED'
  | 'VARIANT LOADED'
  | 'VARIANT SELECTED'
  | 'PROTOCOL SELECTED'
  | 'FUNCTIONAL PROFILE ANALYZED'
  | 'MECHANISM CLASSIFIED'
  | 'STRATEGY SELECTED'
  | 'TARGET REGION SELECTED'
  | 'CANDIDATE NOMINATED'
  | 'CANDIDATE REJECTED'
  | 'CANDIDATE ADVANCED'
  | 'SIMULATED SCREEN COMPLETE'
  | 'EVIDENCE ARTIFACT CREATED'
  | 'REUSE ASSESSMENT COMPLETED'
  | 'SCENARIO CHANGED'
  | 'DEMO RESET';

export interface LogEvent {
  id: number;
  t: number; // ms since session start
  type: LogEventType;
  detail: string;
  patientId: string | null;
}
