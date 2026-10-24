// Lab-local transient UI state (hover / linkage) and the measurement ↔ structure linkage map.
import { create } from 'zustand';
import type { MeasurementKey, ProteinRegion } from '../../domain/types';
import { REGIONS, regionById } from '../../data/published';
import { GLOSSARY } from '../../ui/glossary';
import { getClassification } from '../../data/variants';
import { useStore } from '../../state/store';
import { C, MECH_COLOR } from '../../ui/tokens';

export type InspectorTab = 'ephys' | 'mechanism';

interface LabUi {
  hoverRegionId: string | null;
  /** measurement whose structural correlate is highlighted in 3D */
  linkKey: MeasurementKey | null;
  tab: InspectorTab;
  set: (p: Partial<Omit<LabUi, 'set'>>) => void;
}

export const useLabUi = create<LabUi>()((set) => ({
  hoverRegionId: null,
  linkKey: null,
  tab: 'ephys',
  set: (p) => set(p),
}));

const ids = (...xs: string[]) => xs.filter((x) => !!regionById(x));
const REP = ['DI', 'DII', 'DIII', 'DIV'];

/** Structural correlate of each measurement (textbook structure–function mapping, illustrative). */
export const MEASUREMENT_LINK: Record<MeasurementKey, { regionIds: string[]; label: string }> = {
  peakDensity: { regionIds: ids(...REP.map((d) => `${d}-P`), ...REP.map((d) => `${d}-S6`)), label: 'Pore module · P-loops (selectivity filter) + S6' },
  vHalfAct: { regionIds: ids(...REP.map((d) => `${d}-S4`), ...REP.map((d) => `${d}-S4S5`)), label: 'S4 voltage sensors + S4–S5 linkers · activation' },
  vHalfInact: { regionIds: ids('IFM', 'III-IV-linker-N', 'III-IV-linker-C', 'DIV-S4'), label: 'IFM particle · DIII–DIV linker · DIV S4 · inactivation' },
  persistentPct: { regionIds: ids('IFM', 'III-IV-linker-N', 'III-IV-linker-C'), label: 'IFM particle · DIII–DIV linker · fast inactivation' },
  tauRecovery: { regionIds: ids('IFM', 'DIV-S4', 'III-IV-linker-C'), label: 'IFM particle · DIV S4 · recovery from inactivation' },
};

/** Concise functional annotation for a region (general structure–function knowledge). */
export function regionNote(r: ProteinRegion): string {
  switch (r.kind) {
    case 'S4': return GLOSSARY.s4.definition;
    case 'pore-loop': return GLOSSARY.poreLoop.definition + ' The four P-loops (DEKA ring) set Na⁺ selectivity.';
    case 'inactivation-gate': return GLOSSARY.ifm.definition + ' Binds a receptor formed by S4–S5 linkers / S6 of DIII–DIV to occlude the pore.';
    case 'S1': case 'S2': case 'S3': return `Voltage-sensing module scaffold (S1–S4) of ${r.domain}; S1–S3 form the pathway along which S4 gating charges move.`;
    case 'S5': return `Outer pore-module helix of ${r.domain}; packs against the S4–S5 linker and the pore loop.`;
    case 'S6': return `Inner pore helix of ${r.domain}; lines the central cavity. The S6 bundle crossing forms the intracellular activation gate.`;
    case 'intracellular-loop':
      return r.id.endsWith('S4S5') ? 'S4–S5 linker: couples voltage-sensor movement to opening of the S6 activation gate.' : 'Intracellular loop between transmembrane segments.';
    case 'extracellular-loop':
      return r.id.endsWith('S5P') || r.id.endsWith('PS6') ? 'Extracellular turret flanking the pore loop; forms the outer vestibule (site of μ-conotoxin KIIIA binding in 6J8E).' : 'Extracellular loop between transmembrane segments.';
    case 'domain-linker':
      return r.id.startsWith('III-IV') ? 'DIII–DIV linker carrying the IFM fast-inactivation particle.' : 'Large cytoplasmic inter-domain linker; largely unresolved in 6J8E.';
    case 'N-term': return 'Cytoplasmic N-terminus; largely unresolved in 6J8E.';
    case 'C-term': return 'Cytoplasmic C-terminal domain (CTD, calmodulin-binding IQ motif); partly resolved in 6J8E.';
  }
}

export const KIND_LABEL: Partial<Record<ProteinRegion['kind'], string>> = {
  S4: 'voltage sensor',
  'pore-loop': 'selectivity filter',
  'inactivation-gate': 'inactivation particle',
  S6: 'activation gate',
};

/** Regions listed in the annotation browser (structured order). */
export const ANNOTATION_GROUPS: { title: string; regions: ProteinRegion[] }[] = [
  ...REP.map((d) => ({ title: d, regions: REGIONS.filter((r) => r.domain === d && (r.topology !== 'cytoplasmic' || r.id.endsWith('S4S5')) && r.kind !== 'extracellular-loop') })),
  { title: 'Linkers & termini', regions: REGIONS.filter((r) => r.domain === 'linker' || r.domain === 'termini') },
];

/** Analysis status + mechanism colour for the selected variant. */
export function useVariantStatus(variantId: string) {
  const status = useStore((s) => s.analyses[variantId]?.status ?? 'idle');
  const classified = status === 'complete';
  const classification = classified ? getClassification(variantId) : null;
  const color = classification ? MECH_COLOR[classification.mechanism] : C.ink;
  return { status, classified, classification, color };
}
