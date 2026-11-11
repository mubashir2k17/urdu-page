# Reverse-engineering notes

Text-only evidence recovered from `Inpage 2018_original.exe` with REA + Ghidra.
The executable, vendor fonts, and reference PDFs are never committed.

## Documents

- [binary-identity.md](./binary-identity.md) — target digest, PE layout, sections.
- [evidence-index.md](./evidence-index.md) — address → routine → behavior map.
- [noori-shaping.md](./noori-shaping.md) — NOORIC record tables, selector,
  joining forms, glyph slot/face, advances and kashida.
- [drawing-records.md](./drawing-records.md) — v1 object tag-stream grammar,
  field meanings, native path machinery, and the "no curve" finding.

## Related decisions

- ADR-014 (evidence-driven decoding)
- ADR-015 (sequential tag-stream parser)
- ADR-016 (generic graphic boundary)
- ADR-017 (NOORIC character shaper)
- ADR-018 (visual fidelity harness)

## Tools

```bash
npm run dump:objects   -- tests/SAMPLE2.INP 34,35,38,48     # tag stream dump
npm run nooric:extract -- "<install>/Inpage 2018_original.exe"
npm run nooric:validate -- --json tmp/reverse-engineering/nooric-tables.json
npm run visual:diff    -- --case "A3 sample" --inpage-fonts fonts/inpage-local
```

Bulk pseudocode is produced once with `rea decompile-all` and kept locally (not
in the repository).
