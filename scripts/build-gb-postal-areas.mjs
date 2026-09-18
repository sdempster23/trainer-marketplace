import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Input is the coarse GeoNames GB.txt, never GB_full.csv. Keep source/license
// provenance alongside the output. This script makes no network requests.
const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? "lib/location/data/gb-postal-areas.json";
if (!sourcePath) throw new Error("Usage: node scripts/build-gb-postal-areas.mjs GB.txt [output.json]");
const source = await readFile(sourcePath);
const groups = new Map();
let excludedRows = 0;
let excludedUnsupportedRows = 0;
const lines = source.toString("utf8").trimEnd().split(/\r?\n/);
for (const [index, line] of lines.entries()) {
  const row = line.split("\t");
  if (row.length !== 12 || row[0] !== "GB") throw new Error(`Invalid GB source row ${index + 1}`);
  const code = row[1];
  // Crown Dependencies have their own ISO countries; they are not UK listings.
  if (/^(IM|GY|JE)/.test(code)) {
    excludedRows++;
    continue;
  }
  // The pinned source retains this old Marylebone code, which does not match
  // the supported outward-code forms. Do not weaken full-postcode validation
  // or invent a replacement location for it.
  if (code === "W1M") {
    excludedUnsupportedRows++;
    continue;
  }
  if (!/^(GIR|[A-Z]{1,2}[0-9][0-9A-Z]?)$/.test(code)) {
    throw new Error(`Expected a coarse outward code at row ${index + 1}`);
  }
  const lat = Number(row[9]);
  const lng = Number(row[10]);
  if (!row[9] || !row[10] || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < 49 || lat > 62 || lng < -9 || lng > 2) {
    throw new Error(`Invalid UK coordinate at row ${index + 1}`);
  }
  if (!groups.has(code)) groups.set(code, new Map());
  groups.get(code).set(`${lat},${lng}`, [lat, lng]);
}
const result = {};
for (const code of [...groups.keys()].sort()) {
  const coordinates = [...groups.get(code).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  result[code] = [0, 1].map((axis) => Number(
    (coordinates.reduce((sum, point) => sum + point[axis], 0) / coordinates.length).toFixed(6),
  ));
}
if (!result.SW1A || !result.BT1 || !result.EH1 || !result.CF10) {
  throw new Error("Source must include England, Northern Ireland, Scotland, and Wales examples");
}
const output = "{\n" + Object.entries(result)
  .map(([code, point]) => `  ${JSON.stringify(code)}: ${JSON.stringify(point)}`)
  .join(",\n") + "\n}\n";
await writeFile(outputPath, output);
console.log(JSON.stringify({
  sourceRows: lines.length,
  sourceGitBlobSha: createHash("sha1").update(`blob ${source.length}\0`).update(source).digest("hex"),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  outwardCodes: Object.keys(result).length,
  northernIrelandOutwardCodes: Object.keys(result).filter((code) => code.startsWith("BT")).length,
  excludedDependencyRows: excludedRows,
  excludedUnsupportedRows,
  outputSha256: createHash("sha256").update(output).digest("hex"),
}, null, 2));
