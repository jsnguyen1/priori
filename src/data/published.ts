// Published biology for SCN2A / NaV1.2. Category: 'published'.
// Topology is derived directly from UniProtKB Q99250 feature annotations (retrieved 2026-10-24).
import uniprot from './published/scn2a_uniprot.json';
import type { DomainId, ProteinRegion, ProteinRegionKind } from '../domain/types';

export const SCN2A_LENGTH: number = uniprot.length; // 2005
export const SCN2A_SEQUENCE: string = uniprot.sequence;
export const UNIPROT_SOURCE = `${uniprot.source} (${uniprot.accession}, retrieved ${uniprot.retrieved})`;

export interface Citation {
  id: string;
  short: string;
  full: string;
}

export const CITATIONS: Record<string, Citation> = {
  uniprot: { id: 'uniprot', short: 'UniProt Q99250', full: 'UniProtKB Q99250 (SCN2A_HUMAN), sodium channel protein type 2 subunit alpha. Topology and sequence annotations.' },
  pan2019: { id: 'pan2019', short: 'Pan et al. 2019', full: 'Pan X, Li Z, Huang X, et al. Molecular basis for pore blockade of human Na+ channel Nav1.2 by the μ-conotoxin KIIIA. Science 363:1309–1313 (2019). PDB 6J8E.' },
  sanders2018: { id: 'sanders2018', short: 'Sanders et al. 2018', full: 'Sanders SJ, Campbell AJ, Cottrell JR, et al. Progress in understanding and treating SCN2A-mediated disorders. Trends Neurosci 41:442–456 (2018).' },
  wolff2017: { id: 'wolff2017', short: 'Wolff et al. 2017', full: 'Wolff M, Johannesen KM, Hedrich UBS, et al. Genetic and phenotypic heterogeneity suggest therapeutic implications in SCN2A-related disorders. Brain 140:1316–1336 (2017).' },
  benshalom2017: { id: 'benshalom2017', short: 'Ben-Shalom et al. 2017', full: 'Ben-Shalom R, Keeshen CM, Berrios KN, et al. Opposing effects on NaV1.2 function underlie differences between SCN2A variants observed in individuals with autism spectrum disorder or infantile seizures. Biol Psychiatry 82:224–232 (2017).' },
  west1992: { id: 'west1992', short: 'West et al. 1992', full: 'West JW, Patton DE, Scheuer T, et al. A cluster of hydrophobic amino acid residues required for fast Na+-channel inactivation. PNAS 89:10910–10914 (1992).' },
};

export interface PublishedFact {
  id: string;
  statement: string;
  citationIds: string[];
}

export const PUBLISHED_FACTS: PublishedFact[] = [
  { id: 'f-gene', statement: 'SCN2A encodes NaV1.2, the pore-forming α subunit of a voltage-gated sodium channel; the canonical isoform is 2,005 residues.', citationIds: ['uniprot'] },
  { id: 'f-topo', statement: 'NaV1.2 comprises four homologous repeats (DI–DIV), each with six transmembrane segments (S1–S6). S1–S4 form the voltage-sensing module; S5–S6 and the re-entrant pore loops form the pore.', citationIds: ['uniprot', 'pan2019'] },
  { id: 'f-ifm', statement: 'A hydrophobic IFM motif in the DIII–DIV linker is required for fast inactivation.', citationIds: ['west1992'] },
  { id: 'f-spectrum', statement: 'SCN2A variants with gain-of-function effects are associated with early-infantile seizures; loss-of-function variants are associated with autism spectrum disorder, intellectual disability and later-onset seizures.', citationIds: ['sanders2018', 'benshalom2017'] },
  { id: 'f-scb', statement: 'Sodium-channel blockers were reported as more often beneficial in individuals with seizure onset before 3 months of age, and less often beneficial with later onset.', citationIds: ['wolff2017'] },
  { id: 'f-structure', statement: 'A cryo-EM structure of human NaV1.2 in complex with β2 and μ-conotoxin KIIIA was determined at ~3.0 Å resolution.', citationIds: ['pan2019'] },
];

// ─── Topology ────────────────────────────────────────────────────────────

const REPEAT_DOMAINS: DomainId[] = ['DI', 'DII', 'DIII', 'DIV'];
const ROMAN: Record<string, DomainId> = { I: 'DI', II: 'DII', III: 'DIII', IV: 'DIV' };

interface RawFeature { type: string; start: number; end: number; description: string }

