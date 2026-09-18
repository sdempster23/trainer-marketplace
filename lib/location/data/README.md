# UK approximate postal-area coordinates

`gb-postal-areas.json` maps normalized outward codes to `[latitude, longitude]`.
It is a derivative of the **GeoNames coarse postal-code dataset**, used under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
The full license is in `LICENSE-CC-BY-4.0.txt`. Credit **GeoNames** with a visible
link to [geonames.org](https://www.geonames.org/) wherever the site describes its
location data. PawMatch modifies the source by selecting UK rows, aggregating
unique coordinates per outward code, and converting to JSON.

## Provenance

- Upstream: <https://download.geonames.org/export/zip/GB.zip>, specifically its
  `GB.txt`; **not** the separate full-postcode `GB_full.csv.zip` dataset.
- Upstream format/license: <https://download.geonames.org/export/zip/readme.txt>.
- Retrieved on 2026-09-18 from the availability mirror maintained for pgeocode:
  <https://github.com/symerio/postal-codes-data>.
- Pinned file:
  <https://github.com/symerio/postal-codes-data/blob/3a94317a6192e7e576c078538dfe665048d42edf/data/geonames/GB.txt>.
- Mirror update commit: `3a94317a6192e7e576c078538dfe665048d42edf`, **2024-04-12**.
  This is a dated snapshot, not a claim of current exhaustive coverage.
- Git source blob SHA-1: `cb6ca6b43d81692b7ae871c49a69dee2f20e8ce1`.
- Source SHA-256: `c6363f0e2945c85dceb5fe46751ade3caba2b7401c020c0801b57d431dfac8fd`.
- Output SHA-256: `3a72d6c427694926ed35cc1f88e1120a978eda2363ebc3eb2e966557a133becf`.
- The mirror README explicitly redistributes GeoNames data under CC BY 4.0.
  Its `scripts/01_sync_data.py` downloads the coarse upstream archives and
  extracts their text files without transforming them.

## Transformation and limits

The source contains 27,450 place rows. Excluding 106 `IM`, `GY`, and `JE` rows
(Crown Dependencies, outside this UK feature) and the unsupported `W1M` row
leaves 27,343 rows and **2,978 unique outward codes**, including **81 Northern
Ireland `BT` codes**. England,
Scotland, Wales, and Northern Ireland are all represented. `GIR` is absent;
unlisted codes remain unknown, with no guessed coordinates or prefix fallback.

The source includes one old Marylebone `W1M` record at `[51.5,-0.15]`. `W1M`
does not match the supported outward-code forms, so the generator excludes it
instead of weakening full-postcode validation or guessing a replacement. This
specific exclusion is not proof that every remaining source area is current.

Every retained source row has the expected 12 fields, country `GB`, coarse-code
syntax, and finite coordinates within broad UK bounds. Duplicate coordinate
pairs within an outward code are removed. The coordinate pairs are sorted,
then their latitude and longitude are averaged separately and rounded to six
decimal places. This is an **approximate area representative**, not an official
boundary centroid or an address point. GeoNames itself includes estimated
coordinates. More decimal places do not imply precise distance calculations.

Examples: `SW1A` → `[51.5018,-0.1328]`; `BT1` → `[54.5833,-5.9333]`;
`EH1` → `[55.9521,-3.1965]`; `CF10` → `[51.48,-3.18]`.

The regeneration script was run against the pinned source on Node 22.23.2;
its output matched the checked-in JSON byte-for-byte. The source's computed
Git blob hash matched GitHub's metadata.

## Intentional updates

Download the coarse upstream archive, or obtain the pinned text file above for
reproduction. Inspect its date/license and retain a hash of the source. Run:

```sh
node scripts/build-gb-postal-areas.mjs /path/to/GB.txt
```

The script is offline and prints source/output hashes and counts. Compare the
output diff, review added/removed areas and coordinate movement, rerun location
tests, and update the provenance/counts in this file. Do not substitute a full
postcode archive: both its precision and licensing need a separate decision.
