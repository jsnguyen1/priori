// Concise definitions for hover tooltips. Add entries as needed; keep each under ~40 words.
export const GLOSSARY = {
  gof: { term: 'Gain of function', definition: 'A variant that increases channel activity, e.g. by shifting activation to more negative voltages, impairing inactivation or increasing persistent current.' },
  lof: { term: 'Loss of function', definition: 'A variant that reduces channel activity, e.g. by lowering surface expression or conductance, or shifting gating so fewer channels open.' },
  mixed: { term: 'Mixed mechanism', definition: 'A variant with opposing biophysical effects (some increasing, some decreasing function). Net neuronal effect cannot be inferred from channel parameters alone.' },
  indeterminate: { term: 'Indeterminate', definition: 'Available measurements do not support a directional call: effects are absent, near decision boundaries, or measurement uncertainty is too large.' },
  peakDensity: { term: 'Peak current density', definition: 'Maximum inward sodium current normalised to cell capacitance (pA/pF). Reflects channel number at the surface and unitary conductance.' },
  vHalfAct: { term: 'V½ activation', definition: 'Membrane voltage at which half of the maximal conductance is activated, from a Boltzmann fit to the G–V curve.' },
  vHalfInact: { term: 'V½ inactivation', definition: 'Prepulse voltage at which half of channels are available (not inactivated), from the steady-state inactivation curve.' },
  persistent: { term: 'Persistent current', definition: 'Small non-inactivating sodium current remaining late in a depolarising step, expressed as % of peak. Elevated persistent current is a gain-of-function feature.' },
  recovery: { term: 'Recovery from inactivation', definition: 'Time course with which inactivated channels become available again at hyperpolarised voltage; fitted with a single exponential (τ).' },
  voltageClamp: { term: 'Voltage clamp', definition: 'Electrophysiology technique that holds membrane voltage at commanded values and records the resulting ionic current.' },
  ssi: { term: 'Steady-state inactivation', definition: 'Fraction of channels available to open after a long conditioning prepulse, as a function of prepulse voltage.' },
  s4: { term: 'S4 voltage sensor', definition: 'Fourth transmembrane helix of each repeat, carrying positive charges that move in response to voltage and drive channel opening.' },
  poreLoop: { term: 'Pore loop', definition: 'Re-entrant segment between S5 and S6 that forms the ion selectivity filter.' },
  ifm: { term: 'IFM motif', definition: 'Ile-Phe-Met motif in the DIII–DIV linker that mediates fast inactivation.' },
  aso: { term: 'Antisense oligonucleotide', definition: 'Short synthetic nucleic acid designed to bind a target RNA and alter its processing, translation or stability.' },
  spliceModulation: { term: 'Splice modulation', definition: 'Using an oligonucleotide to change exon inclusion, e.g. to skip a poison exon and increase productive transcript.' },
  alleleSelective: { term: 'Allele-selective suppression', definition: 'Reducing expression of the variant-carrying allele while sparing the reference allele.' },
  haploinsufficiency: { term: 'Haploinsufficiency', definition: 'Disease caused by insufficient product from a single functional allele.' },
  rescueFraction: { term: 'Rescue fraction', definition: 'Fraction of the gap between untreated variant and reference response recovered by a condition.' },
  criticalPath: { term: 'Critical path', definition: 'Longest dependency chain through the task graph; it determines the minimum calendar timeline.' },
  provenance: { term: 'Provenance', definition: 'Structured record of where evidence came from, under which protocol, its limitations, and the conditions under which it may transfer.' },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
