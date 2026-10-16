#!/usr/bin/env bash
# Applies migration 036 to a throwaway Postgres and runs the recruiting
# SQL contract plus the ignored Rust repository tests.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fixture_id="$(docker run --detach --rm --name "aios-recruiting-test-$$" -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=recruiting_fixture -p 127.0.0.1::5432 postgres:16-alpine)"
trap 'docker stop "$fixture_id" >/dev/null' EXIT
for _ in {1..30}; do
  if docker exec "$fixture_id" pg_isready -h 127.0.0.1 -U postgres -d recruiting_fixture >/dev/null 2>&1; then break; fi
  sleep 1
done
fixture_port="$(docker port "$fixture_id" 5432/tcp | awk -F: '{print $NF}')"
export RECRUITING_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:${fixture_port}/recruiting_fixture"
psql_fixture() { docker exec -i "$fixture_id" psql -U postgres -d recruiting_fixture -v ON_ERROR_STOP=1 "$@"; }
psql_fixture -c 'CREATE SCHEMA ads;'
psql_fixture < sql/migrations/036_recruiting_test_submissions.sql
psql_fixture < etl/groland_postgres/tests/sql/recruiting_test_submissions_contract.sql
psql_fixture < sql/migrations/037_recruiting_question_set_v2.sql
psql_fixture < etl/groland_postgres/tests/sql/recruiting_question_set_v2_contract.sql
psql_fixture < sql/migrations/038_recruiting_video_practice_v3.sql
psql_fixture < sql/migrations/039_recruiting_candidate_major.sql
psql_fixture < etl/groland_postgres/tests/sql/recruiting_candidate_major_contract.sql
psql_fixture < etl/groland_postgres/tests/sql/recruiting_question_set_v2_contract.sql
psql_fixture < etl/groland_postgres/tests/sql/recruiting_question_set_v3_contract.sql
bash scripts/backend-rust/cargo-with-cache.sh test recruiting::postgres_tests -- --ignored
