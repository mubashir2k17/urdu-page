# Architecture

Layered, separated by concern. Parsing, layout, shaping, and PDF generation are
independent packages with a normalized intermediate document model in between.

## Layers

```
.inp bytes
   │
   ▼
packages/cfb            defensive read-only OLE2/CFB reader
   │  (streams + byte offsets)
   ▼
packages/inp-parser     version detect → decode (v1/v2/v3) → metadata → images
   │
   ▼
packages/document-model normalized model (InPageDocument)
   │
   ├──▶ packages/text-shaper   HarfBuzz/WASM → positioned ShapedRun
   ├──▶ packages/layout-engine page/content boxes; future frames and columns
   │
   ▼
packages/pdf-renderer   PdfBackend abstraction → pdf-lib
   │
   ▼
packages/converter      public API (openInPage/renderPdf/…)
packages/cli            inp2pdf
```

## Key invariants

- **Never lose data silently.** Unknown streams are retained as
  `UnknownRecord` with raw bytes + offsets + confidence. Diagnostics are emitted
  instead of thrown for recoverable unsupported content.
- **Parser retains byte offsets.** Every stream carries its sector offsets; every
  paragraph carries start/end offsets in the decoded stream.
- **Render backend is decoupled.** `PdfBackend` is a narrow interface; pdf-lib is
  one implementation and can be swapped. It measures and emits the same
  `ShapedRun`, so line wrapping cannot disagree with positioned glyph output.
- **Layout precedes emission.** `layout-engine` resolves source geometry into a
  validated page content box. The PDF renderer flows text inside that box but
  does not decode or invent source geometry.
- **Shaping is independent of PDF emission.** `text-shaper` converts one
  explicitly segmented logical run into positioned glyph ids and font-unit
  metrics. It does not import pdf-lib, choose line breaks, or emit documents.
  The PDF backend maps those glyph ids through an identity CID font and attaches
  the unchanged logical string as marked-content `ActualText`.
- **Rasterization is a fallback, never the default.** Milestone 1 emits vector
  text only.

## Security posture

See [SECURITY.md](./SECURITY.md). In summary: validate magic/size first, scan for
CVE-2017-12824 markers, bound every read, detect cycles, never execute macros or
launch the InPage application.

## Why own CFB reader instead of `cfb`

We need per-file/stream/object limits, cycle detection, and bounds checks we
control. The brief requires treating every file as hostile. The reader is
read-only and cross-validated against SheetJS `cfb` in dev tests.

## Decisions

See `docs/adr/` for Architecture Decision Records.
