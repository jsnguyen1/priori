# PRIORI — Research Workspace (demonstration)

> **The next patient shouldn't start from zero.**

PRIORI is an interactive demonstration of a proposed platform for personalized genetic medicine, built for the Stanford BASES competition. It walks through one continuous story inside a single persistent application:

1. **Act I — Patient & Atlas.** A hypothetical newborn (PX-001) with seizures and an uncharacterized SCN2A variant. The judge makes a treatment decision without functional evidence; the platform then reveals the simulated mechanism and opens a Mechanism Atlas of ~3,200 synthetic variant records.
2. **Act II — Molecular Laboratory & Therapy Design.** The experimental NaV1.2 structure (PDB 6J8E), a deterministic simulated voltage-clamp experiment, a transparent rule-based mechanism classification, mechanism-dependent therapeutic strategies, fictional candidate records and a simulated 96-well screen. Findings are saved as evidence artifacts with structured provenance.
3. **Act III — Evidence Reuse & Development.** A second hypothetical patient (PX-002, different variant) arrives. The library is retained; a rules engine decides what evidence transfers, what needs validation, what must be new, and what never transfers. A dependency-scheduled development model compares bespoke research with evidence reuse.

**Everything is hypothetical, simulated or illustrative unless explicitly labelled PUBLISHED. This is not clinical decision support.**

---

## Setup

Requires Node 18+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
```

The application runs fully offline after `npm install`. Fonts are bundled (`@fontsource`), the protein structure and UniProt annotations are vendored in `src/data/`, and there are no runtime API calls.

Best viewed at 1440 × 900 or larger in a Chromium-based browser.

## Guided demo (recommended for judges)

On load, choose **START GUIDED DEMO** (or click **GUIDED DEMO** in the top bar). A 32-step walkthrough dims everything except the control to use, explains what you are looking at in plain English, and advances only when the app state shows the step was really done. Misclicks get a nudge; **Do it for me** performs any step; a progress rail tracks the six chapters. At the end, a scorecard shows steps done, misclicks and time.

## Controls

| Key | Action |
| --- | --- |
| `P` | Toggle Presentation Mode |
| `→` / `PageDown` / `Space` | Next narrative step (Presentation Mode) |
| `←` / `PageUp` | Previous step |
| `H` | Return to primary case (PX-001) |
| `Shift` + `R` | Reset demo (with confirmation) |
| `⌘K` / `Ctrl+K` | Command palette — modules, patients, variant search, steps |
| `L` | Experiment log |
| `1`–`6` | Jump to module |
| `Esc` | Close overlays |

The shield icon in the left rail opens **Provenance & assumptions**: a breakdown of published facts, hypothetical cases, synthetic measurements, illustrative predictions and financial assumptions, plus the full provenance of every artifact in the Evidence Library.

### Presentation Mode (≈ 4 minutes)

Presenter-controlled — nothing auto-advances. Each step establishes the minimum state it needs when you press `→`, so the presenter can recover from any unexpected click by pressing `→` again. The first step waits for the judge's decision and will not fabricate one.

| Cue | Step |
| --- | --- |
| 0:00–0:45 | Patient decision (PX-001) |
| 0:45–1:20 | Mechanism Atlas, focused on the patient variant |
| 1:20–2:40 | Molecular lab → simulated electrophysiology → mechanism report |
| 2:40–3:10 | Therapeutic strategy → virtual screen → save evidence |
| 3:10–3:45 | Load PX-002 → evidence inheritance |
| 3:45–4:00 | Development comparison → closing message |

## Architecture

```
src/
  domain/types.ts       Shared typed domain model (Patient, GeneticVariant, MechanismClassification,
                        FunctionalMeasurement, ExperimentalProtocol, TherapeuticStrategy, Candidate,
                        ScreeningResult, EvidenceArtifact, EvidenceProvenance, DevelopmentTask,
                        DevelopmentScenario, ReuseAssessment, UncertaintyRange, …)
  data/
    published.ts        Published biology: UniProt Q99250 sequence + topology, citations, facts
    published/          Vendored UniProt annotations (JSON)
    structure/          Cα trace of PDB 6J8E, oriented to the membrane (generated)
    variants.ts         Seeded synthetic Atlas + hand-specified patient variants
    patients.ts         Four hypothetical patients
  sim/                  Scientific models — pure, deterministic, UI-independent
    rng.ts              mulberry32 PRNG + string hashing; global seed 0x5C2A2005
    channel.ts          NaV gating model, voltage-clamp protocols, curve fitting, synthetic measurements
    classifier.ts       Rule-based mechanism classifier with perturbation-based confidence
    therapy.ts          Strategy library, schematic transcript, fictional candidate generation
    screening.ts        Simulated 96-well screen
    evidence.ts         Evidence artifact factories with structured provenance
    reuse.ts            Reuse assessment engine (typed provenance conditions)
    development.ts      Task DAG, scenarios, critical-path scheduling, cohort model
  state/
    store.ts            Zustand store: user actions, artifacts, experiment log
    presentation.ts     Narrative state machine
  shell/                System bar, nav rail, status bar, command palette, log, provenance, presentation
  modules/              patient · atlas · lab · therapy · reuse · development
  ui/                   Design tokens, primitives, glossary, workspace layout
