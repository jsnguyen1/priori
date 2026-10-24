// Evidence artifact factories. Every artifact carries structured provenance whose fields and
// typed reuse conditions drive sim/reuse.ts — never free-text matching.
import type {
  Candidate,
  EvidenceArtifact,
  EvidenceKind,
  EvidenceProvenance,
  GeneticVariant,
  MechanismClass,
  MechanismClassification,
  ProteinRegionKind,
  DomainId,
  ScreeningRun,
  TherapeuticStrategy,
} from '../domain/types';
import { CELL_SYSTEM, PROTOCOL_SUITE_VERSION } from './channel';
import { regionById, CITATIONS, UNIPROT_SOURCE } from '../data/published';
import { ATLAS_VARIANTS } from '../data/variants';

/** The context a new patient brings to the reuse engine. */
export interface ReuseContext {
  patientId: string;
  variantId: string;
  mechanism: MechanismClass;
  /** whether the new variant has its own completed functional characterization */
  characterized: boolean;
  domain: DomainId;
  regionKind: ProteinRegionKind;
  protocolVersion: string;
  cellSystem: string;
  modality: 'ASO' | 'small molecule' | null;
  targetRegionId: string | null;
}

let counter = 0;
const nextId = () => `EV-${String(++counter).padStart(4, '0')}`;
export const resetEvidenceIds = (n = 0) => {
  counter = n;
};

const base = (
  kind: EvidenceKind,
  title: string,
  summary: string,
  now: number,
  prov: Partial<EvidenceProvenance> & Pick<EvidenceProvenance, 'sourceType' | 'validationStatus' | 'reuseConditions' | 'limitations'>,
  category: EvidenceArtifact['category'],
  dependsOn: string[] = [],
): EvidenceArtifact => ({
  id: nextId(),
  kind,
  title,
  summary,
  createdAt: now,
  category,
  dependsOn,
  provenance: {
    originatingPatientId: null,
    originatingProgram: 'SCN2A program',
    gene: 'SCN2A',
    mechanism: null,
    variantId: null,
    domain: null,
    regionKind: null,
    protocolVersion: null,
    cellSystem: null,
    modality: null,
    targetRegionId: null,
    ...prov,
  },
});

const variantDomain = (v: GeneticVariant) => regionById(v.regionId)?.domain ?? null;
const variantKind = (v: GeneticVariant) => regionById(v.regionId)?.kind ?? null;

/** Library contents that exist before PX-001 arrives. */
export function seedLibrary(): EvidenceArtifact[] {
  resetEvidenceIds(0);
  return [
    base('published-biology', 'SCN2A / NaV1.2 reference biology', 'Sequence, transmembrane topology and domain annotations; cryo-EM structure of human NaV1.2.', 0, {
      sourceType: 'published-literature',
      validationStatus: 'published',
      reuseConditions: [{ kind: 'same-gene' }],
      limitations: ['Structure lacks resolved density for most cytoplasmic linkers and termini.'],
      citation: `${UNIPROT_SOURCE}; ${CITATIONS.pan2019.full}`,
    }, 'published'),
    base('atlas-prior', `Mechanism Atlas prior (${ATLAS_VARIANTS.length.toLocaleString()} synthetic records)`, 'Region-level priors and synthetic summary measurements for hypothetical SCN2A variants.', 0, {
      sourceType: 'atlas-synthetic',
      validationStatus: 'simulated-unvalidated',
      reuseConditions: [{ kind: 'same-gene' }, { kind: 'same-region-kind' }],
      limitations: ['Synthetic records; regional priors do not establish the effect of an individual variant.'],
    }, 'simulated'),
  ];
}

