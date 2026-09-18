#!/usr/bin/env bash
# Authorized M22 production migration only. No fixtures, seed, reset, role
# changes, history repair, or application deployment. Run before the new app.
set -euo pipefail

pawmatch_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$pawmatch_root"
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ "${1:-}" == --apply && "$#" == 1 ]] \
  || fail 'Usage: bash scripts/publish-international-db.sh --apply (after the production baseline query).'
for dependency in node supabase; do
  command -v "$dependency" >/dev/null || fail "Missing development tool: $dependency"
done

check_release_files() {
  node <<'NODE'
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const expectedRef = 'iomaiasjqozunjbvsdsk';
const refPath = 'supabase/.temp/project-ref';
if (!fs.existsSync(refPath) || fs.readFileSync(refPath, 'utf8').trim() !== expectedRef) {
  throw new Error('This checkout must be deliberately linked to PawMatch project iomaiasjqozunjbvsdsk before release.');
}
const poolerPath = 'supabase/.temp/pooler-url';
if (fs.existsSync(poolerPath)) {
  let url;
  try { url = new URL(fs.readFileSync(poolerPath, 'utf8').trim()); }
  catch { throw new Error('The saved connection metadata is invalid; relink the verified project.'); }
  const direct = url.hostname === `db.${expectedRef}.supabase.co` && url.username === 'postgres';
  const pooler = /^aws-\d+-[a-z]{2}(?:-gov)?-[a-z]+-\d+\.pooler\.supabase\.com$/.test(url.hostname)
    && url.username === `postgres.${expectedRef}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres'
      || !['', '5432', '6543'].includes(url.port) || url.search || url.hash || !(direct || pooler)) {
    throw new Error('Saved connection metadata does not match the verified project.');
  }
}
const file = 'supabase/migrations/20260918120000_international_listings.sql';
const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash !== '7c27032c451c5d9d6ae4332354b31c614cdfa03dacb022655a9ba2c652f4f661') {
  throw new Error('M22 differs from the reviewed and locally verified migration; stop for review.');
}
NODE
}
check_release_files

# Independently verify the database host embedded in the current live app.
# Only same-site public pages/scripts are read; script contents are not executed
# and public keys or page bodies are never printed or saved.
node --input-type=module <<'NODE'
const expectedRef = 'iomaiasjqozunjbvsdsk';
const allowedHosts = new Set(['joinpawmatch.com', 'www.joinpawmatch.com']);
async function readSite(url, hops = 0) {
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || hops > 4) {
    throw new Error('Unexpected live-site address; stop and verify production configuration.');
  }
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Live-site redirect has no destination.');
    return readSite(new URL(location, url), hops + 1);
  }
  if (!response.ok) throw new Error(`Live-site verification failed (${response.status}).`);
  return { url, body: await response.text() };
}
const scripts = new Set();
for (const path of ['/', '/login']) {
  const page = await readSite(new URL(path, 'https://joinpawmatch.com'));
  for (const match of page.body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), page.url);
    if (allowedHosts.has(url.hostname) && url.pathname.startsWith('/_next/static/')) scripts.add(url.href);
  }
}
if (!scripts.size || scripts.size > 80) throw new Error('Could not identify a bounded set of live application scripts.');
const refs = new Set();
const addresses = [...scripts];
for (let start = 0; start < addresses.length; start += 4) {
  const pages = await Promise.all(addresses.slice(start, start + 4).map((address) => readSite(new URL(address))));
  for (const { body } of pages) {
    for (const match of body.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) refs.add(match[1]);
  }
}
if (refs.size !== 1 || !refs.has(expectedRef)) {
  throw new Error('The live application database could not be matched to the linked project. No migration was applied.');
}
console.log(`Verified current joinpawmatch.com database: ${expectedRef}.`);
NODE

pawmatch_tmp=$(mktemp -d "${TMPDIR:-/tmp}/pawmatch-m22-release.XXXXXX")
trap 'rm -rf "$pawmatch_tmp"' EXIT
supabase --workdir "$pawmatch_root" db push --linked --dry-run > "$pawmatch_tmp/dry-run.log" 2>&1 \
  || fail 'Hosted migration dry run failed. No migration was applied by this script.'
node - "$pawmatch_tmp/dry-run.log" <<'NODE'
const fs = require('node:fs');
// Parse the CLI's pending section, not filenames in skipped/already-applied
// notices. This heading and bullet format is verified in installed CLI 2.115.0.
const text = fs.readFileSync(process.argv[2], 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
const lines = text.split(/\r?\n/);
const headings = lines.flatMap((line, index) => line.trim() === 'Would push these migrations:' ? [index] : []);
const files = [];
if (headings.length === 1) {
  for (const line of lines.slice(headings[0] + 1)) {
    if (!/^\s*\u2022\s/.test(line)) break;
    const match = line.match(/^\s*\u2022\s+(\d{14}_[A-Za-z0-9_-]+\.sql)\s*$/);
    if (!match) throw new Error('Unrecognized pending-migration output; inspect the CLI plan before continuing.');
    files.push(match[1]);
  }
}
if (headings.length !== 1 || files.length !== 1 || files[0] !== '20260918120000_international_listings.sql'
    || /Would (?:seed these files|create custom roles)/.test(text)) {
  throw new Error('Expected only M22 pending. If it is already applied or any other migration is pending, inspect history before continuing.');
}
console.log('Dry run confirmed M22 is the only pending migration.');
NODE
check_release_files
supabase --workdir "$pawmatch_root" db push --linked --yes
printf 'M22 migration command completed. Run docs/sql/m22-production-after.sql and compare the baseline before deploying the application.\n'
