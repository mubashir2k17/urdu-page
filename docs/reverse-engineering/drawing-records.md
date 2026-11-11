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
| `0x03` | story/text property | 4 bytes for key `08`; else 2 bytes |
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

## What the grammar does NOT contain

The curved wrap boundary used by graphics 34/35 is **not** in the tag stream:
the record only carries a 4-point polygon, fill, and style. The native
application derives the curved text-wrap boundary (ellipse/bezier) internally.
The current renderer's hardcoded 100-point clip therefore cannot be replaced by
a decoded field until that derivation is recovered from the executable
(wrap/geometry code), not from the document.

This means: replacing the object-id hardcoding with generic decoded properties
is possible for fills, patterns, border widths/styles, rotation, and the polygon
outline, but the 34/35 curved clip needs additional native-evidence work.

## Reproduce

```bash
npm run dump:objects -- tests/SAMPLE2.INP 34,35,38,48,50,51
```
