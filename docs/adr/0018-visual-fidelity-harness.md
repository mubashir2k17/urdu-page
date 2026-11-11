# ADR-018: Visual fidelity harness and 90% gate

- **Status**: Accepted
- **Date**: 2026-11-11
- **Builds on**: ADR-014

## Context

The only visual signal was a diagnostic audit with no assertion, and the
documented "90% milestone" did not reproduce. Pixel metrics are easy to game by
tuning constants against one reference.

## Decision

- `tools/visual-diff.ts` rasterizes reference and generated PDFs at the audit
  resolution (36 dpi by default), computes ink overlap, and writes a three-panel
  PNG (reference | generated | diff; red = reference-only, blue = generated-only).
- `npm run visual:diff` exposes it; `npm run test:visual` runs the gated test
  `tests/visual-fidelity.test.ts`, which asserts SAMPLE2 ≥ 90% and is skipped by
  the default suite.
- Thresholds may only be raised as fidelity improves; reference PDFs and the
  metric may not be modified to make results pass.

## Consequences

There is now an honest, inspectable gate. It currently fails at 81.62%, which
correctly reflects the remaining gap. Poppler is required (`pdftoppm`), and the
CLI locates the winget install automatically.
