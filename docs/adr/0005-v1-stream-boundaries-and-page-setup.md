# ADR-005: Evidence-bounded v1 stream decoding

- **Status**: Accepted
- **Date**: 2026-08-31
- **Supersedes**: ADR-004

## Context

ADR-004 assumed that the delimiter after the binary preamble introduced a
sequence of length-prefixed records. The larger paired fixtures disproved that
as a complete model: `FONTS.INP` stores flat `04 XX` text, while the book files
contain some `0D <u32le length>` paragraph records inside broader flat content.
Joining only parsed record payloads therefore drops real text.

The same fixtures reveal a fixed six-field setup block in `InPage100` containing
page width, height, and margins. Similar byte sequences recur later in some
streams, but their object or style semantics are unknown.

## Decision

- Treat the delimiter as the start of the v1 content area, not proof that the
  remainder is entirely record-framed.
- Locate dense `04 XX` text regions after it and decode those regions with the
  flat legacy decoder. Recognize record-like paragraph headers within that
  content without making them the stream's outer framing.
- Decode page geometry only from the verified fixed v1 header block beginning
  at stream offset `0x10E`. Require all six tags and plausible values.
- Expose exact point dimensions and margins in `PageSetup`. When requested, the
  renderer preserves source width and height; margin application remains a
  layout-engine concern.
- Do not apply this geometry decoder to v2 or v3 until fixtures verify their
  layouts.

## Rationale

- The density model recovers substantially more reference text than
  record-payload joining and works for both flat and mixed streams.
- Fixed-offset validation avoids mistaking repeated, undecoded object data for
  document setup.
- Keeping source dimensions separate from print/export media explains why
  `SAMPLE2.INP` is A4 while its paired PDF uses an A3 media box.
- Deferring margins to layout avoids embedding frame and pagination policy in
  the PDF backend.

## Consequences

- `preservePageSize` now works for verified v1 source dimensions.
- `PageSetup` is a public model type containing dimensions, margins, source
  offset, and confidence.
- The A3 sample remains an intentional audit size mismatch because the harness
  compares source setup with independently chosen PDF print media.
- Frames, columns, orientation flags, print-media choices, and v2/v3 geometry
  remain unverified.

See `docs/research/inpage-page-geometry.md` for offsets, fixture values, hashes,
and primary-source limits.