/** Created when a variant's functional characterization completes in the Molecular Lab. */
export function characterizationArtifacts(
  patientId: string,
  variant: GeneticVariant,
  classification: MechanismClassification,
  library: EvidenceArtifact[],
  now: number,
): EvidenceArtifact[] {
  const out: EvidenceArtifact[] = [];
  let protocol = library.find((a) => a.kind === 'assay-protocol' && a.provenance.protocolVersion === PROTOCOL_SUITE_VERSION);
  let cells = library.find((a) => a.kind === 'reference-cell-system' && a.provenance.cellSystem === CELL_SYSTEM);
  if (!protocol) {
    protocol = base('assay-protocol', `Voltage-clamp protocol suite ${PROTOCOL_SUITE_VERSION}`, 'Activation, steady-state inactivation, recovery and persistent-current protocols with fitting procedures.', now, {
      sourceType: 'platform-process',
      originatingPatientId: patientId,
      protocolVersion: PROTOCOL_SUITE_VERSION,
      cellSystem: CELL_SYSTEM,
      validationStatus: 'internally-validated-simulated',
      reuseConditions: [{ kind: 'same-gene' }, { kind: 'same-protocol-version', version: PROTOCOL_SUITE_VERSION }],
      limitations: ['Validated only within the illustrative simulation; no wet-lab qualification.'],
    }, 'simulated');
    out.push(protocol);
  }
  if (!cells) {
    cells = base('reference-cell-system', 'Reference NaV1.2 expression system', `${CELL_SYSTEM}; matched wild-type reference dataset (n = 16).`, now, {
      sourceType: 'platform-process',
      originatingPatientId: patientId,
      cellSystem: CELL_SYSTEM,
      protocolVersion: PROTOCOL_SUITE_VERSION,
      validationStatus: 'internally-validated-simulated',
      reuseConditions: [{ kind: 'same-gene' }, { kind: 'same-cell-system', cellSystem: CELL_SYSTEM }],
      limitations: ['Heterologous system; neuronal context, isoform and β subunits not represented.'],
    }, 'simulated');
    out.push(cells);
  }
  const charac = base('variant-characterization', `Functional characterization · ${variant.hgvsP}`, `Synthetic patch-clamp profile, n = ${variant.nCells} cells, ${PROTOCOL_SUITE_VERSION}.`, now, {
    sourceType: 'simulated-experiment',
    originatingPatientId: patientId,
    variantId: variant.id,
    domain: variantDomain(variant),
    regionKind: variantKind(variant),
    protocolVersion: PROTOCOL_SUITE_VERSION,
    cellSystem: CELL_SYSTEM,
    mechanism: classification.mechanism,
    validationStatus: 'simulated-unvalidated',
    reuseConditions: [{ kind: 'same-variant' }],
    limitations: ['Specific to this variant; does not characterise other substitutions.'],
  }, 'simulated', [protocol.id, cells.id]);
  out.push(charac);
  out.push(base('mechanism-evidence', `Mechanism evidence · ${classification.mechanism} · ${regionById(variant.regionId)?.label ?? variant.regionId}`, `Rule-based classification ${classification.mechanism} (confidence ${(classification.confidence * 100).toFixed(0)}%).`, now, {
    sourceType: 'simulated-experiment',
    originatingPatientId: patientId,
    variantId: variant.id,
    mechanism: classification.mechanism,
    domain: variantDomain(variant),
    regionKind: variantKind(variant),
    protocolVersion: PROTOCOL_SUITE_VERSION,
    validationStatus: 'simulated-unvalidated',
    reuseConditions: [{ kind: 'same-gene' }, { kind: 'same-mechanism' }, { kind: 'same-region-kind' }],
    limitations: classification.limitations,
  }, 'illustrative', [charac.id]));
  return out;
}

