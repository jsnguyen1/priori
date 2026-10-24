// Plain-English labels used in Simple view.
import type { MechanismClass } from '../../domain/types';

export function plainMech(m: MechanismClass, short = false): string {
  const full: Record<MechanismClass, string> = {
    GoF: 'Too active (gain of function)',
    LoF: 'Too weak (loss of function)',
    mixed: 'Mixed effects',
    indeterminate: 'Unknown',
  };
  const brief: Record<MechanismClass, string> = { GoF: 'too active', LoF: 'too weak', mixed: 'mixed', indeterminate: 'unknown' };
  return short ? brief[m] : full[m];
}
