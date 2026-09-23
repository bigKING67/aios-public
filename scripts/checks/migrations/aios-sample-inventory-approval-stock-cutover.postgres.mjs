#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  applySampleInventoryApprovalStockCutover,
  prepareSampleInventoryApprovalStockCutover,
  SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET,
  verifySampleInventoryApprovalStockCutover,
} from '../../lib/migrations/aios-sample-inventory-approval-stock-cutover.mjs';

const DATABASE_URL = process.env.SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TEST_DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TEST_DATABASE_URL is required.');
}

const DATABASE_NAME = 'sample_inventory_fixture';
const GIT_SHA = 'a'.repeat(40);
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const migrationSql = readFileSync(SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.relativePath, 'utf8');
const healthCheckSql = readFileSync(SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_HEALTH_CHECK_PATH, 'utf8');

function prepared({ command, expectedDatabaseIdentitySha256 = null, effectiveHealthCheckSql = healthCheckSql }) {
  return prepareSampleInventoryApprovalStockCutover({
    command,
    expectedDatabase: DATABASE_NAME,
    expectedDatabaseIdentitySha256,
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    healthCheckSql: effectiveHealthCheckSql,
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSql,
    records,
  });
}

const { default: pg } = await import('pg');
const client = new pg.Client({
  application_name: 'aios-sample-inventory-approval-stock-cutover-disposable-proof-v1',
  connectionString: DATABASE_URL,
});

