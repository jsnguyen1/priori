// Evidence-reuse engine. Evaluates each of the 11 evidence-graph nodes for a new patient context
// against the evidence library. Classification is driven exclusively by typed provenance fields,
// typed reuse conditions and validation status — never by matching titles or summaries.
import type {
  ConditionCheck,
  EvidenceArtifact,
  EvidenceNodeId,
  NodeReuseAssessment,
  ReuseAssessment,
  ReuseClass,
  ReuseCondition,
  ValidationStatus,
} from '../domain/types';
import type { ReuseContext } from './evidence';

export const REUSE_RULES_VERSION = 'PRI-REUSE rules v0.4';

export const NODE_IDS: EvidenceNodeId[] = [
  'assay-protocol',
  'reference-cell-system',
  'variant-characterization',
  'mechanism-evidence',
  'therapeutic-design-strategy',
  'candidate-screening',
  'chemistry-process',
  'quality-control',
  'safety-testing',
  'regulatory-documentation',
  'clinical-evidence',
];

export const NODE_LABELS: Record<EvidenceNodeId, string> = {
  'assay-protocol': 'Functional assay protocol',
  'reference-cell-system': 'Reference cell system',
  'variant-characterization': 'Variant characterization',
  'mechanism-evidence': 'Mechanism evidence',
  'therapeutic-design-strategy': 'Therapeutic design strategy',
  'candidate-screening': 'Candidate screening / efficacy',
  'chemistry-process': 'Chemistry & synthesis process',
  'quality-control': 'Quality control & analytics',
  'safety-testing': 'Safety testing',
  'regulatory-documentation': 'Regulatory documentation',
  'clinical-evidence': 'Clinical evidence',
};

/** Short labels for dense graph nodes. */
export const NODE_SHORT: Record<EvidenceNodeId, string> = {
  'assay-protocol': 'ASSAY PROTOCOL',
  'reference-cell-system': 'REF. CELL SYSTEM',
  'variant-characterization': 'VARIANT CHARACT.',
  'mechanism-evidence': 'MECHANISM',
  'therapeutic-design-strategy': 'DESIGN STRATEGY',
  'candidate-screening': 'CANDIDATE EFFICACY',
  'chemistry-process': 'CHEMISTRY / CMC',
  'quality-control': 'QC / ANALYTICS',
  'safety-testing': 'SAFETY / TOX',
  'regulatory-documentation': 'REGULATORY DOCS',
  'clinical-evidence': 'CLINICAL EVIDENCE',
};

/** Dependency edges of the evidence graph (from → to = "to builds on from"). */
export const EDGES: { from: EvidenceNodeId; to: EvidenceNodeId }[] = [
  { from: 'assay-protocol', to: 'variant-characterization' },
  { from: 'reference-cell-system', to: 'variant-characterization' },
  { from: 'variant-characterization', to: 'mechanism-evidence' },
  { from: 'mechanism-evidence', to: 'therapeutic-design-strategy' },
  { from: 'therapeutic-design-strategy', to: 'candidate-screening' },
  { from: 'assay-protocol', to: 'candidate-screening' },
  { from: 'candidate-screening', to: 'safety-testing' },
  { from: 'therapeutic-design-strategy', to: 'chemistry-process' },
  { from: 'chemistry-process', to: 'quality-control' },
  { from: 'quality-control', to: 'safety-testing' },
  { from: 'safety-testing', to: 'clinical-evidence' },
  { from: 'chemistry-process', to: 'regulatory-documentation' },
  { from: 'quality-control', to: 'regulatory-documentation' },
  { from: 'safety-testing', to: 'regulatory-documentation' },
  { from: 'clinical-evidence', to: 'regulatory-documentation' },
];

const RANK: Record<ReuseClass, number> = { reusable: 0, 'reuse-with-validation': 1, 'new-work': 2, 'not-transferable': 3 };
const VALIDATED: ValidationStatus[] = ['published', 'internally-validated-simulated'];

// ─── Condition evaluation ────────────────────────────────────────────────

