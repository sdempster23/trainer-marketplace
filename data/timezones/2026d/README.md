# ICU timezone resources — IANA 2026d

This directory contains a complete little-endian ICU timezone update,
generated on 2026-09-18 from official sources. No PawMatch timezone-rule
overrides are present. `source/` retains the resource text for review;
`le/` contains the four runtime resources (234,000 bytes total).

## Provenance

- IANA repository: `eggert/tz`, release tag `2026d`, commit
  `d633fe7ed3de8e00ce7cac991376a064a1373bb1`.
- The annotated tag object is `bac9223f4b125629da479852d2f4ef04b17491bb`.
  GitHub reported its PGP signature valid; no separate local key verification
  is claimed.
- ICU repository: `unicode-org/icu`, commit
  `7e7a3ce48016b5ca3862628c785651278c46e7d7`.
- Inputs were read through the GitHub connector from those immutable commits;
  every fetched source was checked against its Git blob SHA.
- `zoneinfo64.txt` was generated using ICU's unmodified `zic` and `tz2icu`
  sources. The other three text resources are unchanged ICU files from that
  same commit. The converter used its official `metazoneOffsets.txt`,
  `icuzones`, and `icuregions` inputs.
- ICU `genrb` 78.3 compiled the text with `--formatVersion 2` on an Apple
  Silicon Mac. ICU's `44/le` format supports ICU 4.4 and newer; the runtime
  drop-in mechanism requires ICU 54 or newer.

`provenance.json` records all source paths, immutable URLs, Git blob hashes,
and each compiled resource's byte count and SHA-256. The local command
wrapper verifies the compiled hashes before starting a process.

Retain `LICENSE-IANA.txt` and `LICENSE-Unicode.txt` when distributing or
regenerating the bundle.

## Verification performed

- Node 22.23.2 / ICU 78.2 loads these resources and reports IANA **2026d**.
- Clock probes and installed `node-ical` recurrence probes pass.
- Scheduling, booking display, all-day anchoring, recurrence exclusions,
  moved occurrences, UK DST, and existing US regression tests pass under
  both UTC and America/Chicago server timezone settings.
- Independently compiled the unmodified IANA input data using macOS
  `/usr/sbin/zic`, then read its TZif files with Python `zoneinfo`. Compared
  Node's loaded ICU offsets for all **418** `zone.tab` zones at 13 instants
  spanning 1970–2030: **5,434 matches**, no unsupported zones or differences.
  This is broad offset verification, not an exhaustive every-transition proof.
- The official older ICU C sources emitted signed-shift compiler warnings
  and numeric-abbreviation warnings while building; source code was unchanged.

These checks cover the local Node binary. Hosted startup configuration and
function-level verification are separately required in `docs/timezone-data.md`.

## Rebuilding resources from the retained text

Use a compatible ICU development toolchain and an empty output directory:

```sh
genrb --formatVersion 2 -d /absolute/path/to/output \
  source/zoneinfo64.txt source/metaZones.txt \
  source/timezoneTypes.txt source/windowsZones.txt
```

On a little-endian machine this creates `le` resources. For other platforms,
use ICU `icupkg` to produce the correct byte order. Do not overwrite the
committed bundle before comparing output hashes and running the runtime tests.

## Regenerating zoneinfo64 from official source

Use disposable checkouts at the exact commits above. No full application
dependency installation is needed. This is the pipeline from ICU's
`icu4c/source/tools/tzcode/Makefile.in`, compiled against an installed ICU
development toolchain:

1. Copy the ICU `tools/tzcode` source files to a disposable working directory,
   plus `data/tzdata/metazoneOffsets.txt`. Compile its unmodified tools:

   ```sh
   clang -std=c99 -D_POSIX_C_SOURCE=200112L '-DTZDIR="zoneinfo"' \
     zic.c localtime.c asctime.c scheck.c ialloc.c -o zic
   clang++ -std=c++17 '-DICU_METAZONE_OFFSETS="metazoneOffsets.txt"' \
     -I/absolute/path/to/icu/include tz2icu.cpp -o tz2icu
   ```

2. For each IANA file `africa antarctica asia australasia europe northamerica
   southamerica etcetera factory backward`, use IANA's `ziguard.awk` with
   `DATAFORM=rearguard` to write a same-named working copy. Preserve the
   original inputs. Copy IANA `zone.tab` alongside them.
3. Run the ICU tools in that working directory:

   ```sh
   ./zic -d zoneinfo -L /dev/null africa antarctica asia australasia europe \
     northamerica southamerica etcetera factory backward icuzones
   ./tz2icu zoneinfo zone.tab 2026d
   ```

4. Retain generated `zoneinfo64.txt`; copy `metaZones.txt`, `timezoneTypes.txt`,
   and `windowsZones.txt` from the pinned ICU `data/misc` directory. Compile
   with `genrb` as above, verify runtime behavior, and regenerate resource
   hashes. Generated comments include build time/tool version, so future
   builds may differ byte-for-byte even when timezone rules are equivalent.
5. For future IANA releases, intentionally update the pinned sources and
   regression expectations only where official rule changes warrant it.
   Prefer official ready-made ICU update resources when available.

References: [ICU update mechanism](https://unicode-org.github.io/icu/userguide/datetime/timezone/),
[ICU converter Makefile](https://github.com/unicode-org/icu/blob/7e7a3ce48016b5ca3862628c785651278c46e7d7/icu4c/source/tools/tzcode/Makefile.in),
[IANA release source](https://github.com/eggert/tz/tree/d633fe7ed3de8e00ce7cac991376a064a1373bb1).
