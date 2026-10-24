// Plain-English vocabulary for the atlas in Simple view.
import type { MechanismClass, ProteinRegion } from '../../domain/types';

export const PLAIN_MECH: Record<MechanismClass, string> = {
  GoF: 'Too active',
  LoF: 'Too weak',
  mixed: 'Mixed',
  indeterminate: 'Unknown',
};

export const PLAIN_MECH_SUB: Record<MechanismClass, string> = {
  GoF: 'gain of function',
  LoF: 'loss of function',
  mixed: 'some of each',
  indeterminate: 'no clear answer',
};

/** Where on the channel a region sits, in words a non-specialist can picture. */
export function plainWhere(r: ProteinRegion | undefined): { short: string; detail: string } {
  if (!r) return { short: 'Somewhere on the channel', detail: '' };
  switch (r.kind) {
    case 'pore-loop':
      return { short: 'In the pore', detail: 'the channel’s central opening' };
    case 'S5':
    case 'S6':
      return { short: 'In the pore wall', detail: 'lining the channel’s opening' };
    case 'S4':
      return { short: 'In the voltage sensor', detail: 'the part that feels the electrical signal' };
    case 'S1':
    case 'S2':
    case 'S3':
      return { short: 'In the sensor arm', detail: 'supports the voltage sensor' };
    case 'inactivation-gate':
      return { short: 'In the shut-off lid', detail: 'the plug that closes the channel' };
    case 'domain-linker':
      return { short: 'In a connecting loop', detail: 'joins two halves of the channel' };
    case 'N-term':
    case 'C-term':
      return { short: 'In a loose tail', detail: 'hangs off the end of the protein' };
    default:
      return { short: r.topology === 'extracellular' ? 'In an outer loop' : 'In an inner loop', detail: r.topology === 'extracellular' ? 'outside the cell' : 'inside the cell' };
  }
}

const AA3: Record<string, string> = {
  Ala: 'alanine', Arg: 'arginine', Asn: 'asparagine', Asp: 'aspartate', Cys: 'cysteine', Gln: 'glutamine', Glu: 'glutamate', Gly: 'glycine', His: 'histidine', Ile: 'isoleucine',
  Leu: 'leucine', Lys: 'lysine', Met: 'methionine', Phe: 'phenylalanine', Pro: 'proline', Ser: 'serine', Thr: 'threonine', Trp: 'tryptophan', Tyr: 'tyrosine', Val: 'valine',
};

/** "p.(Ala1714Pro)" → "alanine → proline". Falls back to the raw notation. */
export function plainSwap(hgvsP: string): string {
  const m = /([A-Z][a-z]{2})\d+([A-Z][a-z]{2})/.exec(hgvsP);
  if (!m) return hgvsP;
  return `${AA3[m[1]] ?? m[1]} → ${AA3[m[2]] ?? m[2]}`;
}