function buildRegions(): ProteinRegion[] {
  const feats = (uniprot.features as RawFeature[])
    .filter((f) => f.type === 'Topological domain' || f.type === 'Transmembrane' || f.type === 'Intramembrane')
    .sort((a, b) => a.start - b.start);

  const regions: ProteinRegion[] = [];
  let prevSeg: { domain: DomainId; seg: string } | null = null;

  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    if (f.type === 'Transmembrane') {
      const m = /Name=(S\d) of repeat (IV|I{1,3})/.exec(f.description);
      if (!m) continue;
      const domain: DomainId = ROMAN[m[2]];
      const seg = m[1] as ProteinRegionKind;
      regions.push({ id: `${domain}-${seg}`, label: `${domain} ${seg}`, kind: seg, domain, start: f.start, end: f.end, topology: 'transmembrane' });
      prevSeg = { domain, seg };
      continue;
    }
    if (f.type === 'Intramembrane') {
      const domain: DomainId = prevSeg?.domain ?? 'DI';
      regions.push({ id: `${domain}-P`, label: `${domain} pore loop`, kind: 'pore-loop', domain, start: f.start, end: f.end, topology: 'intramembrane' });
      prevSeg = { domain, seg: 'P' };
      continue;
    }
    // Topological domain
    const topo = f.description === 'Extracellular' ? 'extracellular' : 'cytoplasmic';
    if (!prevSeg) {
      regions.push({ id: 'N-term', label: 'N-terminus', kind: 'N-term', domain: 'termini', start: f.start, end: f.end, topology: 'cytoplasmic' });
      continue;
    }
    const isLast = i === feats.length - 1;
    if (isLast) {
      regions.push({ id: 'C-term', label: 'C-terminus', kind: 'C-term', domain: 'termini', start: f.start, end: f.end, topology: 'cytoplasmic' });
      continue;
    }
    if (prevSeg.seg === 'S6') {
      const di = REPEAT_DOMAINS.indexOf(prevSeg.domain);
      const a = REPEAT_DOMAINS[di].slice(1);
      const b = REPEAT_DOMAINS[di + 1].slice(1);
      const id = `${a}-${b}-linker`;
      if (prevSeg.domain === 'DIII') {
        // Split the DIII–DIV linker around the IFM inactivation motif (residues 1488–1490).
        regions.push({ id: `${id}-N`, label: `D${a}–D${b} linker`, kind: 'domain-linker', domain: 'linker', start: f.start, end: 1485, topology: 'cytoplasmic' });
        regions.push({ id: 'IFM', label: 'IFM inactivation particle', kind: 'inactivation-gate', domain: 'linker', start: 1486, end: 1492, topology: 'cytoplasmic' });
        regions.push({ id: `${id}-C`, label: `D${a}–D${b} linker`, kind: 'domain-linker', domain: 'linker', start: 1493, end: f.end, topology: 'cytoplasmic' });
      } else {
        regions.push({ id, label: `D${a}–D${b} linker`, kind: 'domain-linker', domain: 'linker', start: f.start, end: f.end, topology: 'cytoplasmic' });
      }
      continue;
    }
    const next = feats[i + 1];
    const nm = /Name=(S\d)/.exec(next.description);
    const nextSeg = next.type === 'Intramembrane' ? 'P' : nm ? nm[1] : '?';
    const kind: ProteinRegionKind = topo === 'extracellular' ? 'extracellular-loop' : 'intracellular-loop';
    regions.push({
      id: `${prevSeg.domain}-${prevSeg.seg}${nextSeg}`,
      label: `${prevSeg.domain} ${prevSeg.seg}–${nextSeg} loop`,
      kind,
      domain: prevSeg.domain,
      start: f.start,
      end: f.end,
      topology: topo,
    });
  }
  return regions;
}

export const REGIONS: ProteinRegion[] = buildRegions();

const regionByResidue: ProteinRegion[] = (() => {
  const arr: ProteinRegion[] = new Array(SCN2A_LENGTH + 1);
  for (const r of REGIONS) for (let p = r.start; p <= r.end; p++) arr[p] = r;
  return arr;
})();

export function regionAt(position: number): ProteinRegion {
  return regionByResidue[Math.max(1, Math.min(SCN2A_LENGTH, position))];
}

export function regionById(id: string): ProteinRegion | undefined {
  return REGIONS.find((r) => r.id === id);
}

/** Span of each repeat domain (first S1 → last S6) for coarse maps. */
export const DOMAIN_SPANS: { domain: DomainId; label: string; start: number; end: number }[] = REPEAT_DOMAINS.map((d) => {
  const rs = REGIONS.filter((r) => r.domain === d);
  return { domain: d, label: d, start: Math.min(...rs.map((r) => r.start)), end: Math.max(...rs.map((r) => r.end)) };
});

export const THREE_LETTER: Record<string, string> = {
  A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile',
  L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val',
};
