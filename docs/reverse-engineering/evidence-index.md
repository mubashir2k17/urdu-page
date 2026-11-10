# Evidence index — native routines

Recovered with REA 6.8.0 + Ghidra 12.1.4 against
`Inpage 2018_original.exe` (see [binary-identity.md](./binary-identity.md)).
Pseudocode is Ghidra output, not original source. Confidence is per row.

Full pseudocode corpus (local, not committed): `C:\Tools\inpage-decomp`
(2,897 function files + `decompile-index.json`), produced by one
`rea decompile-all` import.

Addresses are virtual addresses in the image (base `0x400000`).

## Deep dives

- [noori-shaping.md](./noori-shaping.md) — full Noori/Pashto pipeline: record
  layout, selector algorithm, form computation, advances/kashida, and the
  extracted 44-byte record tables.

## Data loader and DAT transform

| Address | Function | Behavior | Confidence |
|---|---|---|---|
| `0x41090f` | `FUN_0040ed20` | Opens `INPAGEU.DAT` (`s_INPAGEU_DAT_004e7058`), `_lopen`/`_llseek`/`_hread`. | high |
| `0x410f10` | `FUN_00410f10` | One 16-bit transform per word: XOR + byte swap (the trie de-obfuscation). | high |

Loader read sequence observed in `FUN_0040ed20` (sizes are bytes):

1. `3000` into a trie buffer, transformed in place as **1500 words** (`loop 0x5dc`).
2. `0xb400` (46080) → width/slot table (`&DAT_00626a78`).
3. `0x16800` (92160) → position data (`&DAT_00633000`).
4. `0x1c00` (7168) → additional character data (`&DAT_00624c34`).
5. `0x1400` (5120) → 256 × 20-byte root records (`&DAT_006237e8`).
6. `0x3000` (12288) → additional metrics (`&DAT_0064b478`).

This matches the DAT layout already documented in `docs/research/inpage-font-banks.md`,
now confirmed from decompiled code.

## Legacy (v1) text decode

| Address | Function | Behavior | Confidence |
|---|---|---|---|
| `0x413cf1` | `FUN_00413c50` | Legacy decode loop. Per input pair `04 XX`, indexes a **20-byte root record** at `DAT_006237ec + XX*0x14`. Contextual form selected by `local_34` and flags `DAT_004e70b8` / `DAT_004e71b8`. Emits code pairs into the output buffer. | high |

## Noori / Pashto contextual shaping (priority)

| Address | Function | Behavior | Confidence |
|---|---|---|---|
| `0x413060` | `FUN_00413060` | Contextual selector. Iterates candidate sequences starting at `DAT_004ff000` (count in first word); each candidate is `0x17` words. Compares input pairs against **0x2c (44)-byte glyph records** at `PTR_DAT_004fef8c + (code-0x21)*0x2c`. On a match, selects a glyph id via `FUN_004125b0` and emits `param_2[1]=glyph+0x21`, `*param_2 = recordField4 + styleBias + 0xea` (bank/slot pair). | high |
| `0x414b90` | `FUN_00414b90` | Record/glyph emitter. Copies one **44-byte record** from `PTR_DAT_004fef8c + code*0x2c`; special-cases `local_16 == 0x3a`; searches the substitution table at `DAT_004fef92` (five-word rows) to rewrite a following glyph; otherwise appends positioned glyph + mark arrays (`DAT_00651474`, `DAT_00651670`, `DAT_00651674`, marks at `DAT_0064b282`). | high |

- `PTR_DAT_004fef8c` → table selected via `0x4fef84` / `0x4fef88` (default table `0x4e7928`; alternate `0x4f34b0`). 44-byte records, ~1091 entries. Matches prior static notes.
- `FUN_00413060` is the dispatch target for the Pashto path (prefix `07` / cache kind `0x7f8b`): it rewrites Noori Character sequences into `(bank, slot)` pairs rather than Arabic root slots.

## Spacing, kerning, kashida, naming

| Address | Function | Behavior | Confidence |
|---|---|---|---|
| `0x40a150` | `FUN_0040a150` | Kashida distribution over eligible glyphs using weights from `0x4e6028`; bounded count. | medium (from prior notes; verify body) |
| `0x40a348` | `FUN_0040a2a0` | Advance/space/kerning routine. Contains the Noori first/repeated-space branches, boundary clearance, and the bank-82 slot-71/72 post-Alef correction. | medium (large function; needs field-by-field pass) |
| `0x40bc69` | `FUN_0040a2a0` | Width/offset index by bank and slot (inside `FUN_0040a2a0`). | medium |
| `0x405b03` | `FUN_00405870` | Formats the bank name `NOORIN%02d` (bank = encoded − 0x80). | high |

## How to continue efficiently

REA CLI commands each re-import the binary (~3.5 min). The MCP server keeps the
target open across queries — register it in Command Code and use the
`mcp__rea__*` tools for iterative work. One-time bulk extraction is already done
via `rea decompile-all`.

Next analysis targets (Phase 2):

1. ~~`FUN_00413060` full body, table layout, prefix `07` route~~ — done; see
   [noori-shaping.md](./noori-shaping.md).
2. `FUN_00414b90` + `DAT_004fef92` substitution table — glyph/mark assembly
   (structure known; byte-level fields open).
3. `FUN_0040a2a0` — exact advances, spaces, kerning for Noori banks (constants
   and control flow known; per-field validation open).
4. Class tables `DAT_004e70b8`/`4e71b8`/`4e72b8`/`4e73b8`/`4e7584`/`4e775c`/
   `4e78bc` — bit meanings.

Every claim here must be re-checked against the field it drives before code
changes; reference PDFs remain evaluation-only.