export function evaluateCondition(cond: ReuseCondition, a: EvidenceArtifact, ctx: ReuseContext): ConditionCheck {
  const p = a.provenance;
  const ok = (satisfied: boolean, detail: string): ConditionCheck => ({ condition: cond, satisfied, detail });
  switch (cond.kind) {
    case 'same-gene':
      // ReuseContext is SCN2A-only in this demonstration; provenance gene is typed 'SCN2A'.
      return ok(p.gene === 'SCN2A', `Source gene ${p.gene}; target gene SCN2A.`);
    case 'same-mechanism':
      if (!ctx.characterized) return ok(false, `Target mechanism unknown — ${ctx.variantId} has no completed functional characterization.`);
      if (p.mechanism === null) return ok(false, 'Source artifact records no mechanism.');
      if (ctx.mechanism === 'indeterminate' || ctx.mechanism === 'mixed') return ok(false, `Target classified ${ctx.mechanism}; no directional mechanism to match.`);
      return ok(p.mechanism === ctx.mechanism, `Source mechanism ${p.mechanism}; target mechanism ${ctx.mechanism}.`);
    case 'same-variant':
      return ok(p.variantId === ctx.variantId, `Source variant ${p.variantId ?? '—'}; target variant ${ctx.variantId}.`);
    case 'same-domain':
      return ok(p.domain === ctx.domain, `Source domain ${p.domain ?? '—'}; target domain ${ctx.domain}.`);
    case 'same-region-kind':
      if (p.regionKind === null) return ok(true, `Region-level prior covers all region kinds, including ${ctx.regionKind}.`);
      return ok(p.regionKind === ctx.regionKind, `Source region kind ${p.regionKind}; target region kind ${ctx.regionKind}.`);
    case 'same-protocol-version':
      return ok(cond.version === ctx.protocolVersion, `Artifact requires ${cond.version}; target study uses ${ctx.protocolVersion}.`);
    case 'same-cell-system':
      return ok(cond.cellSystem === ctx.cellSystem, `Artifact requires ${cond.cellSystem}; target study uses ${ctx.cellSystem}.`);
    case 'same-modality':
      if (ctx.modality === null) return ok(false, `Artifact requires ${cond.modality}; no therapeutic modality selected for ${ctx.patientId}.`);
      return ok(cond.modality === ctx.modality, `Artifact requires ${cond.modality}; target modality ${ctx.modality}.`);
    case 'same-target-region':
      if (ctx.targetRegionId === null) return ok(false, `Artifact requires target region ${cond.regionId}; no target region selected for ${ctx.patientId}.`);
      return ok(cond.regionId === ctx.targetRegionId, `Artifact requires target region ${cond.regionId}; target region ${ctx.targetRegionId}.`);
    case 'never-transfers':
      return ok(false, cond.reason);
  }
}

export const conditionLabel = (c: ReuseCondition): string => {
  switch (c.kind) {
    case 'same-gene': return 'Same gene';
    case 'same-mechanism': return 'Same mechanism';
    case 'same-variant': return 'Same variant';
    case 'same-domain': return 'Same domain';
    case 'same-region-kind': return 'Same region kind';
    case 'same-protocol-version': return `Protocol ${c.version}`;
    case 'same-cell-system': return 'Same cell system';
    case 'same-modality': return `Modality ${c.modality}`;
    case 'same-target-region': return `Target region ${c.regionId}`;
    case 'never-transfers': return 'Never transfers';
  }
};

// ─── Node-level rules ────────────────────────────────────────────────────

interface ArtifactVerdict {
  artifact: EvidenceArtifact;
  checks: ConditionCheck[];
  reuseClass: ReuseClass;
  /** which node rule determined the class (drives explanation + required work) */
  reason: VerdictReason;
}

type VerdictReason =
  | 'all-satisfied-validated'
  | 'all-satisfied-unvalidated'
  | 'bridging-domain'
  | 'bridging-partial'
  | 'sequence-specific'
  | 'platform-sections-only'
  | 'failed'
  | 'never-transfers'
  | 'efficacy-variant-specific';

