#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  applyTaobaoGoodsSchemaContractForwardCutover,
  prepareTaobaoGoodsSchemaContractForwardCutover,
  TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET,
  TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE,
  verifyTaobaoGoodsSchemaContractForwardCutover,
} from '../../lib/migrations/aios-taobao-goods-schema-contract-forward-cutover.mjs';


const DATABASE_URL = process.env.TAOBAO_GOODS_SCHEMA_CONTRACT_TEST_DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('TAOBAO_GOODS_SCHEMA_CONTRACT_TEST_DATABASE_URL is required.');
}

const baseMigrationSql = readFileSync(
  'etl/groland_postgres/sql/migrations/20260317_1500__create_ads_taobao_trade_sale_goods_daily.sql',
  'utf8',
);
const explicitMappingMigrationSql = readFileSync(
  'etl/groland_postgres/sql/migrations/20260806_1140__repair_taobao_goods_ads_column_contract.sql',
  'utf8',
);
const schemaContractMigrationSql = readFileSync(
  'etl/groland_postgres/sql/migrations/20260806_1900__enforce_taobao_goods_ads_schema_contract.sql',
  'utf8',
);
const metadataPrerequisiteMigrationSql = readFileSync(
  TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.relativePath,
  'utf8',
);
const healthCheckSql = readFileSync(
  'etl/groland_postgres/tests/sql/taobao_trade_sale_goods_daily_schema_contract_check.sql',
  'utf8',
);
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const GIT_SHA = 'a'.repeat(40);

const sourceColumns = [...explicitMappingMigrationSql.matchAll(/\bsrc\.([a-z][a-z0-9_]*)\b/gu)]
  .map((match) => match[1])
  .filter((column, index, columns) => columns.indexOf(column) === index);
for (const required of ['id', 'stat_date', 'created_at', 'updated_at', 'crowd_ad_favorite_cart_cost']) {
  assert.ok(sourceColumns.includes(required), `fixture source column extraction missed ${required}`);
}

const sourceColumnSql = sourceColumns
  .filter((column) => column !== 'crowd_ad_favorite_cart_cost')
  .map((column) => {
    if (column === 'stat_date') return `${column} DATE`;
    if (column === 'created_at' || column === 'updated_at') {
      return `${column} TIMESTAMP WITHOUT TIME ZONE`;
    }
    return `${column} NUMERIC`;
  }).join(',\n  ');

const { default: pg } = await import('pg');
const client = new pg.Client({
  application_name: 'aios-taobao-goods-schema-contract-disposable-proof-v1',
  connectionString: DATABASE_URL,
});

async function captureFailure(sql) {
  try {
    await client.query(sql);
    return null;
  } catch (error) {
    return error;
  }
}

async function snapshot() {
  const result = await client.query(`
    SELECT
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(target))::TEXT, ''))
       FROM ads.taobao_trade_sale_goods_daily target) AS ads_hash,
      (SELECT to_jsonb(state)::TEXT
       FROM etl.taobao_trade_sale_goods_daily_refresh_state state
       WHERE id = 1) AS watermark_state
  `);
  return result.rows[0];
}

function prepared({
  command,
  expectedDatabaseIdentitySha256 = null,
  expectedRuntimeContractSha256 = null,
}) {
  return prepareTaobaoGoodsSchemaContractForwardCutover({
    command,
    expectedDatabase: 'taobao_goods_fixture',
    expectedDatabaseIdentitySha256,
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.checksum,
    expectedPrerequisiteMigrationSha256:
      TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.checksum,
    expectedRuntimeContractSha256,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    healthCheckSql,
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSql: schemaContractMigrationSql,
    prerequisiteMigrationSql: metadataPrerequisiteMigrationSql,
    records,
  });
}

