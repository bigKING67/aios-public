#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
  AGENT_CONTEXT_CUTOVER_TARGETS,
  applyAgentContextCutover,
  prepareAgentContextCutover,
  verifyAgentContextCutover,
} from '../../lib/migrations/aios-agent-context-cutover.mjs';

const DATABASE_URL = process.env.AIOS_AGENT_CONTEXT_CUTOVER_TEST_DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('AIOS_AGENT_CONTEXT_CUTOVER_TEST_DATABASE_URL is required.');
}

const DATABASE_NAME = process.env.AIOS_AGENT_CONTEXT_CUTOVER_TEST_DATABASE?.trim()
  || 'agent_context_cutover_fixture';
const GIT_SHA = 'a'.repeat(40);
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const migrationSqlByIdentity = Object.fromEntries(
  AGENT_CONTEXT_CUTOVER_TARGETS.map((target) => [
    target.identity,
    readFileSync(target.relativePath, 'utf8'),
  ]),
);

function prepared({ command, expectedDatabaseIdentitySha256 = null }) {
  return prepareAgentContextCutover({
    command,
    expectedBundleSha256: AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
    expectedDatabase: DATABASE_NAME,
    expectedDatabaseIdentitySha256,
    expectedGitSha: GIT_SHA,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSqlByIdentity,
    records,
  });
}

const { default: pg } = await import('pg');
const client = new pg.Client({
  application_name: 'aios-agent-context-cutover-disposable-proof-v1',
  connectionString: DATABASE_URL,
});

await client.connect();
try {
  await client.query(`
    CREATE TABLE auth_permissions (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `);

  const verifyPrepared = prepared({ command: 'verify' });
  const initialVerify = await verifyAgentContextCutover({ client, prepared: verifyPrepared });
  assert.equal(initialVerify.status, 'ready_for_apply');
  assert.equal(initialVerify.ready, true);
  assert.equal(initialVerify.topology.schemaEffectsPresent, 0);
  assert.equal(initialVerify.topology.ledgerExists, false);
  assert.equal(initialVerify.policy.databaseWrites, false);
  assert.equal(initialVerify.policy.transactionIdAssigned, false);

  const databaseIdentitySha256 = initialVerify.database.identitySha256;
  const applyPrepared = prepared({
    command: 'apply',
    expectedDatabaseIdentitySha256: databaseIdentitySha256,
  });
  const invalidPrepared = {
    ...applyPrepared,
    migration: {
      ...applyPrepared.migration,
      sql: `${applyPrepared.migration.sql}\nSELECT public.agent_context_cutover_missing_fixture();`,
    },
  };
  let injectedFailure;
  try {
    await applyAgentContextCutover({ client, prepared: invalidPrepared });
  } catch (error) {
    injectedFailure = error;
  }
  assert.ok(injectedFailure instanceof Error, 'injected migration failure must reject');
  assert.equal(injectedFailure.cutoverStage, 'execute_migration');
  assert.equal(injectedFailure.cutoverCommitted, false);
  assert.equal(injectedFailure.cutoverMigrationBodyExecuted, false);
  const rollbackState = await client.query(`
    SELECT
      to_regclass('public.agent_accounts') IS NULL AS accounts_absent,
      to_regclass('public.agent_candidate_sources') IS NULL AS sources_absent,
      to_regclass('public.aios_schema_migrations') IS NULL AS ledger_absent,
      (SELECT COUNT(*)::INTEGER FROM auth_permissions WHERE key LIKE 'agent:%') AS permission_rows
  `);
  assert.deepEqual(rollbackState.rows[0], {
    accounts_absent: true,
    ledger_absent: true,
    permission_rows: 0,
    sources_absent: true,
  });

  const applied = await applyAgentContextCutover({ client, prepared: applyPrepared });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.policy.committed, true);
  assert.equal(applied.policy.migrationBodyExecuted, true);
  assert.equal(applied.policy.ledgerWrites, false);
  assert.equal(applied.topology.after.catalogComplete, true);

  const independentHealth = await client.query(`
    SELECT
      to_regclass('public.agent_accounts') IS NOT NULL AS accounts_present,
      to_regclass('public.agent_candidate_sources') IS NOT NULL AS sources_present,
      to_regclass('public.aios_schema_migrations') IS NULL AS ledger_absent,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'agent_candidate_sources_immutable'
          AND tgrelid = 'public.agent_candidate_sources'::regclass
          AND NOT tgisinternal
      ) AS immutable_trigger_present,
      (SELECT COUNT(*)::INTEGER FROM auth_permissions WHERE key LIKE 'agent:%') AS permission_rows
  `);
  assert.deepEqual(independentHealth.rows[0], {
    accounts_present: true,
    immutable_trigger_present: true,
    ledger_absent: true,
    permission_rows: 7,
    sources_present: true,
  });

  const noOp = await applyAgentContextCutover({ client, prepared: applyPrepared });
  assert.equal(noOp.status, 'already_applied_healthy');
  assert.equal(noOp.policy.databaseWrites, false);
  assert.equal(noOp.policy.migrationBodyExecuted, false);

  const finalVerify = await verifyAgentContextCutover({ client, prepared: verifyPrepared });
  assert.equal(finalVerify.status, 'catalog_complete');
  assert.equal(finalVerify.ready, true);
  assert.equal(finalVerify.topology.catalogComplete, true);
  assert.equal(finalVerify.topology.ledgerExists, false);

  console.log(
    '[aios-agent-context-cutover.postgres] OK: read-only verify, atomic three-migration rollback/apply, independent catalog health, ledger absence, and no-op passed.',
  );
} finally {
  await client.end();
}
