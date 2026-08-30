# ADR-002: pdf-lib as initial PDF backend

- **Status**: Accepted
- **Date**: 2026-08-30

## Context

Need a PDF backend that works in Node and modern browsers, supports font
embedding and searchable text, and can be swapped later.

## Decision

Use `pdf-lib` behind a narrow `PdfBackend` abstraction.

## Rationale

- Pure JS, Node + browser, no native deps.
- Precise control over ToUnicode/CMap and font embedding.
- MIT-licensed.

## Consequences

- `pdfkit`/manual writer can be swapped behind `PdfBackend`.
- Font subsetting is currently disabled (fontkit GPOS crash on complex Arabic);
  full embedding is used as a safe fallback. See ADR-003.
