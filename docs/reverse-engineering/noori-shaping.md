# Noori / Pashto shaping — native algorithm

Recovered from `Inpage 2018_original.exe` with REA + Ghidra (see
[evidence-index.md](./evidence-index.md)). Addresses are virtual addresses in
the image (base `0x400000`). Pseudocode is Ghidra output; confidence is stated
per claim.

## Pipeline

```
InPage100 text (legacy codes, incl. prefix 07)
   │
   ▼
FUN_00413c50  (0x413c50)  legacy decode
   ├─ 20-byte root records at DAT_006237ec (from INPAGEU.DAT)
   ├─ class/join flags at DAT_004e70b8 / DAT_004e71b8 / DAT_004e72b8
   └─ calls FUN_00413060 for contextual selection
          │
          ▼
FUN_00413060 (0x413060)  contextual selector  →  (bank, slot) glyph pairs
   ├─ FUN_004125b0 (0x4125b0)  find record by (code, form)
   │     └─ FUN_00415bf0 (0x415bf0)  binary search over 44-byte records
   └─ post-pass: joins/ligatures via class tables + FUN_004127c0
          │
          ▼
FUN_0040a2a0 (0x40a2a0)  advances / spacing / kashida / marks
   └─ calls FUN_00414b90 (0x414b90) to emit each positioned glyph/mark
```

## Kind routing (confirmed)

`FUN_0040a2a0` chooses the shaper by run kind (`DAT_00626a6c`):

- Kind `0x7f85`, `0x7f8b`, `0x7f89`, `0x7f8c` → `FUN_00413c50` (Arabic/Urdu/
  Pashto contextual path). **`0x7f8b` (Pashto) uses the same path as Urdu.**
- All other kinds (e.g. `0x7f80` Latin) → `FUN_00415880`.

Prefix `07` in the text stream is decoded through the same root-table lookup as
`04` (the second byte indexes the root record; only `0x08` or a `0x20` second
byte are treated as a space). So Pashto shares the Urdu character table, and
the script/font difference is resolved later by which record table is active.

## 44-byte record table (Noori Character)

Selected via pointers `PTR_DAT_004fef84/88/8c`:

| Slot | Pointer VA | Target VA | Records | Distinct codes |
|---|---|---:|---:|---:|
| default | `0x4fef84` / `0x4fef8c` | `0x4e7928` | 1091 (`0x443`) | 154 |
| alternate | `0x4fef88` | `0x4f34b0` | 1087 (`0x43f`) | 154 |

Form histogram (default table): form0=116, form1=71, form2=436, form3=429,
form4=39. Alternate differs only in medial count (432). Records are sorted by
`(code, form)`, enabling binary search.

Consistency check: non-joining letters such as `0x81` and `0x8b`–`0x91`
(alef/dal/reh/waw class) expose only forms 0/1, while joining letters such as
`0x82`–`0x8a` expose forms 0–3. This matches Arabic joining semantics and
supports the layout interpretation above.

### Record layout (44 bytes / 22 shorts)

Offsets are relative to record start. "Evidence" cites the decompiled use.

| Off | Type | Meaning | Evidence | Confidence |
|---:|---|---|---|---|
| `0x00` | int16 | key code (legacy second byte, `0x81`–…) | compared to input code in `FUN_00413060`; sort key in `FUN_004125b0` | high |
| `0x02` | int16 | form: 0 isolated, 1 final, 2 medial, 3 initial, 4 any/ligature | compared to computed form; `==4` suppresses advance | high |
| `0x04` | int16 | NOORIC sub-variant (observed 0–2); face code `= + 0xea + styleBias` | `param_5[o] = record[+4] + sVar20 + 0xea` | high |
| `0x06` | int16 | glyph slot in the NOORIC face; low byte is the rendered char | `FUN_00401b10` calls `TextOutA(…, record+6, 1)`; width lookup indexes this slot | high |
| `0x08` | int16 | glyph/outline metric field | copied into emitter locals | medium |
| `0x0a` | int16 | glyph/outline metric field | copied into emitter locals | medium |
| `0x0c` | int32 (or 2×int16) | signed pen/offset applied by emitter | `record[+0xc]` sign toggles pen add/sub in `FUN_0040a2a0` | medium |
| `0x10` | uint32 | pointer to context list (shorts, `0x80`-terminated) | read as pointer and dereferenced; validated below | high |
| `0x14` | int16 | form/type class (compared to form, `1`, `3`) | `record[+0x14]` checks in selector | high |
| `0x16`–`0x2a` | int16×11 | glyph/mark/piece data copied by emitter | `FUN_00414b90` copies 11 dwords | low |

Confirmed context lists (shorts until `0x80`):
- record 1 (`0x81`, form 1) → `[0x9e]`
- record 6 (`0x82`, form 2) → `[0xb9, 0xa6]`

The emitter `FUN_00414b90` copies the 44-byte record, and if the following form
is not `4` increments the output position; it also consults the substitution
table at `DAT_004fef92` (five-word rows) to rewrite a following glyph.

### Output code token and face selection

For a selected record index `r` the selector writes:

- `out[n]   = record.variant + styleBias + 0xea`  (face code)
- `out[n+1] = r + 0x21`                            (record token)

`FUN_0040a2a0` computes `faceIndex = out[n] - 0x80` and passes it to
`FUN_00405870`, which selects the font face by range:

| faceIndex | Face |
|---|---|
| `< 0x66` (≤99) | `NOORIN%02d`, number = faceIndex |
| `0x66..0x69` | ZoharSindhi + (faceIndex − 0x66) |
| `0x6a..0x6f` | NOORIC[(faceIndex − 0x6a) / 3] with (faceIndex − 0x6a) % 3 suffix |
| `0x70..0xc9` | Quranic + (faceIndex − 0x70) |
| `≥ 0xca` | Number + (faceIndex − 0xca) |

Because `variant` ∈ {0,1,2}, face codes `0xea`–`0xec` land at faceIndex
`0x6a`–`0x6c`, i.e. **this table is the NOORIC family**. Ordinary Urdu NOORIN
banks are a different face range reached through the root-slot path, not this
table.

Resolution: the glyph is the single byte at `record + 0x06` (low byte), drawn with
`TextOutA` in the face selected by `variant`. `FUN_00409060` indexes the
per-variant advance table by that same slot. The record token `r + 0x21` only
points back to the record; it is not the glyph. See
`tools/nooric-table.ts` (`glyphSlot`, `advanceWidth`).

`styleBias` (`DAT_0064a0a8`): `0` when `< 3`, else `weight*3 - 6`. It shifts the
face code and is the native synthetic-bold/face switch; reset it after a bold
face is selected.

## Form computation (confirmed)

Walking the decoded code sequence, two non-joining flags are tracked:
`notJoinPrev` (`bVar5`) and `notJoinNext` (`bVar4`). The emitted form is:

| notJoinPrev | notJoinNext | form |
|---|---|---|
| true | true | 0 isolated |
| true | false | 3 initial |
| false | true | 1 final |
| false | false | 2 medial |

i.e. `prevJoin = !notJoinPrev`, `nextJoin = !notJoinNext`, standard Arabic
joining forms.

## Selector algorithm (`FUN_00413060`)

1. For each input code, compute the form above (special cases snap `0xa5`/
   `0x12f` to `0xa4`).
2. `FUN_004125b0(code, form, -1)` → binary-searches `(code, form)` over the
   active table (`FUN_00415bf0`, stride 44); returns `index | 0x8000` when found.
3. Walk forward through equal `(code, form)` records, checking the `+0x10`
   context-list pointer and the `+0x14` form/type against previous/next
   context (`FUN_00412660`, `FUN_004126a0`, `FUN_004126f0`).
4. Emit `(bank, slot)` as above.
5. Post-pass over the emitted pairs inserts joins/ligatures: it tests glyph
   classes with `FUN_0040eb70` against tables `DAT_004e7584`, `DAT_004e775c`,
   `DAT_004e78bc`, `DAT_004e73b8`, and rewrites ranges via `FUN_004127c0`
   (`FUN_00412eb0` toggles a special case). This is the multi-glyph ligature
   stage.

`FUN_0040eb70(byte, table)` is the class-membership test used throughout.

## Advances, spaces, kashida, marks (`FUN_0040a2a0`)

- Space width: if `DAT_0064a0a8 == 0`, ordinary space = `0x96` (150/1000 em);
  otherwise first/repeat space values from `DAT_00649830` (matches prior notes).
- `FUN_0040a150(codeArray, count, weightTable, out)` distributes kashida counts
  using the weight table at `0x4e6028`.
- Kashida glyph is looked up as `FUN_00409060(ctx, 0xe4, 0xb3, 1, …)`
  (bank `0xe4`, slot `0xb3`).
- Per-glyph advance/offset: `record[+0xc]` sign adds/subtracts `local_13c`;
  forms other than `4` increment the output slot; form `4` carries no advance.
- Marks are accumulated separately (`DAT_00651900` glyph count,
  `_DAT_00651902` mark count) and emitted via `FUN_00414b90`.

## Reproduction (no binary committed)

`EXE` sections: `.data` has `VirtualAddress == PointerToRawData` (`0xE5000`),
so `file_offset = VA - 0x400000` for table data. Procedure used to decode:

1. Read `uint32` at VA `0x4fef8c` (default) and `0x4fef88` (alternate).
2. For record `i`: fields at `table + i*44 + {0,2,4,0x10,0x14}`; sign-extend
   as noted.
3. Context list at the `+0x10` pointer: `int16` values until `0x80`.

This was verified with a small Node PE reader; counts and form histograms above
were produced by it.

## Implementation implications

- The converter currently approximates Noori with whole-word DAT mappings
  (`LegacyLigatureTextShaper`) plus saved-width fitting. The native path is
  **character-level contextual selection over these 44-byte records**, then a
  ligature post-pass.
- To reproduce it faithfully we need, per active font family, the record table
  (default/alternate) as a generated data module, plus the class tables and the
  three context-search helpers.
- Validate against known-good targets from prior research (e.g. NOORIN16 glyph
  id 97 for `میں`) before switching rendering over.
- Keep `ActualText` logical Unicode unchanged; the record boundary is a shaping
  detail, not text content.

## Open questions (next pass)

1. Fields `0x08`, `0x0a`, and `0x16`–`0x2a` (extra glyph/mark metrics) — resolve
   against a known reference word.
2. The three table pointers in `PTR_DAT_004fef84..8c`: which font families map
   to which table (default Noori vs Aasaar/Trad Arabic).
3. `FUN_00412660/004126a0/004126f0/004127c0/00412eb0` exact semantics
   (previous/next context match, ligature range rewrite).
4. Class tables `DAT_004e70b8/004e71b8/004e72b8/004e73b8/004e7584/004e775c/
   004e78bc` contents (bit meanings).
5. NOORIC advance-width table: `(&DAT_0064ab3c)[3]` is zero in the file and
   filled at runtime (uninitialized `.data`); recover by tracing the init write
   or approximate with font metrics.
