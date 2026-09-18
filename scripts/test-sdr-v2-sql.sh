#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
data_dir="$test_root/postgres"
socket_dir="$test_root/socket"
database_name="sdr_v2_test"
port="55439"

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then
    pg_ctl -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT

mkdir -p "$socket_dir"
initdb -D "$data_dir" --auth=trust --no-locale --encoding=UTF8 >/dev/null
pg_ctl -D "$data_dir" \
  -o "-F -c listen_addresses='' -k '$socket_dir' -p $port" \
  -l "$test_root/postgres.log" -w start >/dev/null || {
    cat "$test_root/postgres.log" >&2
    exit 1
  }

createdb -h "$socket_dir" -p "$port" "$database_name"

psql_args=(
  -X
  --set ON_ERROR_STOP=1
  --host "$socket_dir"
  --port "$port"
  --dbname "$database_name"
)

psql "${psql_args[@]}" --file "$repo_dir/supabase/tests/fixtures/sdr_v2_bootstrap.sql" >/dev/null
psql "${psql_args[@]}" --file "$repo_dir/sql/leads.sql" >/dev/null

mapfile -t migrations < <(
  find "$repo_dir/supabase/migrations" -maxdepth 1 -type f \
    -name '*_add_sdr_v2_tracker.sql' 2>/dev/null | sort
)

for migration in "${migrations[@]}"; do
  psql "${psql_args[@]}" --file "$migration" >/dev/null
done

psql "${psql_args[@]}" --file "$repo_dir/supabase/tests/sdr_v2_tracker.sql"
