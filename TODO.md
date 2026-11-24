# TODO — ADR-0020 spacing calibration

Updated: 2026-11-24

Current state: the spacing harness, pen model, stretch-zone distributor,
calibration model, probe generator, rasterizer, oracle adapter, and fit tests
are implemented. The native calibration is blocked on authoring valid InPage
probe documents.

## Checklist

- [ ] **1. Unblock native InPage probe authoring**
  Choose one working path:
  - Attach the InPage dongle and run the full `Inpage.exe` editor; or
  - Provide one valid `.inp` saved from a licensed editor with a real Urdu line
    (`ا  ا`, 24 pt Noori Nastaliq, 0% spacing) at
    `fixtures/spacing-probes/base.inp`; or
  - Supply the text-tool and Save shortcuts/menu for the installed
    `Inpage 2018.exe`.
  Blockers found: `Inpage 2018.exe` has no Save/Save As and pastes Unicode as
  Arial `?` placeholders; `Inpage.exe` requires a dongle;
  `Inpage 2018_original.exe` fails registry registration.

- [ ] **2. Author nine valid probe `.inp` files**
  Real Urdu, Noori Nastaliq 24 pt: spaces 0/2/4/8, tracking 0/1/2/4%, and the
  mixed validation line. Store the sources under
  `C:\Users\mub\projects\urdu-page\fixtures\spacing-probes\` so they remain
  reusable test cases.

- [ ] **3. Export, rasterize, and measure**
  Export A4 PDFs at 1:1, run
  `npm run spacing:rasterize -- --dir <probe-dir> --dpi 300`, then
  `npm run nooric:oracle -- --manifest <probe-dir>/spacing-probes.json --out <probe-dir>/spacing-oracle.json`.
  Confirm each probe yields the expected 2 or 5 ink runs before fitting.

- [ ] **4. Fit and install calibration**
  Run
  `npm run spacing:calibrate -- --oracle <probe-dir>/spacing-oracle.json --out "fonts/inpage-local/spacing-calibration.json"`.
  Review `spaceScale`/`trackingScale` for plausibility before keeping the file.
  Do not use the invalid `tmp/reverse-engineering/spacing-probes/calibration-test.json`.

- [ ] **5. Re-run fidelity gates**
  `npm run test:spacing`, `npm run test:vector`, `npm run test:visual`.
  Pre-calibration baselines: spacing `0.840 / 0.023 / 0.277`, vector `97.43%`,
  visual `88.47%`.

- [ ] **6. Clean invalid artifacts and document constraints**
  Delete the invalid Arial-`?` probe PDFs/PGMs and `calibration-test.json`
  under `tmp/reverse-engineering/spacing-probes/`. Update the ADR/docs with
  the native-editor constraints and the eventual working workflow.

## Notes

- Windows-MCP is installed and registered (user scope) in
  `C:\Users\mub\.commandcode\mcp.json`; it exposes 20 desktop tools.
- The probe generator and fitter are verified with synthetic PGMs:
  space scale `1.0000`, tracking scale `0.96` (pixel rounding).
- `npm test` was green before the invalid native probes: 165 passed, 3 gated
  skipped. `npm run typecheck` is clean.