/** Node semantics: may an artifact with some failed conditions still transfer via bridging work? */
function evaluateArtifact(node: EvidenceNodeId, a: EvidenceArtifact, ctx: ReuseContext): ArtifactVerdict {
  const checks = a.provenance.reuseConditions.map((c) => evaluateCondition(c, a, ctx));
  const failed = checks.filter((c) => !c.satisfied);
  const has = (k: ReuseCondition['kind']) => checks.find((c) => c.condition.kind === k);
  const validated = VALIDATED.includes(a.provenance.validationStatus);
  const v = (reuseClass: ReuseClass, reason: VerdictReason): ArtifactVerdict => ({ artifact: a, checks, reuseClass, reason });

  if (checks.some((c) => c.condition.kind === 'never-transfers')) return v('not-transferable', 'never-transfers');

  // Node-rule checks (advisory, computed from provenance — not from artifact text).
  if (node === 'mechanism-evidence' && a.provenance.domain !== null) {
    const dom = evaluateCondition({ kind: 'same-domain' }, a, ctx);
    checks.push({ ...dom, detail: `${dom.detail} (node rule: domain mismatch requires a bridging study)` });
    if (failed.length === 0 && !dom.satisfied) return v('reuse-with-validation', 'bridging-domain');
  }

  if (failed.length > 0) {
    if (node === 'candidate-screening' && has('same-variant') && !has('same-variant')!.satisfied) return v('not-transferable', 'efficacy-variant-specific');
    if (node === 'mechanism-evidence' && has('same-mechanism')?.satisfied && has('same-gene')?.satisfied) return v('reuse-with-validation', 'bridging-partial');
    if (node === 'safety-testing' && has('same-modality')?.satisfied && failed.every((c) => c.condition.kind === 'same-target-region')) return v('reuse-with-validation', 'bridging-partial');
    return v('new-work', 'failed');
  }

  if (node === 'safety-testing') return v('reuse-with-validation', 'sequence-specific');
  if (node === 'regulatory-documentation') return v('reuse-with-validation', 'platform-sections-only');
  if (node === 'clinical-evidence') return v('not-transferable', 'never-transfers');
  return validated ? v('reusable', 'all-satisfied-validated') : v('reuse-with-validation', 'all-satisfied-unvalidated');
}