await client.connect();
try {
  await client.query(`CREATE SCHEMA ods;
CREATE TABLE ods.taobao_trade_sale_goods_raw (
  ${sourceColumnSql}
);`);
  await client.query(baseMigrationSql);
  await client.query(`
    ALTER TABLE ods.taobao_trade_sale_goods_raw
      ADD COLUMN crowd_ad_favorite_cart_cost NUMERIC(18, 2)
  `);
  await client.query(explicitMappingMigrationSql);
  const verified = await verifyTaobaoGoodsSchemaContractForwardCutover({
    client,
    prepared: prepared({ command: 'verify' }),
  });
  assert.equal(verified.status, 'ready_for_apply');
  assert.equal(verified.topology.metadataNormalizationReady, true);
  assert.equal(verified.policy.databaseWrites, false);
  assert.equal(verified.policy.transactionIdAssigned, false);
  const applied = await applyTaobaoGoodsSchemaContractForwardCutover({
    client,
    prepared: prepared({
      command: 'apply',
      expectedDatabaseIdentitySha256: verified.database.identitySha256,
      expectedRuntimeContractSha256: verified.topology.runtimeContractSha256,
    }),
  });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.policy.committed, true);
  assert.equal(applied.policy.ledgerWrites, false);
  assert.equal(applied.policy.prerequisiteMigrationBodyExecuted, true);
  const normalizedMetadata = await client.query(`
    SELECT numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'taobao_trade_sale_goods_daily'
      AND column_name = 'crowd_ad_favorite_cart_cost'
  `);
  assert.deepEqual(normalizedMetadata.rows[0], { numeric_precision: 18, numeric_scale: 2 });
  const healthyVerify = await verifyTaobaoGoodsSchemaContractForwardCutover({
    client,
    prepared: prepared({ command: 'verify' }),
  });
  assert.equal(healthyVerify.status, 'already_applied_healthy');
  const noOp = await applyTaobaoGoodsSchemaContractForwardCutover({
    client,
    prepared: prepared({
      command: 'apply',
      expectedDatabaseIdentitySha256: healthyVerify.database.identitySha256,
      expectedRuntimeContractSha256: healthyVerify.topology.runtimeContractSha256,
    }),
  });
  assert.equal(noOp.status, 'already_applied_healthy');
  assert.equal(noOp.policy.migrationBodyExecuted, false);
  assert.equal(noOp.policy.prerequisiteMigrationBodyExecuted, false);
  assert.equal(noOp.policy.databaseWrites, false);

  await client.query(`
    INSERT INTO ods.taobao_trade_sale_goods_raw (
      id,
      stat_date,
      created_at,
      updated_at,
      crowd_ad_favorite_cart_cost
    ) VALUES (
      1,
      DATE '2026-08-06',
      TIMESTAMP '2026-08-06 08:00:00',
      TIMESTAMP '2026-08-06 08:00:00',
      2.5
    )
  `);
  await client.query('CALL ads.refresh_taobao_trade_sale_goods_daily(NULL, NULL)');
  await client.query('CALL ads.refresh_taobao_trade_sale_goods_daily_incremental(14, TRUE)');
  const beforeDrift = await snapshot();

  await client.query('ALTER TABLE ods.taobao_trade_sale_goods_raw ADD COLUMN unexpected_contract_drift TEXT');

  const noOpFailure = await captureFailure(
    'CALL ads.refresh_taobao_trade_sale_goods_daily_incremental(14, FALSE)',
  );
  assert.ok(noOpFailure instanceof Error);
  assert.match(noOpFailure.message, /ODS\/ADS business column contract mismatch.*unexpected_contract_drift/u);
  assert.deepEqual(await snapshot(), beforeDrift);

  const watermarkInitFailure = await captureFailure(
    'CALL ads.refresh_taobao_trade_sale_goods_daily_incremental(14, TRUE)',
  );
  assert.ok(watermarkInitFailure instanceof Error);
  assert.match(watermarkInitFailure.message, /unexpected_contract_drift/u);
  assert.deepEqual(await snapshot(), beforeDrift);

  const fullRefreshFailure = await captureFailure(
    "CALL ads.refresh_taobao_trade_sale_goods_daily(DATE '2026-08-06', DATE '2026-08-06')",
  );
  assert.ok(fullRefreshFailure instanceof Error);
  assert.match(fullRefreshFailure.message, /unexpected_contract_drift/u);
  assert.deepEqual(await snapshot(), beforeDrift);

  const internalPrivileges = await client.query(`
    SELECT COUNT(*)::INTEGER AS public_execute_count
    FROM pg_proc procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    WHERE procedure.oid IN (
      'ads.assert_taobao_trade_sale_goods_daily_schema_contract()'::regprocedure,
      'ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)'::regprocedure,
      'ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(integer,boolean)'::regprocedure
    )
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  `);
  assert.equal(internalPrivileges.rows[0].public_execute_count, 0);

  console.log(
    '[aios-taobao-goods-schema-contract.postgres] OK: baseline refresh, pre-no-op assertion, pre-watermark assertion, pre-delete assertion, unchanged ADS/state, and internal ACL checks passed.',
  );
} finally {
  await client.end();
}
