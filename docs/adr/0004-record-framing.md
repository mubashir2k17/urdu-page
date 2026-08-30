# ADR-004: Record framing vs. flat decode (v1/v2)

- **Status**: Superseded by ADR-005
- **Date**: 2026-08-30

## Context

KamalAbdali's `InpageToUnicode` (unlicensed) describes v1/v2 streams as
length-prefixed records after a separator + delimiter. The MIT `inpage-format`
spec decodes the stream flatly with `0x04` pairs and `pendingSpace`.

## Decision

Detect record framing; if the `0D 00 00 00 00 00` delimiter is present, decode
the joined record payloads. Otherwise fall back to flat scanning. The flat
decoder remains the reference for the character map and composite handling.

## Rationale

- Both approaches produce readable Urdu on `Final-1.inp`/`Final-2.inp`, so the
  framing is not strictly necessary yet — but it is a verified lead worth
  honoring to preserve exact record boundaries for future layout work.

## Consequences

- `detectRecordFraming` + `walkRecords` in `packages/inp-parser/src/records.ts`.
- Confidence recorded as "medium (lead)" until a reference confirms necessity.
