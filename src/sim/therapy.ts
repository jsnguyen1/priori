// Therapeutic design model — ILLUSTRATIVE.
//
// Three things live here:
//   1. A small library of research strategy categories (STRATEGIES) and a deterministic
//      mechanism-dependent recommender (recommendStrategies).
//   2. A SCHEMATIC SCN2A transcript model (TRANSCRIPT). Coordinates are invented and not to
//      scale: introns are compressed, the poison exon is hypothetical, and exon↔residue
//      mapping is proportional and approximate.
//   3. A deterministic generator of FICTIONAL candidate records (generateCandidates). Candidates
//      carry no nucleotide sequences, are not synthesis-ready, and their scores are illustrative
//      model outputs — not efficacy or safety predictions.
//
// Everything is seeded through sim/rng.ts: identical inputs always produce identical outputs.
import type {
  Candidate,
  GeneticVariant,
  MechanismClass,
  MechanismClassification,
  StrategyId,
  StrategyRecommendation,
  TherapeuticStrategy,
  TranscriptRegion,
  UncertaintyRange,
} from '../domain/types';
import { SCN2A_LENGTH } from '../data/published';
import { REFERENCE_PARAMS, approximateFit } from './channel';
import { clamp, gaussian, rngFor } from './rng';

export const THERAPY_MODEL_VERSION = 'PRI-DESIGN rules v0.4 (illustrative)';

/** Phrase the recommender must surface when the mechanism does not support a design decision. */
export const INSUFFICIENT_EVIDENCE = 'Insufficient evidence to nominate a therapeutic candidate';

/** Confidence below which no mechanism-matched strategy is nominated. */
export const MIN_DESIGN_CONFIDENCE = 0.6;

/** Sentinel target id used when a strategy acts on the protein and has no RNA target region. */
export const PROTEIN_LEVEL_TARGET = 'protein-level';

// ─── Strategy library ────────────────────────────────────────────────────

export const STRATEGIES: TherapeuticStrategy[] = [
  {
    id: 'rna-upregulation',
    name: 'RNA expression upregulation',
    modality: 'ASO',
    rationale:
      'Target a regulatory element in the untranslated regions — an upstream open reading frame or an NMD-linked element — so that a larger fraction of SCN2A transcript is productively translated. Acts on both alleles, so it raises output of the reference allele as well. Research-stage concept for loss-of-function / haploinsufficiency.',
    applicableTo: ['LoF'],
    intendedEffect: 'increase-function',
    actsOn: 'gmaxScale',
    caveats: [
      'Allele-agnostic: output of the variant allele is raised together with the reference allele.',
      'Upregulation above the reference level would itself be a gain-of-function risk; dose control is the central problem.',
      'The regulatory elements drawn here are schematic placeholders, not mapped elements.',
    ],
    category: 'illustrative',
  },
  {
    id: 'splice-modulation',
    name: 'Splice modulation (poison-exon skipping)',
    modality: 'ASO',
    rationale:
      'Block recognition of a non-productive ("poison") exon so that a greater share of pre-mRNA is spliced into the productive isoform, increasing functional channel. Research-stage concept for loss-of-function; it depends entirely on a poison exon existing and being used in the relevant cell type.',
    applicableTo: ['LoF'],
    intendedEffect: 'increase-function',
    actsOn: 'gmaxScale',
    caveats: [
      'The poison exon in this transcript model is HYPOTHETICAL; no such element is asserted for SCN2A here.',
      'Ceiling is set by the baseline inclusion rate of the non-productive isoform.',
      'Splice outcomes are binary per transcript; the continuous dose–response shown is a simplification.',
    ],
    category: 'illustrative',
  },
  {
    id: 'allele-selective-suppression',
    name: 'Allele-selective RNA suppression',
    modality: 'ASO',
    rationale:
      'Reduce transcript from the variant allele while sparing the reference allele, lowering the excess channel activity produced by a gain-of-function variant. Selectivity would depend on a discriminating sequence difference at the variant site.',
    applicableTo: ['GoF'],
    intendedEffect: 'decrease-function',
    actsOn: 'gmaxScale',
    caveats: [
      'Selectivity between two alleles differing at a single position is the hardest part of the concept and is only scored illustratively here.',
      'Loss of selectivity would suppress the reference allele and convert the intervention into a loss-of-function insult.',
      'Single-nucleotide-level discrimination is not modelled in this simulation.',
    ],
    category: 'illustrative',
  },
  {
    id: 'small-molecule-mechanism-matched',
    name: 'Mechanism-matched small molecule',
    modality: 'small molecule',
    rationale:
      'Research on sodium-channel–directed small molecules for gain-of-function mechanisms: the sodium-channel blocker class, and modulators that preferentially act on persistent (non-inactivating) current. Acts on the channel protein, so there is no RNA target region.',
    applicableTo: ['GoF', 'mixed'],
    intendedEffect: 'decrease-function',
    actsOn: 'persistentFrac',
    caveats: [
      'Not isoform- or allele-selective: other voltage-gated sodium channels are affected.',
      'In a mixed mechanism, reducing channel activity may worsen the loss-of-function component.',
      'No pharmacokinetics, brain exposure, or off-target pharmacology are modelled.',
    ],
    category: 'illustrative',
  },
  {
    id: 'further-characterization',
    name: 'Further functional characterization',
    modality: 'none',
    rationale:
      'Generate additional evidence before any therapeutic direction is chosen: more cells, orthogonal assays, neuronal models, and replication of the measurements that sit closest to the classifier decision boundaries.',
    applicableTo: ['GoF', 'LoF', 'mixed', 'indeterminate'],
    intendedEffect: 'none',
    actsOn: 'none',
    caveats: ['Produces evidence, not a therapeutic candidate.'],
    category: 'illustrative',
  },
];

