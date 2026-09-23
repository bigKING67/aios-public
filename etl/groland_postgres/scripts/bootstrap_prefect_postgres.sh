#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" -ne 0 && "${ALLOW_NON_ROOT_PREFECT_DB_BOOTSTRAP:-0}" != "1" ]]; then
  echo "Run as root or set ALLOW_NON_ROOT_PREFECT_DB_BOOTSTRAP=1 for a controlled fixture." >&2
  exit 1
fi

PSQL_BIN="${PSQL_BIN:-psql}"
PREFECT_DB_NAME="${PREFECT_DB_NAME:-aios_prefect}"
PREFECT_DB_ROLE="${PREFECT_DB_ROLE:-aios_prefect}"

: "${PREFECT_DB_PASSWORD:?Missing PREFECT_DB_PASSWORD}"

prefect_db_password_b64="$(
  printf '%s' "$PREFECT_DB_PASSWORD" |
    base64 |
    tr -d '\r\n'
)"
prefect_pgoptions="${PGOPTIONS:-}"
if [[ -n "$prefect_pgoptions" ]]; then
  prefect_pgoptions+=" "
fi
prefect_pgoptions+="-c aios.prefect_db_password_b64=$prefect_db_password_b64"

identifier_pattern='^[A-Za-z_][A-Za-z0-9_]{0,62}$'
for value in "$PREFECT_DB_NAME" "$PREFECT_DB_ROLE"; do
  if [[ ! "$value" =~ $identifier_pattern ]]; then
    echo "Invalid PostgreSQL identifier: $value" >&2
    exit 1
  fi
done

PREFECT_DB_PASSWORD= PGOPTIONS="$prefect_pgoptions" "$PSQL_BIN" --set ON_ERROR_STOP=1 \
  --set prefect_db_name="$PREFECT_DB_NAME" \
  --set prefect_db_role="$PREFECT_DB_ROLE" <<'SQL'
SELECT convert_from(
  decode(current_setting('aios.prefect_db_password_b64'), 'base64'),
  'UTF8'
) AS prefect_db_password \gset

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'prefect_db_role',
  :'prefect_db_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'prefect_db_role'
) \gexec

ALTER ROLE :"prefect_db_role"
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE :"prefect_db_role" PASSWORD :'prefect_db_password';

SELECT format(
  'DO $guard$ BEGIN RAISE EXCEPTION %L; END $guard$;',
  format('Prefect role %s must not inherit membership in another role', :'prefect_db_role')
)
WHERE EXISTS (
  SELECT 1
  FROM pg_auth_members
  WHERE member = (SELECT oid FROM pg_roles WHERE rolname = :'prefect_db_role')
) \gexec

SELECT format(
  'CREATE DATABASE %I OWNER %I',
  :'prefect_db_name',
  :'prefect_db_role'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'prefect_db_name'
) \gexec

SELECT format(
  'ALTER DATABASE %I OWNER TO %I',
  :'prefect_db_name',
  :'prefect_db_role'
) \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'prefect_db_name') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', :'prefect_db_name', :'prefect_db_role') \gexec
SQL

unset PREFECT_DB_PASSWORD prefect_db_password_b64 prefect_pgoptions

"$PSQL_BIN" --set ON_ERROR_STOP=1 --dbname "$PREFECT_DB_NAME" \
  --set prefect_db_role="$PREFECT_DB_ROLE" <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"prefect_db_role";
SQL

echo "Prefect PostgreSQL bootstrap: PASS database=$PREFECT_DB_NAME role=$PREFECT_DB_ROLE"