// Node-specific required work, keyed by outcome.
const WORK: Record<EvidenceNodeId, Record<ReuseClass, string[]>> = {
  'assay-protocol': {
    reusable: ['Run plate / rig acceptance controls against the archived reference before first use.'],
    'reuse-with-validation': ['Re-qualify protocol acceptance criteria on the current rig.', 'Repeat reference-cell controls.'],
    'new-work': ['Develop voltage-clamp protocol suite (activation, SSI, recovery, persistent).', 'Define fitting procedures and acceptance criteria.'],
    'not-transferable': ['Develop protocol de novo.'],
  },
  'reference-cell-system': {
    reusable: ['Confirm passage / expression of banked reference line.'],
    'reuse-with-validation': ['Re-derive matched wild-type reference dataset.'],
    'new-work': ['Establish heterologous NaV1.2 expression system.', 'Generate matched wild-type reference dataset.'],
    'not-transferable': ['Establish cell system de novo.'],
  },
  'variant-characterization': {
    reusable: ['None beyond data review.'],
    'reuse-with-validation': ['Replicate key measurements.'],
    'new-work': ['Clone and express the new variant.', 'Full functional characterization of the new variant under the shared protocol suite.'],
    'not-transferable': ['Characterize the variant de novo.'],
  },
  'mechanism-evidence': {
    reusable: ['Confirm classification inputs.'],
    'reuse-with-validation': ['Bridging analysis: confirm the shared mechanism holds for the new domain / variant.', 'Mutation-specific confirmation of the mechanism call.'],
    'new-work': ['Characterize the variant, then classify mechanism from its own measurements.'],
    'not-transferable': ['Determine mechanism de novo.'],
  },
  'therapeutic-design-strategy': {
    reusable: ['Review design rules against the new transcript context.'],
    'reuse-with-validation': ['Confirm target-region rationale applies to the new variant.', 'Adapt design rules; re-check allele / region accessibility.'],
    'new-work': ['Select a mechanism-matched strategy and target region.', 'Define candidate design rules.'],
    'not-transferable': ['Design strategy de novo.'],
  },
  'candidate-screening': {
    reusable: ['Review screening data.'],
    'reuse-with-validation': ['Confirmatory screen in the new variant.'],
    'new-work': ['Design and screen candidates against the new variant.'],
    'not-transferable': ['Mutation-specific candidate screen and dose-response in cells expressing the new variant.', 'Prior hits may seed the candidate set, but efficacy must be re-measured.'],
  },
  'chemistry-process': {
    reusable: ['Synthesize the new sequence under the established process.'],
    'reuse-with-validation': ['Sequence-specific synthesis and impurity profiling under the platform process.', 'Process verification for the new sequence.'],
    'new-work': ['Develop synthesis and purification process for the chosen modality.'],
    'not-transferable': ['Develop process de novo.'],
  },
  'quality-control': {
    reusable: ['Run release testing.'],
    'reuse-with-validation': ['Qualify identity / purity / impurity methods for the new sequence.'],
    'new-work': ['Develop identity, purity, impurity and release methods.'],
    'not-transferable': ['Develop methods de novo.'],
  },
  'safety-testing': {
    reusable: ['—'],
    'reuse-with-validation': ['Sequence-specific toxicology studies (always required).', 'Off-target / hybridization-dependent toxicity assessment for the new sequence.', 'Use class-safety knowledge to design — not replace — studies.'],
    'new-work': ['Design and run sequence-specific nonclinical safety program.', 'Establish modality class-safety baseline.'],
    'not-transferable': ['Safety studies de novo.'],
  },
  'regulatory-documentation': {
    reusable: ['—'],
    'reuse-with-validation': ['Update platform CMC / nonclinical sections for the new sequence.', 'Write patient-specific sections (variant rationale, safety data, clinical protocol) — new work.'],
    'new-work': ['Draft complete individualized-program documentation, including platform and patient-specific sections.'],
    'not-transferable': ['Draft documentation de novo.'],
  },
  'clinical-evidence': {
    reusable: ['—'],
    'reuse-with-validation': ['—'],
    'new-work': ['Patient-specific clinical protocol, dosing and monitoring. Clinical evidence is generated per individual.'],
    'not-transferable': ['Patient-specific clinical evaluation, dosing and monitoring. No clinical evidence transfers between individuals.'],
  },
};

function explain(node: EvidenceNodeId, best: ArtifactVerdict | null, ctx: ReuseContext): string {
  const label = NODE_LABELS[node];
  if (!best) {
    if (node === 'clinical-evidence') return 'Clinical evidence is specific to the treated individual and must be generated for this patient.';
    return `No ${label.toLowerCase()} artifact in the library is applicable to ${ctx.patientId}. This must be generated as new work.`;
  }
  const failed = best.checks.filter((c) => !c.satisfied).map((c) => conditionLabel(c.condition).toLowerCase());
  const src = best.artifact.provenance.originatingPatientId ?? 'the platform';
  switch (best.reason) {
    case 'all-satisfied-validated':
      if (node === 'assay-protocol') return 'Functional assay protocol can be reused because the same channel and assay platform are being studied.';
      if (node === 'reference-cell-system') return 'Reference cell system can be reused because the same channel is studied in the same expression system.';
      return `${label} from ${src} can be reused: all reuse conditions hold and the artifact is validated (${best.artifact.provenance.validationStatus}).`;
    case 'all-satisfied-unvalidated':
      return `${label} from ${src} satisfies every reuse condition, but its validation status (${best.artifact.provenance.validationStatus}) is insufficient for direct reuse. Additional validation is required.`;
    case 'bridging-domain':
      return `${src} established a ${best.artifact.provenance.mechanism} mechanism in the same region kind, but in domain ${best.artifact.provenance.domain} rather than ${ctx.domain}. Mechanism knowledge transfers only with a bridging confirmation.`;
    case 'bridging-partial':
      if (node === 'safety-testing') return 'Modality class-safety knowledge informs study design, but the target region differs. Sequence-specific toxicology remains new work.';
      return `Mechanism evidence partly transfers (shared mechanism), but ${failed.join(', ')} not satisfied. Bridging studies required.`;
    case 'sequence-specific':
      return 'Class-safety knowledge for the modality transfers to study design, but sequence- and patient-specific toxicology must still be performed.';
    case 'platform-sections-only':
      return 'Platform CMC and nonclinical sections can be adapted with validation. Patient-specific sections must be written new.';
    case 'efficacy-variant-specific':
      return 'Prior candidate efficacy cannot be assumed for this patient. Mutation-specific confirmation is required.';
    case 'never-transfers':
      return best.checks.find((c) => c.condition.kind === 'never-transfers')?.detail ?? 'This evidence never transfers between individuals.';
    case 'failed':
      if (node === 'variant-characterization') return `Characterization of ${best.artifact.provenance.variantId} does not describe ${ctx.variantId}. The new variant needs its own functional characterization.`;
      return `${label} from ${src} does not transfer: ${failed.join(', ')} not satisfied.`;
  }
}

