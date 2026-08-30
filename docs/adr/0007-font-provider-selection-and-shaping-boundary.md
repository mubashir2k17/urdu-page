# ADR-007: Font-provider selection and shaping boundary

- **Status**: Superseded in part by ADR-008 and ADR-009; provider selection remains accepted
- **Date**: 2026-08-31
- **Supersedes**: ADR-003

## Context

ADR-003 introduced `FontProvider`, but the renderer never consulted registered
providers. Every conversion still required the caller's single fallback font,
so decoded InPage font names such as `Noori Nastaliq` could not influence font
selection.

The existing pdf-lib backend does perform fontkit's basic Arabic GSUB/GPOS
layout. Raster inspection confirms joined Noto Sans Arabic output. It is not a
complete Nastaliq solution, however. Controlled tests with official Noto
Nastaliq Urdu builds exposed two backend failures:

- the current regular build exceeded Node's 4 GB heap while measuring the book
  corpus;
- the older static build failed in fontkit GPOS processing on a null anchor.

HarfBuzz shapes both files successfully, but it is currently available only as
a local executable, not as a portable renderer dependency.

## Decision

- Make `registerFontProvider()` functional. When no explicit fallback is
  supplied, the renderer passes the decoded document font names to registered
  providers and uses the first exact name match.
- Give the newest registration priority. If no exact match exists, use that
  provider's fallback.
- Return an unregister function from `registerFontProvider()` so applications
  and tests can scope global registrations safely.
- Keep an explicitly passed fallback font higher priority than all providers.
- Keep Noto Sans Arabic as the bundled default used by the CLI and reference
  baseline. Do not vendor or select Noto Nastaliq until the backend can shape a
  book-scale corpus without crashing or unbounded memory growth.
- Allow `npm run audit:references -- --font /path/to/font.ttf` for controlled
  comparisons. The audit reuses each conversion for structural and raster
  checks instead of rendering each fixture twice.

## Consequences

- Licensed InPage fonts can now enter the renderer through the documented API,
  although the current single-font layout cannot yet switch fonts per text run.
- Alternate fonts can be compared without editing the harness.
- Basic Arabic joining is supported by the current fallback; faithful
  Nastaliq, decoded style selection, and HarfBuzz parity remain future work.
- Font compatibility is a renderer constraint, not evidence for changing
  decoded font-size or leading values.

## Alternatives considered

### Make Noto Nastaliq Urdu the bundled default

Rejected for now because both official static builds tested are unsafe with the
current fontkit path at realistic scale.

### Invoke the system `hb-shape` executable at runtime

Rejected because it would make conversion depend on an optional host binary and
would not by itself solve searchable PDF glyph embedding.

### Keep provider registration as metadata-only scaffolding

Rejected because it made the public API misleading and prevented licensed font
experiments from reaching the renderer.
