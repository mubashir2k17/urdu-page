# Binary identity — InPage executable

Static facts for the analysis target. Text evidence only; the binary is not
committed.

## Target

| Field | Value |
|---|---|
| Path | `C:\Program Files (x86)\Nukta Guidance\Inpage 2018\Inpage 2018_original.exe` |
| SHA-256 | `ce5ee2e79d0bf2425e5d5707af736675648048c98f520b9195c70b50ffbee59e` |
| Size | 3,421,050 bytes |
| Format | PE32 (`pe32`), machine `0x14c` (i386), 32-bit |
| Image base | `0x400000` |
| Import hash (pefile md5) | `285a5706144788e6463141503957c0c9` |
| Imports | 1,158 across 19 DLLs (no delay imports) |

This is the same digest previously analyzed by hand in
`docs/research/inpage-font-banks.md`; addresses there are virtual addresses in
this image.

## Sections (from Ghidra/REA analysis)

| Section | Start | End | Length |
|---|---:|---:|---:|
| Headers | `0x400000` | `0x401000` | 4,096 |
| `.text` | `0x401000` | `0x4db000` | 892,928 |
| `.rdata` | `0x4db000` | `0x4e5000` | 40,960 |
| `.data` | `0x4e5000` | `0x65da50` | 1,542,736 |
| `_TEXT_HA` | `0x65e000` | `0x66e000` | 65,536 |
| `.rsrc` | `0x66e000` | `0x780000` | 1,122,304 |
| `tdb` | `0xffdff000` | `0xffe00000` | 4,096 |

Inventory: 4,018 procedures, 4,029 defined strings.

## Candidate executables in the install directory

| File | Note |
|---|---|
| `Inpage 2018_original.exe` | Verified target above (SHA-256 matches prior research). |
| `Inpage 2018.exe` | Possible wrapper/patched launcher — not yet verified. |
| `Inpage.exe` | Earlier executable — not yet verified. |

Use the original for all evidence until a wrapper's digest and behavior are
confirmed.

## Reproduce

```bash
rea analyze "<install>\Inpage 2018_original.exe" --provider ghidra --format json
rea inspect-pe-imports "<install>\Inpage 2018_original.exe" --format md
```

Requires `GHIDRA_INSTALL_DIR` (Ghidra 12.1.4) and `JAVA_HOME` (JDK 21).