await client.connect();
try {
  const sample = await client.query(`
    INSERT INTO sample_inventory.samples (
      sample_code, sample_name, on_hand_quantity, reserved_quantity,
      created_by, updated_by
    ) VALUES ('APPROVAL-CUTOVER', 'Approval cutover fixture', 20, 3, 'fixture', 'fixture')
    RETURNING id
  `);
  const sampleId = sample.rows[0].id;
  const outbound = await client.query(`
    INSERT INTO sample_inventory.outbound_requests (
      sample_id, quantity, applicant, department, purpose, status,
      approved_at, approved_by, created_by, updated_by
    ) VALUES ($1, 4, 'Fixture', 'QA', 'Approval cutover proof', 'approved',
      NOW(), 'fixture', 'fixture', 'fixture')
    RETURNING id
  `, [sampleId]);
  const outboundId = outbound.rows[0].id;

  const verifyPrepared = prepared({ command: 'verify' });
  const initialVerify = await verifySampleInventoryApprovalStockCutover({
    client,
    prepared: verifyPrepared,
  });
  assert.equal(initialVerify.status, 'ready_for_apply');
  assert.equal(initialVerify.ready, true);
  assert.equal(initialVerify.topology.activeApprovedRequests, 1);
  assert.equal(initialVerify.topology.pendingDebitRequests, 1);
  assert.equal(initialVerify.topology.pendingDebitQuantity, 4);
  assert.equal(initialVerify.topology.affectedSamples, 1);
  assert.equal(initialVerify.topology.violatingSamples, 0);
  assert.equal(initialVerify.policy.databaseWrites, false);
  assert.equal(initialVerify.policy.transactionIdAssigned, false);

  const databaseIdentitySha256 = initialVerify.database.identitySha256;
  const failingPrepared = prepared({
    command: 'apply',
    expectedDatabaseIdentitySha256: databaseIdentitySha256,
    effectiveHealthCheckSql: `${healthCheckSql}\nSELECT sample_inventory.fixture_missing_health_check();`,
  });
  let injectedFailure;
  try {
    await applySampleInventoryApprovalStockCutover({ client, prepared: failingPrepared });
  } catch (error) {
    injectedFailure = error;
  }
  assert.ok(injectedFailure instanceof Error, 'injected health failure must reject');
  assert.equal(injectedFailure.cutoverStage, 'execute_health_check');
  assert.equal(injectedFailure.cutoverCommitted, false);
  assert.equal(injectedFailure.cutoverMigrationBodyExecuted, true);

  const rollbackState = await client.query(`
    SELECT
      sample.on_hand_quantity,
      sample.reserved_quantity,
      sample.version::INTEGER AS version,
      sample.updated_by,
      (SELECT COUNT(*)::INTEGER FROM sample_inventory.inventory_movements) AS movement_rows,
      (SELECT COUNT(*)::INTEGER FROM sample_inventory.business_events) AS event_rows,
      to_regclass('public.aios_schema_migrations') IS NULL AS ledger_absent
    FROM sample_inventory.samples AS sample
    WHERE sample.id = $1
  `, [sampleId]);
  assert.deepEqual(rollbackState.rows[0], {
    event_rows: 0,
    ledger_absent: true,
    movement_rows: 0,
    on_hand_quantity: 20,
    reserved_quantity: 3,
    updated_by: 'fixture',
    version: 1,
  });

  const applyPrepared = prepared({ command: 'apply', expectedDatabaseIdentitySha256: databaseIdentitySha256 });
  const applied = await applySampleInventoryApprovalStockCutover({ client, prepared: applyPrepared });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.policy.committed, true);
  assert.equal(applied.policy.migrationBodyExecuted, true);
  assert.equal(applied.policy.ledgerWrites, false);
  assert.equal(applied.topology.after.pendingDebitRequests, 0);
  assert.equal(applied.topology.after.exactDebitedRequests, 1);

  await client.query(healthCheckSql);
  const independentHealth = await client.query(`
    SELECT
      sample.on_hand_quantity,
      sample.reserved_quantity,
      sample.available_quantity,
      sample.version::INTEGER AS version,
      sample.updated_by,
      (
        SELECT COUNT(*)::INTEGER
        FROM sample_inventory.inventory_movements AS movement
        WHERE movement.sample_id = sample.id
          AND movement.source_type = 'outbound_request'
          AND movement.source_id = $2::TEXT
          AND movement.movement_type = 'outbound_pending_to_approved'
          AND movement.on_hand_delta = -4
          AND movement.reserved_delta = 0
          AND movement.actor_user_id = 'system:approval-stock-migration'
      ) AS movement_rows,
      (
        SELECT COUNT(*)::INTEGER
        FROM sample_inventory.business_events AS event
        WHERE event.aggregate_type = 'sample'
          AND event.aggregate_id = sample.id::TEXT
          AND event.event_type = 'inventory.movement.recorded'
          AND event.payload ->> 'sourceId' = $2::TEXT
          AND event.payload ->> 'movementType' = 'outbound_pending_to_approved'
      ) AS event_rows,
      to_regclass('public.aios_schema_migrations') IS NULL AS ledger_absent
    FROM sample_inventory.samples AS sample
    WHERE sample.id = $1
  `, [sampleId, outboundId]);
  assert.deepEqual(independentHealth.rows[0], {
    available_quantity: 13,
    event_rows: 1,
    ledger_absent: true,
    movement_rows: 1,
    on_hand_quantity: 16,
    reserved_quantity: 3,
    updated_by: 'system:approval-stock-migration',
    version: 2,
  });

  const noOp = await applySampleInventoryApprovalStockCutover({ client, prepared: applyPrepared });
  assert.equal(noOp.status, 'already_applied_healthy');
  assert.equal(noOp.policy.migrationBodyExecuted, false);
  assert.equal(noOp.policy.databaseWrites, false);

  const finalVerify = await verifySampleInventoryApprovalStockCutover({
    client,
    prepared: verifyPrepared,
  });
  assert.equal(finalVerify.status, 'approval_debits_complete');
  assert.equal(finalVerify.ready, true);
  assert.equal(finalVerify.topology.exactDebitedRequests, 1);
  assert.equal(finalVerify.topology.pendingDebitRequests, 0);
  assert.equal(finalVerify.topology.ledgerExists, false);

  console.log(
    '[aios-sample-inventory-approval-stock-cutover.postgres] OK: read-only verify, injected rollback, reservation-preserving apply, independent health, ledger absence, and no-op passed.',
  );
} finally {
  await client.end();
}