const RANK: Record<StrategyRecommendation['relevance'], number> = { primary: 0, secondary: 1, 'not-indicated': 2 };

export function getStrategy(id: StrategyId): TherapeuticStrategy {
  const s = STRATEGIES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown strategy ${id}`);
  return s;
}

// ─── Recommendation ──────────────────────────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** Mechanism-dependent research strategy recommendations (deterministic). */
export function recommendStrategies(classification: MechanismClassification): StrategyRecommendation[] {
  const { mechanism, confidence } = classification;
  const lowConfidence = mechanism !== 'indeterminate' && confidence < MIN_DESIGN_CONFIDENCE;
  const blocked = mechanism === 'indeterminate' || lowConfidence;
  const rel: Partial<Record<StrategyId, { relevance: StrategyRecommendation['relevance']; reason: string }>> = {};

  if (blocked) {
    const why = mechanism === 'indeterminate'
      ? `mechanism is indeterminate (${classification.indeterminateReason ?? 'unresolved'})`
      : `directional call reproduced in only ${pct(confidence)} of perturbation draws (threshold ${pct(MIN_DESIGN_CONFIDENCE)})`;
    rel['further-characterization'] = {
      relevance: 'primary',
      reason: `${INSUFFICIENT_EVIDENCE}: ${why}. Design decisions are deferred until the mechanism is resolved.`,
    };
    const shared = `${INSUFFICIENT_EVIDENCE} — direction of effect is unknown, so an intervention intended to raise or lower channel function cannot be justified.`;
    for (const s of STRATEGIES) {
      if (s.id === 'further-characterization') continue;
      rel[s.id] = { relevance: 'not-indicated', reason: shared };
    }
  } else if (mechanism === 'LoF') {
    rel['rna-upregulation'] = {
      relevance: 'primary',
      reason: `Loss of function (confidence ${pct(confidence)}): raising productive transcript from both alleles is the direction-matched concept, and the regulatory elements in the untranslated regions are the most tractable illustrative handles.`,
    };
    rel['splice-modulation'] = {
      relevance: 'secondary',
      reason: 'Direction-matched alternative, but conditional on a usable non-productive exon existing in the relevant cell type — hypothetical in this model.',
    };
    rel['further-characterization'] = {
      relevance: 'secondary',
      reason: 'Run in parallel: the achievable upregulation ceiling and the baseline isoform ratio are unmeasured here.',
    };
    rel['allele-selective-suppression'] = {
      relevance: 'not-indicated',
      reason: 'Direction-opposed: suppressing transcript would deepen an existing loss of function.',
    };
    rel['small-molecule-mechanism-matched'] = {
      relevance: 'not-indicated',
      reason: 'Direction-opposed: sodium-channel blockade reduces channel activity that is already reduced.',
    };
  } else if (mechanism === 'GoF') {
    rel['allele-selective-suppression'] = {
      relevance: 'primary',
      reason: `Gain of function (confidence ${pct(confidence)}): lowering output of the variant allele is direction-matched and, if selective, leaves the reference allele intact.`,
    };
    rel['small-molecule-mechanism-matched'] = {
      relevance: 'secondary',
      reason: 'Direction-matched and clinically available as a class, but not allele- or isoform-selective; relevant where the gain of function is carried by persistent current.',
    };
    rel['further-characterization'] = {
      relevance: 'secondary',
      reason: 'Allele selectivity is not addressed by the present assay; it requires evidence this platform does not yet generate.',
    };
    rel['rna-upregulation'] = {
      relevance: 'not-indicated',
      reason: 'Direction-opposed: raising transcript would amplify a gain of function.',
    };
    rel['splice-modulation'] = {
      relevance: 'not-indicated',
      reason: 'Direction-opposed: increasing productive transcript would amplify a gain of function.',
    };
  } else {
    // mixed
    rel['further-characterization'] = {
      relevance: 'primary',
      reason: `Opposing effects (GoF evidence ${classification.gofEvidence.toFixed(2)} vs LoF evidence ${classification.lofEvidence.toFixed(2)}): the net neuronal consequence cannot be inferred from channel parameters, so no direction-matched design is nominated. Additional characterization is the primary recommendation.`,
    };
    rel['small-molecule-mechanism-matched'] = {
      relevance: 'secondary',
      reason: 'Considered only in its persistent-current–preferring form, which addresses the gain-of-function component while perturbing peak current less. Carries a clear risk of worsening the loss-of-function component.',
    };
    rel['allele-selective-suppression'] = {
      relevance: 'not-indicated',
      reason: 'Suppressing the variant allele removes both its excess and its remaining function; with opposing effects the net direction is unknown.',
    };
    rel['rna-upregulation'] = {
      relevance: 'not-indicated',
      reason: 'Raising transcript would amplify the gain-of-function component.',
    };
    rel['splice-modulation'] = {
      relevance: 'not-indicated',
      reason: 'Raising productive transcript would amplify the gain-of-function component.',
    };
  }

  return STRATEGIES.map((strategy) => {
    const r = rel[strategy.id] ?? { relevance: 'not-indicated' as const, reason: 'Not applicable to this mechanism.' };
    return { strategy, relevance: r.relevance, reason: r.reason };
  }).sort((a, b) => RANK[a.relevance] - RANK[b.relevance] || STRATEGIES.indexOf(a.strategy) - STRATEGIES.indexOf(b.strategy));
}

/** One-line headline for the recommendation set (used by the UI header). */
export function recommendationHeadline(classification: MechanismClassification): string {
  const recs = recommendStrategies(classification);
  const primary = recs.find((r) => r.relevance === 'primary');
  if (!primary || primary.strategy.id === 'further-characterization') return INSUFFICIENT_EVIDENCE;
  return `${primary.strategy.name} — direction-matched to ${classification.mechanism}`;
}

// ─── Schematic transcript model ──────────────────────────────────────────

export const TRANSCRIPT_NOTE =
  'SCHEMATIC transcript model. Coordinates are illustrative and not to scale: introns are compressed to fixed widths, the poison exon is HYPOTHETICAL, and exon ↔ residue boundaries are proportional approximations.';

/** SCN2A has 27 exons; these relative weights distribute 2,005 residues approximately. */
const EXON_WEIGHTS = [
  0.55, 0.8, 1.05, 0.7, 1.15, 0.9, 1.3, 0.85, 1.0, 1.2, 0.75, 1.4, 0.95, 1.1,
  0.8, 1.0, 1.35, 0.7, 1.2, 0.9, 1.05, 1.15, 0.8, 1.3, 0.95, 1.1, 2.3,
];

const UTR5_LEN = 280;
const UORF = { from: 86, len: 66 };
const INTRON_LEN = 54;
/** The intron (0-based index) that carries the hypothetical poison exon. */
const POISON_INTRON = 5;
const POISON_INTRON_LEN = 320;
const POISON_EXON_LEN = 102;
const SPLICE_SITE_LEN = 16;
const UTR3_LEN = 720;

function buildTranscript(): TranscriptRegion[] {
  const out: TranscriptRegion[] = [];
  const wSum = EXON_WEIGHTS.reduce((a, b) => a + b, 0);

  // Proportional residue spans per exon (last exon absorbs the rounding remainder).
  const resLen: number[] = EXON_WEIGHTS.map((w) => Math.max(8, Math.round((SCN2A_LENGTH * w) / wSum)));
  const drift = SCN2A_LENGTH - resLen.reduce((a, b) => a + b, 0);
  resLen[resLen.length - 1] += drift;

  let x = 1;
  out.push({
    id: 'utr5',
    kind: 'utr5',
    label: "5′ UTR (schematic)",
    start: x,
    end: x + UTR5_LEN - 1,
    targetable: true,
    strategies: ['rna-upregulation'],
  });
  out.push({
    id: 'uorf',
    kind: 'uorf',
    label: 'uORF / NMD-linked regulatory element (schematic)',
    start: x + UORF.from,
    end: x + UORF.from + UORF.len - 1,
    targetable: true,
    strategies: ['rna-upregulation'],
  });
  x += UTR5_LEN;

  let aa = 1;
  for (let i = 0; i < resLen.length; i++) {
    const n = String(i + 1).padStart(2, '0');
    const ntLen = resLen[i] * 3;
    out.push({
      id: `ex${n}`,
      kind: 'exon',
      label: `Exon ${i + 1} (approximate)`,
      start: x,
      end: x + ntLen - 1,
      aaStart: aa,
      aaEnd: aa + resLen[i] - 1,
      targetable: true,
      strategies: ['allele-selective-suppression'],
    });
    aa += resLen[i];
    x += ntLen;

    if (i < resLen.length - 1) {
      const isPoison = i === POISON_INTRON;
      const len = isPoison ? POISON_INTRON_LEN : INTRON_LEN;
      out.push({
        id: `int${n}`,
        kind: 'intron',
        label: `Intron ${i + 1} (compressed)`,
        start: x,
        end: x + len - 1,
        targetable: false,
        strategies: [],
      });
      if (isPoison) {
        const peStart = x + Math.round((len - POISON_EXON_LEN) / 2);
        out.push({
          id: 'pe-3ss',
          kind: 'regulatory',
          label: `3′ splice site of PE-${i + 1}a (hypothetical)`,
          start: peStart - SPLICE_SITE_LEN,
          end: peStart - 1,
          targetable: true,
          strategies: ['splice-modulation'],
        });
        out.push({
          id: 'poison-exon',
          kind: 'poison-exon',
          label: `Poison exon PE-${i + 1}a (HYPOTHETICAL)`,
          start: peStart,
          end: peStart + POISON_EXON_LEN - 1,
          targetable: true,
          strategies: ['splice-modulation'],
        });
        out.push({
          id: 'pe-5ss',
          kind: 'regulatory',
          label: `5′ splice site of PE-${i + 1}a (hypothetical)`,
          start: peStart + POISON_EXON_LEN,
          end: peStart + POISON_EXON_LEN + SPLICE_SITE_LEN - 1,
          targetable: true,
          strategies: ['splice-modulation'],
        });
      }
      x += len;
    }
  }

  out.push({
    id: 'utr3',
    kind: 'utr3',
    label: '3′ UTR (schematic)',
    start: x,
    end: x + UTR3_LEN - 1,
    targetable: false,
    strategies: [],
  });
  out.push({
    id: 'utr3-reg',
    kind: 'regulatory',
    label: '3′ UTR stability element (schematic)',
    start: x + 150,
    end: x + 150 + 180 - 1,
    targetable: true,
    strategies: ['rna-upregulation'],
  });

  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

export const TRANSCRIPT: TranscriptRegion[] = buildTranscript();

export const TRANSCRIPT_LENGTH = Math.max(...TRANSCRIPT.map((r) => r.end));

export const EXONS: TranscriptRegion[] = TRANSCRIPT.filter((r) => r.kind === 'exon');

export function transcriptRegion(id: string): TranscriptRegion | undefined {
  return TRANSCRIPT.find((r) => r.id === id);
}

/** The exon whose approximate residue span contains a protein position. */
export function exonForResidue(position: number): TranscriptRegion {
  return (
    EXONS.find((e) => position >= (e.aaStart ?? 0) && position <= (e.aaEnd ?? 0)) ?? EXONS[EXONS.length - 1]
  );
}

/** Schematic transcript coordinate of a protein residue (inside its exon, proportionally). */
export function transcriptPosForResidue(position: number): number {
  const ex = exonForResidue(position);
  const offset = position - (ex.aaStart ?? 1);
  return ex.start + offset * 3;
}

/** Regions in an explicit (most-specific-first) order rather than coordinate order. */
const ordered = (ids: string[]): TranscriptRegion[] =>
  ids.map((id) => transcriptRegion(id)).filter((r): r is TranscriptRegion => !!r);

/** Transcript regions that a strategy may target for this variant. */
export function targetRegionsFor(strategyId: StrategyId, variant: GeneticVariant): TranscriptRegion[] {
  switch (strategyId) {
    case 'rna-upregulation':
      return ordered(['uorf', 'utr5', 'utr3-reg']);
    case 'splice-modulation':
      return ordered(['poison-exon', 'pe-3ss', 'pe-5ss']);
    case 'allele-selective-suppression':
      return [exonForResidue(variant.position)];
    case 'small-molecule-mechanism-matched':
    case 'further-characterization':
    default:
      // No RNA target: the strategy acts on the channel protein, or produces evidence only.
      return [];
  }
}

// ─── Candidate generation ────────────────────────────────────────────────

type Tier = 'strong' | 'moderate' | 'weak' | 'edge';

/** Fixed tier sequence so that every candidate set spans a meaningful quality range. */
const TIER_SEQUENCE: Tier[] = ['strong', 'moderate', 'strong', 'weak', 'moderate', 'edge', 'weak'];

const TIER_SPEC: Record<Tier, { binding: [number, number]; spec: [number, number]; unc: [number, number]; effect: [number, number] }> = {
  strong: { binding: [0.78, 0.94], spec: [0.80, 0.96], unc: [0.10, 0.22], effect: [0.70, 1.00] },
  moderate: { binding: [0.60, 0.80], spec: [0.62, 0.84], unc: [0.18, 0.34], effect: [0.45, 0.78] },
  weak: { binding: [0.40, 0.62], spec: [0.38, 0.64], unc: [0.26, 0.42], effect: [0.22, 0.52] },
  edge: { binding: [0.52, 0.76], spec: [0.46, 0.70], unc: [0.42, 0.62], effect: [0.30, 0.80] },
};

/**
 * Fractional change in the strategy's target parameter that would bring the variant's modelled
 * measurement to the reference value — the gap any candidate is trying to close. Candidate
 * predicted effects are expressed as illustrative fractions of this gap.
 */
export function parameterGap(variant: GeneticVariant, strategy: TherapeuticStrategy): number {
  if (strategy.actsOn === 'none') return 0;
  const key = strategy.actsOn === 'persistentFrac' ? 'persistentPct' : 'peakDensity';
  const ref = approximateFit(REFERENCE_PARAMS)[key];
  const obs = approximateFit(variant.params)[key];
  if (obs === 0) return 0;
  return clamp(ref / obs - 1, -0.95, 4);
}

const span = (rand: () => number, [lo, hi]: [number, number]) => lo + rand() * (hi - lo);
const round2 = (x: number) => Math.round(x * 100) / 100;

function idFor(strategy: TherapeuticStrategy, rand: () => number): string {
  const prefix = strategy.modality === 'small molecule' ? 'PRI-SM' : 'PRI-ASO';
  const n = 100 + Math.floor(rand() * 9800);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

function platformFor(tier: Tier, rand: () => number): Candidate['platformCompatibility'] {
  const u = rand();
  if (tier === 'edge') return u < 0.55 ? 'novel' : 'modified-chemistry';
  if (tier === 'weak') return u < 0.22 ? 'novel' : u < 0.58 ? 'modified-chemistry' : 'shared-chemistry';
  return u < 0.82 ? 'shared-chemistry' : u < 0.95 ? 'modified-chemistry' : 'novel';
}

function requirementsFor(
  strategy: TherapeuticStrategy,
  platform: Candidate['platformCompatibility'],
  specificity: number,
  uncertainty: number,
  overlapsVariant: boolean,
): string[] {
  const out: string[] = [];
  if (strategy.modality === 'ASO') {
    out.push(
      platform === 'shared-chemistry'
        ? 'Synthesis on existing platform chemistry; release methods qualified per sequence.'
        : platform === 'modified-chemistry'
          ? 'Backbone / sugar modification outside the current platform set — process and analytical bridging required.'
          : 'Novel chemistry: no platform reuse; full process development, analytics and class-safety work required.',
    );
  } else {
    out.push('Pharmacology, brain exposure and selectivity against other voltage-gated sodium channels unresolved.');
  }
  if (specificity < 0.7) out.push('Transcriptome-wide specificity assessment required (illustrative score below internal screening bar).');
  if (uncertainty > 0.38) out.push('Model uncertainty high — additional in-vitro measurement required before any nomination.');
  if (overlapsVariant) out.push('Binding window overlaps the variant site: allele discrimination must be demonstrated, not assumed.');
  if (strategy.id === 'splice-modulation') out.push('Requires experimental confirmation that the non-productive isoform is used in the relevant cell type.');
  if (strategy.id === 'rna-upregulation') out.push('Requires a dose–exposure relationship that keeps expression below the reference level.');
  if (strategy.id === 'allele-selective-suppression') out.push('Requires allele-discrimination data; not addressed by the present assay.');
  out.push('Patient-specific nonclinical safety package required regardless of platform reuse.');
  return out;
}

/** Deterministic fictional candidate records for (patient, variant, strategy, target region). */
export function generateCandidates(
  patientId: string,
  variant: GeneticVariant,
  strategyId: StrategyId,
  targetRegionId: string,
): Candidate[] {
  const strategy = getStrategy(strategyId);
  if (strategy.actsOn === 'none') return [];
  const region = transcriptRegion(targetRegionId);
  const proteinLevel = !region || targetRegionId === PROTEIN_LEVEL_TARGET;
  if (!proteinLevel && region && !region.strategies.includes(strategyId)) return [];
  if (proteinLevel && strategy.modality !== 'small molecule') return [];

  const rand = rngFor('candidates', patientId, variant.id, strategyId, targetRegionId);
  const count = 5 + Math.floor(rand() * 3); // 5–7
  const sign = strategy.intendedEffect === 'decrease-function' ? -1 : 1;
  const gap = parameterGap(variant, strategy);
  const gapMagnitude = Math.max(0.05, Math.abs(gap));
  const variantNt = transcriptPosForResidue(variant.position);

  const regionLen = region ? region.end - region.start + 1 : 0;
  const windowLen = region ? Math.min(20, Math.max(10, regionLen)) : 0;
  const used = new Set<string>();
  const out: Candidate[] = [];

  for (let i = 0; i < count; i++) {
    const tier = TIER_SEQUENCE[i % TIER_SEQUENCE.length];
    const spec = TIER_SPEC[tier];

    let id = idFor(strategy, rand);
    while (used.has(id)) id = idFor(strategy, rand);
    used.add(id);

    const bindingScore = round2(clamp(span(rand, spec.binding), 0.05, 0.99));
    const specificityScore = round2(clamp(span(rand, spec.spec), 0.05, 0.99));
    const uncertainty = round2(clamp(span(rand, spec.unc) + (strategy.modality === 'small molecule' ? 0.04 : 0), 0.05, 0.85));

    let bindStart = 0;
    let bindEnd = 0;
    if (region && regionLen > 0) {
      const slots = Math.max(1, count);
      const usable = Math.max(1, regionLen - windowLen);
      const jitter = Math.floor(rand() * Math.max(1, Math.floor(usable / (slots * 2) + 1)));
      const offset = Math.min(usable, Math.floor((usable * i) / slots) + jitter);
      bindStart = region.start + offset;
      bindEnd = bindStart + windowLen - 1;
    }
    const overlapsVariant = bindEnd > 0 && variantNt >= bindStart - 2 && variantNt <= bindEnd + 2;

    // Predicted fractional change in the targeted parameter, expressed as an illustrative
    // fraction of the reference–variant parameter gap, with an interval widened by uncertainty.
    const mag = clamp(gapMagnitude * span(rand, spec.effect) * (0.78 + 0.5 * bindingScore), 0.01, 4);
    const half = mag * (0.35 + 1.25 * uncertainty);
    const predictedEffect: UncertaintyRange = {
      low: round2(sign > 0 ? Math.max(0, mag - half) : clamp(-(mag + half), -0.95, 0)),
      mid: round2(sign * Math.min(mag, sign > 0 ? 4 : 0.95)),
      high: round2(sign > 0 ? mag + half : clamp(-Math.max(0, mag - half), -0.95, 0)),
      basis: `illustrative fraction of the reference–variant ${strategy.actsOn} gap (${(gap >= 0 ? '+' : '−') + Math.abs(gap * 100).toFixed(0)}% required); not a confidence interval on data`,
    };

    const platform = platformFor(tier, rand);

    out.push({
      id,
      strategyId,
      targetRegionId,
      bindStart,
      bindEnd,
      bindingScore,
      specificityScore,
      uncertainty,
      platformCompatibility: platform,
      predictedEffect,
      developmentRequirements: requirementsFor(strategy, platform, specificityScore, uncertainty, overlapsVariant),
      category: 'illustrative',
    });
  }

  // Keep a stable, reviewable order: best illustrative binding first.
  return out.sort((a, b) => b.bindingScore - a.bindingScore || a.id.localeCompare(b.id));
}

/** Does a candidate's schematic window overlap the variant position? (UI / reason picker helper) */
export function overlapsVariantSite(candidate: Candidate, variant: GeneticVariant): boolean {
  if (candidate.bindEnd <= 0) return false;
  const nt = transcriptPosForResidue(variant.position);
  return nt >= candidate.bindStart - 2 && nt <= candidate.bindEnd + 2;
}

// ─── Schematic secondary structure ───────────────────────────────────────

export interface StemLoop {
  /** transcript coordinates of the stem start, loop and stem end */
  stemAStart: number;
  stemAEnd: number;
  loopStart: number;
  loopEnd: number;
  stemBStart: number;
  stemBEnd: number;
  /** illustrative accessibility, 0 (paired / occluded) – 1 (accessible) */
  accessibility: number;
}

/**
 * Deterministic SCHEMATIC secondary-structure annotation for a transcript region: a set of
 * stem–loop elements with illustrative accessibility. No folding algorithm is run and no
 * sequence exists — this is a drawing aid, not a structure prediction.
 */
export function schematicStructure(regionId: string): StemLoop[] {
  const region = transcriptRegion(regionId);
  if (!region) return [];
  const len = region.end - region.start + 1;
  const rand = rngFor('structure', regionId, len);
  const n = clamp(Math.round(len / 34), 1, 5);
  const out: StemLoop[] = [];
  let cursor = region.start + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const remaining = region.end - cursor + 1;
    const budget = Math.floor(remaining / (n - i));
    if (budget < 9) break;
    const stem = clamp(Math.round(budget * (0.18 + rand() * 0.12)), 3, 14);
    const loop = clamp(Math.round(budget * (0.2 + rand() * 0.18)), 3, 16);
    const total = stem * 2 + loop;
    if (total > remaining) break;
    const aStart = cursor;
    const loopStart = aStart + stem;
    const bStart = loopStart + loop;
    out.push({
      stemAStart: aStart,
      stemAEnd: loopStart - 1,
      loopStart,
      loopEnd: bStart - 1,
      stemBStart: bStart,
      stemBEnd: bStart + stem - 1,
      accessibility: round2(clamp(0.5 + 0.28 * gaussian(rand), 0.05, 0.95)),
    });
    cursor = bStart + stem + Math.floor(rand() * Math.max(1, Math.floor(budget * 0.2)));
    if (cursor > region.end) break;
  }
  return out;
}

/** Illustrative accessibility at a transcript coordinate given the schematic structure. */
export function accessibilityAt(regionId: string, pos: number, structure = schematicStructure(regionId)): number {
  for (const s of structure) {
    if (pos >= s.loopStart && pos <= s.loopEnd) return clamp(s.accessibility + 0.25, 0, 1);
    if ((pos >= s.stemAStart && pos <= s.stemAEnd) || (pos >= s.stemBStart && pos <= s.stemBEnd)) {
      return clamp(s.accessibility - 0.3, 0.02, 1);
    }
  }
  return 0.6;
}

export const MECHANISM_STRATEGY_NOTE: Record<MechanismClass, string> = {
  LoF: 'Loss of function → interventions that increase productive transcript.',
  GoF: 'Gain of function → interventions that reduce variant-allele output or channel activity.',
  mixed: 'Mixed → no direction-matched design; further characterization first.',
  indeterminate: INSUFFICIENT_EVIDENCE,
};
