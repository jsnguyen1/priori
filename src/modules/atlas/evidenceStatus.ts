// Whether a variant's mechanism may be shown. Atlas records always carry their (synthetic)
// classification; a patient variant's mechanism is only "known" once it has been characterized
// in the lab, or (PX-001) once the opening scene has revealed the simulated result.
import type { GeneticVariant } from '../../domain/types';
import type { AnalysisStatus } from '../../state/store';
import { PRIMARY_PATIENT_ID } from '../../state/store';

export type CharacterizationStatus = 'atlas-record' | 'characterized' | 'running' | 'pending';

export function characterizationStatus(
  v: GeneticVariant,
  analyses: Record<string, { status: AnalysisStatus }>,
  mechanismRevealed: boolean,
): CharacterizationStatus {
  if (v.patientIds.length === 0) return 'atlas-record';
  const st = analyses[v.id]?.status;
  if (st === 'complete') return 'characterized';
  if (v.patientIds.includes(PRIMARY_PATIENT_ID) && mechanismRevealed) return 'characterized';
  if (st === 'running') return 'running';
  return 'pending';
}

export const mechanismKnown = (s: CharacterizationStatus) => s === 'atlas-record' || s === 'characterized';
