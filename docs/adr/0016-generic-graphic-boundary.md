# ADR-016: Generic graphic boundary; remove fixture hardcoding

- **Status**: Accepted
- **Date**: 2026-11-11
- **Builds on**: ADR-014, ADR-015

## Context

`pdflib-backend.ts` contained literal 100-point clip arrays for objects 34/35,
`object.id` branches (34/35/48), style-17 dash arrays guarded by sample widths,
and magic border coordinates. Reverse engineering established that the
reference "curves" are the decoded polygons with straight edges, flattened onto
a 0.12 pt (600 dpi) device grid; ellipse fits are degenerate. The former
620.52/805.80 border values are exactly the 0.12 pt floor of the decoded bounds.

## Decision

- Compute graphic boundaries from decoded bounds/polygon/style
  (`computeGraphicBoundary`), never from object ids.
- Snap polygon vertices and text-box border positions to the 0.12 pt device
  grid (native printer behavior).
- Generate style-17 dash starts, phases and corner shears from border width only.
- Delete the clip arrays, `object.id` branches, and numeric fixture constants.

## Consequences

- SAMPLE2 overlap moves from 81.91% (fixture-tuned) to 81.62% generic; the
  residual is the style-17 dash phase and object-35's reference bevel artifact.
- The renderer no longer depends on sample identity, satisfying the stated
  requirement that behavior be generic.
- Reference PDFs remain evaluation-only inputs; no reference geometry is used
  as a renderer input.
