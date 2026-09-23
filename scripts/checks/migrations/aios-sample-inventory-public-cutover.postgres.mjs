#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  applySampleInventoryPublicCutover,
  prepareSampleInventoryPublicCutover,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_BASE_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET,
  verifySampleInventoryPublicCutover,
} from '../../lib/migrations/aios-sample-inventory-public-cutover.mjs';

const DATABASE_URL = process.env.SAMPLE_INVENTORY_PUBLIC_CUTOVER_TEST_DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('SAMPLE_INVENTORY_PUBLIC_CUTOVER_TEST_DATABASE_URL is required.');
}

const DATABASE_NAME = 'sample_inventory_fixture';
const GIT_SHA = 'a'.repeat(40);
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const migrationSql = readFileSync(SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.relativePath, 'utf8');
const baseHealthCheckSql = readFileSync(
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_BASE_HEALTH_CHECK_PATH,
  'utf8',
);
const healthCheckSql = readFileSync(SAMPLE_INVENTORY_PUBLIC_CUTOVER_HEALTH_CHECK_PATH, 'utf8');

function prepared({
  command,
  expectedDatabaseIdentitySha256 = null,
  effectiveHealthCheckSql = healthCheckSql,
}) {
  return prepareSampleInventoryPublicCutover({
    baseHealthCheckSql,
    command,
    expectedDatabase: DATABASE_NAME,
    expectedDatabaseIdentitySha256,
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    healthCheckSql: effectiveHealthCheckSql,
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSql,
    records,
  });
}

const { default: pg } = await import('pg');
const client = new pg.Client({
  application_name: 'aios-sample-inventory-public-cutover-disposable-proof-v1',
  connectionString: DATABASE_URL,
});

await client.connect();
try {
  const verifyPrepared = prepared({ command: 'verify' });
  const initialVerify = await verifySampleInventoryPublicCutover({ client, prepared: verifyPrepared });
  assert.equal(initialVerify.status, 'ready_for_apply');
  assert.equal(initialVerify.ready, true);
  assert.equal(initialVerify.policy.databaseWrites, false);
  assert.equal(initialVerify.policy.transactionIdAssigned, false);
  assert.equal(initialVerify.policy.rolledBack, true);

  const databaseIdentitySha256 = initialVerify.database.identitySha256;
  const failingPrepared = prepared({
    command: 'apply',
    expectedDatabaseIdentitySha256: databaseIdentitySha256,
    effectiveHealthCheckSql: `${healthCheckSql}\nSELECT sample_inventory.fixture_missing_health_check();`,
  });
  let injectedFailure;
  try {
    await applySampleInventoryPublicCutover({ client, prepared: failingPrepared });
  } catch (error) {
    injectedFailure = error;
  }
  assert.ok(injectedFailure instanceof Error, 'injected health failure must reject');
  assert.equal(injectedFailure.cutoverStage, 'execute_health_check');
  assert.equal(injectedFailure.cutoverCommitted, false);
  assert.equal(injectedFailure.cutoverMigrationBodyExecuted, true);

  const rollbackState = await client.query(`
    SELECT
      to_regclass('sample_inventory.mutation_requests') IS NULL AS mutation_table_absent,
      to_regclass('sample_inventory.idx_sample_inventory_mutation_actor_created') IS NULL AS mutation_index_absent,
      to_regclass('public.aios_schema_migrations') IS NULL AS ledger_absent,
      (
        SELECT regexp_replace(COALESCE(column_default, ''), '[[:space:]()]|::integer', '', 'g')
        FROM information_schema.columns
        WHERE table_schema = 'sample_inventory'
          AND table_name = 'settings'
          AND column_name = 'low_stock_threshold'
      ) = '10' AS threshold_default_restored,
      EXISTS (
        SELECT 1
        FROM sample_inventory.settings
        WHERE id = 1
          AND low_stock_threshold = 10
          AND version = 1
          AND created_by = 'system'
          AND updated_by = 'system'
      ) AS pristine_settings_restored
  `);
  assert.deepEqual(rollbackState.rows[0], {
    ledger_absent: true,
    mutation_index_absent: true,
    mutation_table_absent: true,
    pristine_settings_restored: true,
    threshold_default_restored: true,
  });

  const verifyAfterRollback = await verifySampleInventoryPublicCutover({
    client,
    prepared: verifyPrepared,
  });
  assert.equal(verifyAfterRollback.status, 'ready_for_apply');
  assert.equal(verifyAfterRollback.database.identitySha256, databaseIdentitySha256);

  const applyPrepared = prepared({ command: 'apply', expectedDatabaseIdentitySha256: databaseIdentitySha256 });
  const applied = await applySampleInventoryPublicCutover({ client, prepared: applyPrepared });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.policy.committed, true);
  assert.equal(applied.policy.migrationBodyExecuted, true);
  assert.equal(applied.policy.ledgerWrites, false);

  await client.query(healthCheckSql);
  const independentHealth = await client.query(`
    SELECT
      to_regclass('sample_inventory.mutation_requests') IS NOT NULL AS mutation_table_present,
      to_regclass('sample_inventory.idx_sample_inventory_mutation_actor_created') IS NOT NULL AS mutation_index_present,
      to_regclass('public.aios_schema_migrations') IS NULL AS ledger_absent,
      (SELECT COUNT(*)::INTEGER FROM sample_inventory.mutation_requests) AS mutation_rows,
      (SELECT low_stock_threshold FROM sample_inventory.settings WHERE id = 1) AS threshold,
      (SELECT version::INTEGER FROM sample_inventory.settings WHERE id = 1) AS settings_version
  `);
  assert.deepEqual(independentHealth.rows[0], {
    ledger_absent: true,
    mutation_index_present: true,
    mutation_rows: 0,
    mutation_table_present: true,
    settings_version: 2,
    threshold: 3,
  });

  const noOp = await applySampleInventoryPublicCutover({ client, prepared: applyPrepared });
  assert.equal(noOp.status, 'already_applied_healthy');
  assert.equal(noOp.policy.migrationBodyExecuted, false);
  assert.equal(noOp.policy.databaseWrites, false);
  assert.equal(noOp.policy.ledgerWrites, false);

  const finalVerify = await verifySampleInventoryPublicCutover({ client, prepared: verifyPrepared });
  assert.equal(finalVerify.status, 'catalog_complete');
  assert.equal(finalVerify.ready, true);
  assert.equal(finalVerify.topology.ledgerExists, false);

  console.log(
    '[aios-sample-inventory-public-cutover.postgres] OK: absent verify, injected rollback, apply, independent SQL health, ledger absence, and healthy no-op passed.',
  );
} finally {
  await client.end();
}
