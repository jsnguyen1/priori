// Shared helpers for ACT III modules (reuse + development).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTour } from '../../tour/tourStore';
import { STEPS } from '../../tour/steps';
import type { EvidenceArtifact, ReuseClass, SourceType, ValidationStatus } from '../../domain/types';

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