scripts/
  build-structure.mjs   Regenerates src/data/structure from an RCSB mmCIF file
```

Scientific models (`sim/`) know nothing about React. The store records actions and the artifacts they produce; components derive everything they display from the shared models, so changing a variant changes every plot, measurement and classification at once.

## Scientific models

### Channel model (`sim/channel.ts`) — SIMULATED
A Hodgkin–Huxley-style formulation, `I = ḡ · m³ · [(1 − p)·h + p] · (V − E_Na)`, with Boltzmann steady states, voltage-dependent time constants and exact exponential integration (Δt = 0.02 ms). Four voltage-clamp protocols (activation, steady-state inactivation, recovery from inactivation, persistent current) are simulated and the resulting curves are *fitted* to obtain the five reported measurements. Synthetic measured values add seeded sampling error of the mean for `n` cells against a seeded reference dataset. Parameters are broadly consistent with published heterologous NaV1.2 biophysics but are **not fitted to any dataset**.

### Mechanism classifier (`sim/classifier.ts`) — ILLUSTRATIVE
Five explicit rules (peak current density ratio, ΔV½ activation, ΔV½ inactivation, persistent-current ratio, recovery τ ratio) map deviations to signed scores with stated decision boundaries. Calls: gain of function, loss of function, mixed (strong evidence on both sides), or indeterminate (no significant deviation, low confidence, or prior-only). Confidence is the agreement rate across 240 seeded perturbations of every measurement by its standard error.

### Atlas (`data/variants.ts`) — HYPOTHETICAL / SIMULATED
~3,200 variant records sampled with region-dependent density and region-dependent priors over gating parameters (e.g. S4 → activation shifts; pore → conductance loss; DIII–DIV linker → impaired inactivation). **Classes are never assigned directly**: each record's measurements are derived from its parameters and classified by the same rules. Records carry an evidence level (synthetic patch-clamp, synthetic summary, computational prior); prior-only records carry inflated uncertainty and are usually indeterminate.

### Therapy & screening (`sim/therapy.ts`, `sim/screening.ts`) — ILLUSTRATIVE / SIMULATED
Strategies depend on mechanism and confidence; indeterminate cases yield "insufficient evidence to nominate a therapeutic candidate". Candidates use invented, non-actionable identifiers and schematic binding windows — **no sequences**. The virtual screen applies a deterministic dose–effect model to the channel model and reports pass, mixed, fail or excluded-for-uncertainty outcomes.

### Evidence reuse (`sim/evidence.ts`, `sim/reuse.ts`)
Every artifact records source type, originating patient, gene, mechanism, protocol version, cell system, modality, limitations, validation status and **typed reuse conditions** (e.g. `same-protocol-version`, `same-variant`, `same-modality`, `never-transfers`). The reuse engine evaluates those conditions against the new patient's context — never free-text matching. Clinical evidence never transfers, and variant-specific efficacy does not transfer to a different variant.

### Development model (`sim/development.ts`) — ASSUMPTION
A task DAG with effort, duration and cost ranges per task and separate cost categories (evidence generation, manufacturing, clinical, regulatory). Reuse classes scale remaining work under conservative or optimistic scenarios; mandatory tasks cannot be skipped. Timelines come from dependency scheduling (critical path), not from summation. The cohort model includes fixed platform investment and continuing marginal costs and may show the platform costing more before reuse accumulates. It does not claim a universal break-even.

## Provenance of real data

- **Sequence and topology**: UniProtKB Q99250 (SCN2A_HUMAN), retrieved 2026-10-24. Vendored in `src/data/published/scn2a_uniprot.json`.
- **Structure**: PDB 6J8E — human NaV1.2–β2–KIIIA complex, cryo-EM. Pan X, Li Z, Huang X, et al. *Science* 363:1309–1313 (2019). Only the α-subunit Cα trace is used, rotated so the membrane normal is +Y (`scripts/build-structure.mjs`). β2 and the toxin are omitted. Unresolved cytoplasmic linkers and termini are absent from the model.
- **Literature context**: Sanders et al. 2018 (*Trends Neurosci*); Ben-Shalom et al. 2017 (*Biol Psychiatry*); Wolff et al. 2017 (*Brain*); West et al. 1992 (*PNAS*).

To regenerate the structure file:

```bash
curl -o 6j8e.cif https://files.rcsb.org/download/6J8E.cif
node scripts/build-structure.mjs 6j8e.cif
```

## Scientific honesty & limitations

- PRIORI is a **proposed** platform. Nothing here is clinically validated or intended for clinical use.
- No Priori-designed therapy has been tested in humans. No regulatory endorsement or approval is claimed or implied.
- All patients are hypothetical. All experimental results are simulated. All predictions, scores and candidates are illustrative.
- A shared mechanism does **not** establish that a therapy is safe or effective for another patient. Variant-specific confirmation and patient-specific safety evidence always remain.
- The gating model omits neuronal context, developmental expression, splice isoforms and β subunits. Channel-level rescue does not imply neuronal or clinical benefit.
- Financial figures are scenario assumptions for discussion, not observed results, quotes or forecasts.
- Determinism: all synthetic variation is seeded. The same actions with the same parameters reproduce identical results, including after **Reset**.