function assessNode(node: EvidenceNodeId, ctx: ReuseContext, library: EvidenceArtifact[]): NodeReuseAssessment {
  const candidates = library.filter((a) => a.kind === node);
  const verdicts = candidates.map((a) => evaluateArtifact(node, a, ctx));
  const best = verdicts.length ? verdicts.reduce((b, x) => (RANK[x.reuseClass] < RANK[b.reuseClass] ? x : b)) : null;
  let reuseClass: ReuseClass = best?.reuseClass ?? 'new-work';
  // Safety testing is never fully reusable; clinical evidence never transfers.
  if (node === 'safety-testing' && reuseClass === 'reusable') reuseClass = 'reuse-with-validation';
  const requiredWork = [...WORK[node][reuseClass]];
  if (node === 'variant-characterization' && reuseClass === 'new-work' && ctx.characterized) {
    requiredWork.unshift(`Completed for ${ctx.patientId} in this session (new work performed, not inherited).`);
  }
  return {
    nodeId: node,
    label: NODE_LABELS[node],
    reuseClass,
    sourceArtifactIds: candidates.map((a) => a.id),
    checks: best ? best.checks : [],
    explanation: explain(node, best, ctx),
    requiredWork,
  };
}

/** Artifacts eligible to transfer to `ctx`: anything not generated for the target patient itself. */
export const transferableLibrary = (ctx: ReuseContext, library: EvidenceArtifact[]) =>
  library.filter((a) => a.provenance.originatingPatientId !== ctx.patientId);

/** Evaluate every evidence-graph node for a new patient context against the library. */
export function assessReuse(ctx: ReuseContext, library: EvidenceArtifact[], now: number): ReuseAssessment {
  const lib = transferableLibrary(ctx, library);
  return {
    targetPatientId: ctx.patientId,
    targetVariantId: ctx.variantId,
    targetMechanism: ctx.mechanism,
    libraryArtifactIds: lib.map((a) => a.id),
    nodes: NODE_IDS.map((n) => assessNode(n, ctx, lib)),
    edges: EDGES,
    computedAt: now,
    rulesVersion: REUSE_RULES_VERSION,
  };
}

/** Seed library only: artifacts that pre-date any patient program (published biology, atlas prior). */
export const seedOnly = (library: EvidenceArtifact[]) =>
  library.filter((a) => a.provenance.originatingPatientId === null && a.createdAt === 0);

/** PX-001's baseline: the same engine run against only what existed before PX-001 arrived. */
export function assessBaseline(ctx: ReuseContext, library: EvidenceArtifact[], now: number): ReuseAssessment {
  return assessReuse(ctx, seedOnly(library), now);
}

export const tallyClasses = (a: ReuseAssessment): Record<ReuseClass, number> => {
  const t: Record<ReuseClass, number> = { reusable: 0, 'reuse-with-validation': 0, 'new-work': 0, 'not-transferable': 0 };
  for (const n of a.nodes) t[n.reuseClass]++;
  return t;
};