/** Created when a screening run's findings are saved to the Evidence Library. */
export function screeningArtifacts(
  patientId: string,
  variant: GeneticVariant,
  mechanism: MechanismClass,
  strategy: TherapeuticStrategy,
  targetRegionId: string,
  run: ScreeningRun,
  candidates: Candidate[],
  library: EvidenceArtifact[],
  now: number,
): EvidenceArtifact[] {
  const out: EvidenceArtifact[] = [];
  const modality = strategy.modality === 'none' ? null : strategy.modality;
  const mech = library.filter((a) => a.kind === 'mechanism-evidence' && a.provenance.variantId === variant.id).map((a) => a.id);

  const design = base('therapeutic-design-strategy', `Design strategy · ${strategy.name}`, `Target-region rationale (${targetRegionId}) and candidate design rules for ${mechanism} mechanism.`, now, {
    sourceType: 'simulated-experiment',
    originatingPatientId: patientId,
    mechanism,
    modality,
    targetRegionId,
    validationStatus: 'simulated-unvalidated',
    reuseConditions: [{ kind: 'same-gene' }, { kind: 'same-mechanism' }, ...(modality ? [{ kind: 'same-modality' as const, modality }] : [])],
    limitations: ['Design rules are illustrative and not predictive of activity.'],
  }, 'illustrative', mech);
  out.push(design);

  const passed = run.results.filter((r) => r.outcome === 'pass').length;
  out.push(base('candidate-screening', `Virtual screen · ${run.candidateIds.length} candidates · ${variant.hgvsP}`, `${passed} pass, ${run.results.filter((r) => r.outcome === 'mixed').length} mixed, ${run.results.filter((r) => r.outcome === 'fail').length} fail, ${run.results.filter((r) => r.outcome === 'excluded-uncertainty').length} excluded (simulated).`, now, {
    sourceType: 'simulated-experiment',
    originatingPatientId: patientId,
    variantId: variant.id,
    mechanism,
    modality,
    targetRegionId,
    protocolVersion: run.protocolVersion,
    cellSystem: CELL_SYSTEM,
    validationStatus: 'simulated-unvalidated',
    reuseConditions: [{ kind: 'same-variant' }, { kind: 'same-target-region', regionId: targetRegionId }],
    limitations: ['Candidate efficacy measured against one variant does not establish efficacy for another.', 'Simulated assay; no wet-lab data.'],
  }, 'simulated', [design.id]));

  if (modality === 'ASO') {
    const shared = candidates.filter((c) => c.platformCompatibility === 'shared-chemistry').length;
    let chem = library.find((a) => a.kind === 'chemistry-process' && a.provenance.modality === 'ASO');
    if (!chem) {
      chem = base('chemistry-process', 'ASO platform chemistry & synthesis process', `Shared backbone / sugar-modification chemistry; ${shared} of ${candidates.length} candidates compatible (illustrative).`, now, {
        sourceType: 'platform-process',
        originatingPatientId: patientId,
        modality: 'ASO',
        validationStatus: 'not-validated',
        reuseConditions: [{ kind: 'same-modality', modality: 'ASO' }],
        limitations: ['Process transfer requires sequence-specific synthesis and impurity profiling.'],
      }, 'illustrative');
      out.push(chem);
      out.push(base('quality-control', 'ASO analytical & release methods', 'Identity, purity and impurity methods defined for the platform chemistry (illustrative).', now, {
        sourceType: 'platform-process',
        originatingPatientId: patientId,
        modality: 'ASO',
        validationStatus: 'not-validated',
        reuseConditions: [{ kind: 'same-modality', modality: 'ASO' }],
        limitations: ['Methods must be qualified for each new sequence.'],
      }, 'illustrative', [chem.id]));
      out.push(base('safety-testing', 'Platform class-safety knowledge (ASO)', 'Class-related nonclinical findings to inform study design. Sequence-specific toxicology remains required.', now, {
        sourceType: 'platform-process',
        originatingPatientId: patientId,
        modality: 'ASO',
        validationStatus: 'not-validated',
        reuseConditions: [{ kind: 'same-modality', modality: 'ASO' }, { kind: 'same-target-region', regionId: targetRegionId }],
        limitations: ['Does not substitute for sequence- and patient-specific safety studies.'],
      }, 'illustrative', [chem.id]));
      out.push(base('regulatory-documentation', 'Platform CMC & nonclinical documentation (draft)', 'Reusable sections describing platform chemistry and analytical methods. Patient-specific sections not included.', now, {
        sourceType: 'platform-process',
        originatingPatientId: patientId,
        modality: 'ASO',
        validationStatus: 'not-validated',
        reuseConditions: [{ kind: 'same-modality', modality: 'ASO' }],
        limitations: ['Illustrative only; no regulatory review has occurred. Each individualized program requires its own submission.'],
      }, 'illustrative', [chem.id]));
    }
  }

  out.push(base('clinical-evidence', `Clinical evidence placeholder · ${patientId}`, 'No clinical data exist. Any clinical evidence would be specific to the treated individual.', now, {
    sourceType: 'patient-specific',
    originatingPatientId: patientId,
    variantId: variant.id,
    validationStatus: 'not-validated',
    reuseConditions: [{ kind: 'never-transfers', reason: 'Clinical safety and effectiveness in one individual does not establish safety or effectiveness in another.' }],
    limitations: ['Placeholder — no Priori-designed therapy has been tested in humans.'],
  }, 'hypothetical'));

  return out;
}
