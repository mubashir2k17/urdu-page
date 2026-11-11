# Drawing/text record grammar (v1)

Recovered from `tests/SAMPLE2.INP` with `tools/dump-inp-objects.ts`. This is the
structural basis for replacing fixture-specific rendering with decoded
properties. Confidence is per statement.

## Record header (12 bytes)

| Offset | Type | Meaning | Confidence |
|---:|---|---|---|
| `+0` | u16 | kind (1 page, 3 text, 4 line, 5 graphic) | high |
| `+2` | u16 | object id (per document) | high |
| `+4` | u32 | constant `2` (record marker) | high |
| `+8` | u32 | payload length | high |
| `+12` | bytes | payload (tag stream) | high |

## Payload prefix

The payload begins with 6 bytes `80 00 FF FF FF FF` before the tag stream.

## Tag stream

Each entry is `key:u8`, `group:u8`, `value`. The value width depends on the
group and key:

| Group | Meaning | Value width |
|---|---|---|
| `0x7e` | drawing property | 4 bytes for keys `00,01,02,03,05,1a,1b,1c`; else 2 bytes |
| `0x03` | story/text property | 4 bytes for keys `06,08`; else 2 bytes |
| `0x05` | shape property | 2 bytes |
| other | not a tag (end of stream / trailing bytes) | stop |

The `0x1b` entry is a polygon byte count; it is followed by `value` bytes of
vertices (8 bytes each, signed i32 x and y, /2000 points).

## Observed field meanings

Verified against parsed `PageObject`s and the source payloads.

| Key | Group | Meaning | Evidence |
|---:|---|---|---|
| `0x00` | 0x7e | x (i32 /2000 points) | 72000 → 36 pt |
| `0x01` | 0x7e | y (i32 /2000 points) | 1241279 → 620.6395 pt |
| `0x02` | 0x7e | width (i32 /2000) | 360000 → 180 pt |
| `0x03` | 0x7e | height (i32 /2000) | 370500 → 185.25 pt |
| `0x04` | 0x7e | flag (1 for graphics, 0 for text objects) | obj 34 vs 51 |
| `0x05` | 0x7e | border width (i32 /2000) | 6000 → 3 pt |
| `0x0e` | 0x7e | fill color index | 0 transparent, 1 white, 2 black |
| `0x0f` | 0x7e | unknown flag (0 in observed records) | — |
| `0x10` | 0x7e | unknown flag (1 in text objects with top border) | — |
| `0x15` | 0x7e | border style | 0 none, 1 rule, 17 cable |
| `0x19` | 0x7e | fill pattern | 3 = diagonal pattern |
| `0x1a` | 0x7e | rotation (i32 /1000 degrees) | 10000 → 10° |
| `0x1b` | 0x7e | polygon byte length + vertices | 32 → 4 points |
| `0x1c` | 0x7e | polygon point count / curve kind | value 4 on objs 34/35 |
| `0x05` | 0x05 | shape selector: 0 rect, 1 ellipse, 6 polygon | obj 34 = 6 |
| `0x0c` | 0x05 | shape flag (1 on polygon objects) | — |
| `0x05` | 0x03 | story/text flag | 1 |
| `0x08` | 0x03 | story reference (u32) | 418, 430, 380 |

## Image records

Image records (kind 5 with a `PPicts…` name) prepend a null-terminated ASCII
path header, then an image-property block using group `0x05` (4-byte values for
keys `1..4`, 2-byte for `5,8,9,0c`), then the normal `0x7e` draw entries. The
`0x80 00 FF FF FF FF` prefix can appear at offset 2 rather than 0. The parser
keeps a scan-based fallback for image records until this header is decoded
sequentially.

## What the grammar does NOT contain

The curved text-wrap boundary used by graphics 34/35 is **not** in the tag
stream: the record only carries a 4-point polygon, fill, and style. The native
application derives the boundary internally.

Runtime path: `FUN_004d4ef0` is a GDI path builder that consumes a point array
plus per-point opcodes (`02/03` line/close, `04/05` bezier/close, `06` move) and
emits `PolyBezierTo`/`LineTo`/`CloseFigure`; callers then call `PathToRegion`.

Related recovered machinery:

| Address | Role |
|---|---|
| `0x41b410` | Ellipse sampler: points from `sqrt(1-(y/b)^2)*a`, ~20 points, with `cos/sin(π/4)` scaling. |
| `0x41b860` | Sets path opcodes: every point `4` (bezier), first `6` (move), last OR `1` (close); rewrites coordinates. |
| `0x4d4ef0` | Replays the point+opcode buffer into GDI `LineTo`/`PolyBezierTo`/`CloseFigure`. |
| `0x4d5160` | Object getter returning `[this+4]` (path point buffer). |

Caveat: the `0x41b860` caller examined (`0x4d2710`, case 4 of a pattern switch)
uses this machinery for **ellipse pattern cells**, not for the 34/35 border.

## Resolved: the 34/35 boundary is the decoded polygon

The clips recovered from the SAMPLE2 reference PDF (`W* n` paths 7 and 8,
emitted under a `[0.75 0 0 -0.75 0 1190.52]` transform) are the decoded 4-point
polygons with straight edges:

- Every "curve" point list is collinear with its polygon edge: a least-squares
  line fit deviates <= 0.01 pt over the full 82 pt edge. The bezier opcodes
  (`0x41b860`) encode straight edges as bezier chains; GDI flattening
  (`0x4d4ef0`) then emits ~100 points per edge, which reads as a "curve".
- All coordinates are snapped to a 0.12 pt device grid.
- Some vertices are beveled (cut) by 0.02–2.1 pt along the adjacent edges
  (obj 35 vertices 2 and 3 lose ~2 pt legs; obj 34 is within 0.08 pt), another
  flattening artifact. The enclosed area differs from the polygon by 0.2%
  (obj 34) and 1.1% (obj 35).

So the generic boundary for a polygon graphic is the decoded polygon itself
(`computeGraphicBoundary` in `packages/pdf-renderer/src/pdflib-backend.ts`);
no ellipse/offset model is needed, and no object-id branching.

Rendering status: the `object.id` branches and numeric fixture constants have
been removed from `pdflib-backend.ts`. Text-box borders snap decoded bounds to
the 0.12 pt device grid (which reproduces the former 620.52/805.80 values
exactly); style-17 dashes use generic `bw`-scaled stepping. SAMPLE2 overlap is
81.62% (vs 81.91% with the removed fixture-tuned data); the residual difference
is the style-17 dash phase.

## Reproduce

```bash
npm run dump:objects -- tests/SAMPLE2.INP 34,35,38,48,50,51
```
