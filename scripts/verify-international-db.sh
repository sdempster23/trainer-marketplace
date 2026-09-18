#!/usr/bin/env bash
# Local M22 verification only. Never resets the database, loads seed.sql,
# contacts a linked project, or repairs migration history by hand.
set -euo pipefail

pawmatch_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$pawmatch_root"
for dependency in node docker supabase; do
  command -v "$dependency" >/dev/null || {
    printf 'Missing %s. Install the existing development tools before continuing.\n' "$dependency" >&2
    exit 1
  }
done

fail() { printf '%s\n' "$*" >&2; exit 1; }

# Read environment files as data, never execute/source them or print secrets.
# The database commands below also explicitly select the local target.
node <<'NODE'
const fs = require('node:fs');
const { parseEnv } = require('node:util');
function fail(message) { console.error(message); process.exit(1); }
if (typeof parseEnv !== 'function') fail('Use Node 22 or newer for this verification script.');
if (!fs.existsSync('.env.local')) fail('The local development environment file is missing.');
const env = { ...parseEnv(fs.readFileSync('.env.local', 'utf8')), ...process.env };
let url;
try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL); } catch { fail('The development database address is invalid.'); }
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.port !== '54321' || url.username || url.password) {
  fail('Stopped: the development app must point to local Supabase on port 54321.');
}
if (env.RESEND_API_KEY && !env.RESEND_API_KEY.includes('<')) {
  fail('Stopped: development email must use log mode before database verification.');
}
const config = fs.readFileSync('supabase/config.toml', 'utf8');
const dbSection = config.split(/^\[db\]\s*$/m)[1]?.split(/^\[/m)[0];
if (!/^project_id\s*=\s*"trainer-marketplace"\s*$/m.test(config)
    || !/^port\s*=\s*54322\s*$/m.test(dbSection ?? '')) {
  fail('Stopped: expected the existing trainer-marketplace local database configuration.');
}
console.log('Confirmed local development database and email log mode.');
NODE

# Reject remote Docker contexts too: docker exec must address this Mac.
pawmatch_context=$(docker context show)
pawmatch_endpoint=$(docker context inspect "$pawmatch_context" --format '{{.Endpoints.docker.Host}}')
case "$pawmatch_endpoint" in unix://*) ;; *) fail 'Stopped: Docker must use a local Unix socket.' ;; esac
[[ -S "${pawmatch_endpoint#unix://}" ]] || fail 'Docker Desktop is not running on its local socket.'
pawmatch_docker=(docker --context "$pawmatch_context")
pawmatch_db=supabase_db_trainer-marketplace
[[ "$("${pawmatch_docker[@]}" inspect "$pawmatch_db" --format '{{.State.Running}}')" == true ]] \
  || fail 'The existing local Supabase database is not running. Start the usual development stack, then rerun.'

# Keep Supabase CLI on the exact same local Docker endpoint as the checks.
unset DOCKER_CONTEXT
export DOCKER_HOST="$pawmatch_endpoint"
pawmatch_tmp=$(mktemp -d "${TMPDIR:-/tmp}/pawmatch-international-db.XXXXXX")
pawmatch_types_tmp=''
cleanup() {
  [[ -z "$pawmatch_types_tmp" ]] || rm -f "$pawmatch_types_tmp"
  rm -rf "$pawmatch_tmp"
}
trap cleanup EXIT

# A Unix socket INSIDE the verified local container cannot target a hosted DB.
local_psql() {
  "${pawmatch_docker[@]}" exec -i "$pawmatch_db" psql -X \
    -h /var/run/postgresql -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
[[ "$(local_psql -Atc 'select inet_server_addr() is null')" == t ]] \
  || fail 'Stopped: database connection was not a local container socket.'
"${pawmatch_docker[@]}" inspect "$pawmatch_db" --format '{{json .NetworkSettings.Ports}}' > "$pawmatch_tmp/ports.json"
node - "$pawmatch_tmp/ports.json" <<'NODE'
const fs = require('node:fs');
const ports = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!(ports['5432/tcp'] ?? []).some((p) => p.HostPort === '54322'
    && ['127.0.0.1', '0.0.0.0', '::1', '::'].includes(p.HostIp))) {
  throw new Error('Expected the existing database to be reachable locally on port 54322.');
}
NODE

check_pending() {
  local_psql -Atc 'select version from supabase_migrations.schema_migrations order by version' > "$pawmatch_tmp/versions.txt"
  node - "$pawmatch_tmp/versions.txt" <<'NODE'
const fs = require('node:fs');
const applied = fs.readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n/).filter(Boolean);
const files = fs.readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
const local = files.map((name) => {
  const match = /^(\d{14})_.+\.sql$/.exec(name);
  if (!match) throw new Error('Unexpected migration filename; review the local migration list.');
  return match[1];
});
if (new Set(local).size !== local.length || applied.some((v) => !local.includes(v))) {
  throw new Error('Local migration history differs from this checkout; review it before continuing.');
}
const pending = local.filter((v) => !applied.includes(v));
if (!applied.includes('20260917120000')
    || pending.some((v) => v !== '20260918120000')) {
  throw new Error('Stopped: only M22 may be pending. Other migrations need a separate review.');
}
console.log(pending.length === 1 ? 'pending' : 'applied');
NODE
}

