// Shared helpers for ACT III modules (reuse + development).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTour } from '../../tour/tourStore';
import { STEPS } from '../../tour/steps';
import type { ConditionCheck, EvidenceArtifact, EvidenceNodeId, NodeReuseAssessment, ReuseClass, SourceType, ValidationStatus } from '../../domain/types';

export const REUSE_ORDER: ReuseClass[] = ['reusable', 'reuse-with-validation', 'new-work', 'not-transferable'];

export const SOURCE_LABEL: Record<SourceType, string> = {
  'published-literature': 'Published literature',
  'atlas-synthetic': 'Atlas (synthetic)',
  'simulated-experiment': 'Simulated experiment',
  'platform-process': 'Platform process',
  'patient-specific': 'Patient-specific',
};

export const VALIDATION_LABEL: Record<ValidationStatus, string> = {
  published: 'Published',
  'simulated-unvalidated': 'Simulated · unvalidated',
  'internally-validated-simulated': 'Internally validated (simulation)',
  'not-validated': 'Not validated',
};

export const isFromPatient = (a: EvidenceArtifact, pid: string) => a.provenance.originatingPatientId === pid;

/** Measures an element's content width (for crisp SVG layouts). */
export function useWidth<T extends HTMLElement>(fallback = 760) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    setW(Math.max(320, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function useReducedMotion() {
  const [r] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return r;
}

// ─── Tour: keep the current spotlight target in the scrolled view ────────
// The overlay only measures `[data-tour]` elements; targets below the fold in a
// scroll container would never be spotlit. When the tour points at one of the
// given ids, scroll it into view (retrying while it mounts / animates in).
export function useTourScrollIntoView(prefix: string) {
  const target = useTour((t) => (t.active ? STEPS[t.index]?.target ?? null : null));
  useEffect(() => {
    if (!target || !target.startsWith(prefix)) return;
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (el && el.getBoundingClientRect().height > 0) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (tries < 3) { tries += 1; timer = window.setTimeout(attempt, 450); } // re-settle after enter animations
        return;
      }
      if (tries++ < 20) timer = window.setTimeout(attempt, 100);
    };
    timer = window.setTimeout(attempt, 60);
    return () => window.clearTimeout(timer);
  }, [target, prefix]);
}

// ─── Simple-view plain language ──────────────────────────────────────────

export const PLAIN_NODE: Record<EvidenceNodeId, string> = {
  'assay-protocol': 'Lab test setup',
  'reference-cell-system': 'Reference cells',
  'variant-characterization': 'Test this child’s mutation',
  'mechanism-evidence': 'Mechanism evidence',
  'therapeutic-design-strategy': 'Drug design approach',
  'candidate-screening': 'Drug test results',
  'chemistry-process': 'Drug chemistry',
  'quality-control': 'Quality checks',
  'safety-testing': 'Safety studies',
  'clinical-evidence': 'Clinical evidence',
  'regulatory-documentation': 'Regulatory paperwork',
};

export const PLAIN_CLASS: Record<ReuseClass, { label: string; short: string }> = {
  reusable: { label: 'Reuse as-is', short: 'REUSE' },
  'reuse-with-validation': { label: 'Reuse after a check', short: 'CHECK' },
  'new-work': { label: 'Do new', short: 'NEW' },
  'not-transferable': { label: 'Can’t transfer', short: 'NO' },
};

const PLAIN_DIFF: Partial<Record<ConditionCheck['condition']['kind'], string>> = {
  'same-gene': 'a different gene',
  'same-mechanism': 'the type of problem doesn’t match (or isn’t known yet)',
  'same-variant': 'it was measured on a different mutation',
  'same-domain': 'the mutation sits in a different part of the protein',
  'same-region-kind': 'the mutation sits in a different kind of region',
  'same-protocol-version': 'a different version of the lab test was used',
  'same-cell-system': 'different cells were used',
  'same-modality': 'no matching drug type has been chosen yet',
  'same-target-region': 'the drug would target a different spot',
};

/** One plain sentence explaining a node's classification, derived from its condition checks. */
export function plainWhy(n: NodeReuseAssessment): string {
  const diffs = Array.from(new Set(n.checks.filter((c) => !c.satisfied && c.condition.kind !== 'never-transfers').map((c) => PLAIN_DIFF[c.condition.kind]).filter((x): x is string => !!x)));
  const because = diffs.length ? ` because ${diffs.slice(0, 2).join(' and ')}` : '';
  switch (n.reuseClass) {
    case 'reusable':
      return 'Saved from the first child’s program and it fully applies here, no need to redo it.';
    case 'reuse-with-validation':
      if (diffs.length) return `Mostly applies, but needs a check first${because}.`;
      if (n.nodeId === 'safety-testing') return 'What we learned about this drug type helps, but every new drug sequence gets its own safety studies.';
      if (n.nodeId === 'regulatory-documentation') return 'Shared sections can be adapted; the parts about this child must be written new.';
      return 'Everything matches, but the saved result is simulated and not yet validated, so it gets a check first.';
    case 'new-work':
      if (n.checks.length === 0) return 'Nothing saved applies here, so this part is done fresh for this child.';
      return `Saved work doesn’t fit${because}, so this part is done fresh.`;
    case 'not-transferable':
      if (n.nodeId === 'candidate-screening') return 'A drug that worked on the first child’s mutation must be re-tested on this child’s mutation.';
      return 'Whether a treatment worked in one person never carries over to another person.';
  }
}
