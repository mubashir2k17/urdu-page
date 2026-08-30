# Security

Every `.inp` file is treated as hostile.

## Threat model

InPage files have been used as exploit delivery in APT campaigns
(CVE-2017-12824 — stack overflow in native InPage 3.x). Our library never runs
the native application and never executes file contents, but a parser still has
its own attack surface.

## Implemented defenses

- **CFB magic + size validation** (`packages/inp-parser/src/security.ts`):
  reject `< 512` bytes, `> 50 MB`, bad magic.
- **Exploit-marker scan**: reject files containing `68 72 68 72` (egg-hunter) or
  ASCII `LuNdLuNd` (shellcode marker).
- **Bounds checking**: every sector/record/length read validates
  `offset + size <= buffer.length`.
- **Cycle detection**: FAT/mini-FAT/DIFAT/directory/stream chains are bounded by
  a hop limit and a visited set.
- **Configurable limits** (`packages/cfb/src/limits.ts`): file size, stream size,
  directory entries, chain hops.
- **No execution**: no macro/shellcode/script evaluation; no external links;
  parsing never launches InPage.
- **Safe image handling**: embedded images are detected and *retained*, never
  passed to a decoder yet (phase 2 will use bounded, safe decoders).

## Error hygiene

Errors contain structured diagnostics and byte offsets, never file contents.
Diagnostics (`packages/diagnostics`) carry severity + category + code + offset.

## Fuzzing

The CFB reader and decoder are structured for property/fuzz testing (phase 2
will add a fuzz harness and property-based tests). Unit tests already cover
truncated headers, cyclic chains, out-of-bounds sectors, and malformed streams.
