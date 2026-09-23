#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fixture_id="$(docker run --detach --rm -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=aios_identity_fixture -p 127.0.0.1::5432 postgres:16-alpine)"
trap 'docker stop "$fixture_id" >/dev/null' EXIT
for _ in {1..30}; do
  if docker exec "$fixture_id" pg_isready -h 127.0.0.1 -U postgres -d aios_identity_fixture >/dev/null 2>&1; then break; fi
  sleep 1
done
fixture_port="$(docker port "$fixture_id" 5432/tcp | awk -F: '{print $NF}')"
AIOS_IDENTITY_FIXTURE_PORT="$fixture_port" etl/groland_postgres/.venv/bin/python - <<'PY'
import os
from pathlib import Path
import psycopg2
from psycopg2 import sql
names=['users','roles','permissions','user_roles','role_permissions','refresh_tokens','audit_logs']
c=psycopg2.connect(host='127.0.0.1',port=os.environ['AIOS_IDENTITY_FIXTURE_PORT'],user='postgres',password='fixture',dbname='aios_identity_fixture')
migration=Path('sql/migrations/025_aios_identity.sql').read_text()
with c, c.cursor() as q:
    for name in names:
        table=sql.Identifier('ods_datahub_'+name)
        q.execute(sql.SQL('CREATE TABLE {} (id SERIAL PRIMARY KEY, value TEXT UNIQUE)').format(table))
        q.execute(sql.SQL('INSERT INTO {} (value) VALUES (%s)').format(table),('retained',))
    q.execute('ALTER TABLE ods_datahub_user_roles ADD COLUMN user_id INT REFERENCES ods_datahub_users(id)')
    q.execute('UPDATE ods_datahub_user_roles SET user_id=1')
    q.execute("SELECT relname,oid FROM pg_class WHERE relname LIKE 'ods_datahub_%' AND relkind='r'")
    before=dict(q.fetchall())
    q.execute(migration)
    for name in names:
        old='ods_datahub_'+name;new='ods_aios_'+name
        q.execute('SELECT to_regclass(%s)::oid,to_regclass(%s)',(new,old))
        assert q.fetchone()==(before[old],None)
        q.execute(sql.SQL('SELECT id,value FROM {}').format(sql.Identifier(new)))
        assert q.fetchall()==[(1,'retained')]
    q.execute("INSERT INTO ods_aios_users (value) VALUES ('next') RETURNING id")
    assert q.fetchone()==(2,)
    q.execute('SELECT u.id FROM ods_aios_user_roles r JOIN ods_aios_users u ON u.id=r.user_id')
    assert q.fetchall()==[(1,)]
    q.execute(migration)
    q.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE '%datahub%'")
    assert q.fetchone()==(0,)
try:
    with c, c.cursor() as q:
        q.execute('CREATE TABLE ods_datahub_users (id INT)')
        q.execute(migration)
    raise AssertionError('collision was not rejected')
except psycopg2.errors.RaiseException:
    pass
with c, c.cursor() as q:
    q.execute("SELECT to_regclass('public.ods_datahub_users'),COUNT(*) FROM ods_aios_users")
    assert q.fetchone()==(None,2)
c.close()
print('PASS: seven tables preserve OIDs/rows, sequences and foreign keys; idempotence and collision rollback verified')
PY
