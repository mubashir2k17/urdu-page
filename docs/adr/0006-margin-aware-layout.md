# ADR-006: Margin-aware page layout before PDF rendering

- **Status**: Accepted
- **Date**: 2026-08-31

## Context

The renderer previously combined layout and PDF emission: it used a fixed
50-point inset, estimated every character as `0.55em`, and reported source page
groups rather than the number of pages emitted after overflow. Once ADR-005 made
v1 source margins available, keeping those policies in the PDF backend would
make frame, column, and style work progressively harder to isolate and test.

## Decision

- Introduce `@inpage/layout-engine` as the seam that resolves optional source
  setup into page dimensions and a validated content box.
- Keep source/default selection at the renderer call site: disabling
  `preservePageSize` passes no source setup and therefore uses A4 with a
  50-point fallback content box.
- Flow text within the resolved top, right, bottom, and width limits.
- Extend the existing PDF backend interface with `measureText()` and use the
  embedded font's metrics for wrapping and right alignment. Cache measurements
  within a render.
- Count every emitted PDF page, including overflow pages, in `RenderPdfResult`.

## Rationale

- The content-box interface is small enough to remain stable as frame and
  column knowledge grows behind it.
- Margin and font-metric behavior is observable through the public rendered PDF,
  so tests do not need access to layout internals.
- Exact embedded-font widths remove a known pagination error without inventing
  unverified InPage style values.

## Consequences

- Verified v1 margins now affect text placement and pagination.
- The book audit moves from 184 to 292 generated pages against 241 reference
  pages; exact metrics improve the initial margin-only result of 359 pages.
- Sampled overlap improves from 4.3% to 5.0% for the book and from 0.6% to 0.8%
  for the table of contents, but remains far below fidelity targets.
- Fixed 12-point type, fixed 1.6 line height, paragraph spacing, missing style
  runs, Nastaliq shaping, frames, and columns remain layout limitations.
