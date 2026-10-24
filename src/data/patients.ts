// Hypothetical patient cases. None of these individuals exist. Category: 'hypothetical'.
import type { Patient } from '../domain/types';
import { PATIENT_VARIANTS } from './variants';

const variantFor = (pid: string) => {
  const v = PATIENT_VARIANTS.find((x) => x.patientIds.includes(pid));
  if (!v) throw new Error(`no variant for ${pid}`);
  return v.id;
};

export const PATIENTS: Patient[] = [
  {
    id: 'PX-001',
    label: 'Hypothetical neonate 001',
    ageAtPresentation: '12 HOURS',
    presentation: 'NEONATAL SEIZURES',
    variantId: variantFor('PX-001'),
    inheritance: 'de novo (hypothetical)',
    scenario: 'A newborn is experiencing seizures. A variant has been detected in SCN2A. Its functional consequences have not yet been established.',
    role: 'primary',
    category: 'hypothetical',
  },
  {
    id: 'PX-002',
    label: 'Hypothetical infant 002',
    ageAtPresentation: '7 MONTHS',
    presentation: 'INFANTILE-ONSET SEIZURES · DEVELOPMENTAL DELAY',
    variantId: variantFor('PX-002'),
    inheritance: 'de novo (hypothetical)',
    scenario: 'A second child is referred with a different SCN2A variant located in the DIII pore region.',
    role: 'second',
    category: 'hypothetical',
  },
  {
    id: 'PX-003',
    label: 'Hypothetical neonate 003',
    ageAtPresentation: '3 DAYS',
    presentation: 'NEONATAL SEIZURES',
    variantId: variantFor('PX-003'),
    inheritance: 'de novo (hypothetical)',
    scenario: 'Neonatal seizures with an SCN2A variant in the DI voltage sensor.',
    role: 'browser',
    category: 'hypothetical',
  },
  {
    id: 'PX-004',
    label: 'Hypothetical child 004',
    ageAtPresentation: '2 YEARS',
    presentation: 'EPISODIC ATAXIA · LATE-ONSET SEIZURES',
    variantId: variantFor('PX-004'),
    inheritance: 'unknown',
    scenario: 'Variant adjacent to the IFM inactivation motif with conflicting functional signals.',
    role: 'browser',
    category: 'hypothetical',
  },
];

export const getPatient = (id: string): Patient => {
  const p = PATIENTS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown patient ${id}`);
  return p;
};