pawmatch_state=$(check_pending)
if [[ "$pawmatch_state" == pending ]]; then
  printf 'Checking the regression fails for the missing international columns.\n'
  if local_psql -f - < supabase/tests/m22_international/international.sql > "$pawmatch_tmp/before.log" 2>&1; then
    fail 'The pre-migration check unexpectedly passed. Review the schema before applying M22.'
  fi
  node - "$pawmatch_tmp/before.log" <<'NODE'
const fs = require('node:fs');
const result = fs.readFileSync(process.argv[2], 'utf8');
if (!/column "country_code" does not exist/.test(result)) {
  throw new Error('Pre-migration check failed for an unexpected reason; M22 was not applied.');
}
NODE
  printf 'Rehearsing the migration and legacy-data checks, then rolling back.\n'
  cat supabase/tests/m22_international/upgrade_before.sql \
      supabase/migrations/20260918120000_international_listings.sql \
      supabase/tests/m22_international/upgrade_after.sql | local_psql -f -

  [[ "$(check_pending)" == pending ]] || fail 'Migration state changed during verification. Rerun after reviewing it.'
  supabase --workdir "$pawmatch_root" db push --local --dry-run > "$pawmatch_tmp/dry-run.log" 2>&1 \
    || fail 'The local migration dry run failed; no migration was applied.'
  node - "$pawmatch_tmp/dry-run.log" <<'NODE'
const fs = require('node:fs');
const output = fs.readFileSync(process.argv[2], 'utf8');
const names = [...new Set(output.match(/\d{14}_[A-Za-z0-9_-]+\.sql/g) ?? [])];
if (names.length !== 1 || names[0] !== '20260918120000_international_listings.sql') {
  throw new Error('Dry run did not identify M22 as the only pending migration; nothing was applied.');
}
NODE
  printf 'Applying M22 to the existing local database only.\n'
  supabase --workdir "$pawmatch_root" db push --local --yes
  [[ "$(check_pending)" == applied ]] || fail 'M22 was not recorded as applied. Review the local migration result.'
else
  printf 'M22 is already applied locally; checking its behavior.\n'
fi

local_psql -f - < supabase/tests/m22_international/international.sql
local_psql -f - < supabase/tests/m14_service_role_grants/grants.sql

printf 'Generating types from the verified local schema.\n'
pawmatch_types_tmp=$(mktemp "$pawmatch_root/types/.supabase.generated.XXXXXX")
supabase --workdir "$pawmatch_root" gen types --local --lang typescript \
  --schema public,graphql_public > "$pawmatch_types_tmp"
node - "$pawmatch_types_tmp" <<'NODE'
const fs = require('node:fs');
const ts = require('typescript');
const text = fs.readFileSync(process.argv[2], 'utf8');
const parsed = ts.createSourceFile('supabase.ts', text, ts.ScriptTarget.Latest, true);
if (parsed.parseDiagnostics.length || !text.includes('export type Database')
    || !['currency_code', 'country_code', 'postal_area', 'nearby_trainers_v2'].every((key) => text.includes(key))) {
  throw new Error('Generated types were incomplete or invalid; the existing types file was preserved.');
}
NODE
mv "$pawmatch_types_tmp" "$pawmatch_root/types/supabase.ts"
pawmatch_types_tmp=''
printf 'Local database checks passed and schema types were regenerated. No hosted changes were made.\n'
