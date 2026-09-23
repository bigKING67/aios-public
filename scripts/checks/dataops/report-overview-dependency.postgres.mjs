#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


const DATABASE_URL = process.env.REPORT_OVERVIEW_DEPENDENCY_TEST_DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('REPORT_OVERVIEW_DEPENDENCY_TEST_DATABASE_URL is required.');
}

const migrationSql = readFileSync(
  'etl/groland_postgres/sql/migrations/20260807_1330__harden_report_overview_dependency_watermarks.sql',
  'utf8',
);
const { default: pg } = await import('pg');
const client = new pg.Client({
  application_name: 'aios-report-overview-dependency-disposable-proof-v1',
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

await client.connect();
try {
  await client.query(`
    CREATE SCHEMA ods;
    CREATE SCHEMA ads;
    CREATE SCHEMA etl;
    CREATE SCHEMA fixture;

    CREATE TABLE etl.all_trade_overview_refresh_state (
      platform VARCHAR(20) PRIMARY KEY,
      last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE
    );
    INSERT INTO etl.all_trade_overview_refresh_state (platform, last_ods_updated_at)
    VALUES
      ('douyin', TIMESTAMP '2026-08-07 09:00:00'),
      ('taobao', TIMESTAMP '2026-08-07 09:00:00');

    CREATE TABLE etl.report_all_trade_week_platform_metrics_refresh_state (
      id SMALLINT PRIMARY KEY,
      last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01',
      last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
      last_refresh_start_date DATE,
      last_refresh_end_date DATE,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );
    INSERT INTO etl.report_all_trade_week_platform_metrics_refresh_state (id) VALUES (1);

    CREATE TABLE etl.report_douyin_trade_sale_metrics_week_refresh_state (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      last_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
      last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
      last_refresh_start_date DATE,
      last_refresh_end_date DATE,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );
    INSERT INTO etl.report_douyin_trade_sale_metrics_week_refresh_state (id) VALUES (1);

    CREATE TABLE ods.taobao_trade_sale_raw (
      stat_date DATE NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE,
      updated_at TIMESTAMP WITHOUT TIME ZONE
    );
    CREATE TABLE ods.taobao_one_alimama_marketingscenario (
      stat_date DATE NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE,
      updated_at TIMESTAMP WITHOUT TIME ZONE
    );
    CREATE TABLE ods.douyin_trade_sale_raw (
      stat_date DATE NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE,
      updated_at TIMESTAMP WITHOUT TIME ZONE
    );

    CREATE TABLE ads.report_all_trade_week_platform (
      week_period VARCHAR(50) NOT NULL,
      platform VARCHAR(20) NOT NULL,
      as_of_date DATE,
      updated_at TIMESTAMP WITHOUT TIME ZONE
    );
    CREATE TABLE ads.report_all_trade_week_platform_metrics (id INTEGER);
    CREATE TABLE ads.report_douyin_trade_sale_metrics_week (id INTEGER);
    CREATE TABLE fixture.refresh_calls (
      target TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      called_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE PROCEDURE ads.refresh_report_all_trade_week_platform_metrics(
      p_start_date DATE,
      p_end_date DATE
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO fixture.refresh_calls (target, start_date, end_date)
      VALUES ('platform', p_start_date, p_end_date);
    END;
    $$;

    CREATE PROCEDURE ads.refresh_report_douyin_trade_sale_metrics_week(
      p_start_date DATE,
      p_end_date DATE
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO fixture.refresh_calls (target, start_date, end_date)
      VALUES ('douyin', p_start_date, p_end_date);
    END;
    $$;
  `);
  await client.query(migrationSql);

  await client.query(`
    INSERT INTO ods.douyin_trade_sale_raw (stat_date, created_at, updated_at)
    VALUES (DATE '2026-08-06', TIMESTAMP '2026-08-07 10:00:00', TIMESTAMP '2026-08-07 10:00:00')
  `);
  const douyinStale = await captureFailure(
    'CALL ads.refresh_report_douyin_trade_sale_metrics_week_incremental(14, FALSE)',
  );
  assert.ok(douyinStale instanceof Error);
  assert.match(douyinStale.message, /all_trade_overview is stale for platform douyin/u);

  await client.query(`
    UPDATE etl.all_trade_overview_refresh_state
    SET last_ods_updated_at = TIMESTAMP '2026-08-07 10:00:00'
    WHERE platform = 'douyin'
  `);
  await client.query(
    'CALL ads.refresh_report_douyin_trade_sale_metrics_week_incremental(14, FALSE)',
  );
  let calls = await client.query(
    "SELECT COUNT(*)::INTEGER AS count FROM fixture.refresh_calls WHERE target = 'douyin'",
  );
  assert.equal(calls.rows[0].count, 1);

  await client.query(`
    INSERT INTO ods.douyin_trade_sale_raw (stat_date, created_at, updated_at)
    VALUES (DATE '2026-08-06', TIMESTAMP '2026-08-07 10:45:00', TIMESTAMP '2026-08-07 10:45:00')
  `);
  const douyinCatchUpStale = await captureFailure(
    'CALL ads.refresh_report_douyin_trade_sale_metrics_week_incremental(14, FALSE)',
  );
  assert.ok(douyinCatchUpStale instanceof Error);
  assert.match(douyinCatchUpStale.message, /current ODS watermark 2026-08-07 10:45:00/u);

  await client.query(`
    UPDATE etl.all_trade_overview_refresh_state
    SET last_ods_updated_at = TIMESTAMP '2026-08-07 10:45:00'
    WHERE platform = 'douyin'
  `);
  await client.query(
    'CALL ads.refresh_report_douyin_trade_sale_metrics_week_incremental(14, FALSE)',
  );
  calls = await client.query(
    "SELECT COUNT(*)::INTEGER AS count FROM fixture.refresh_calls WHERE target = 'douyin'",
  );
  assert.equal(calls.rows[0].count, 2);

  await client.query(`
    INSERT INTO ods.taobao_trade_sale_raw (stat_date, created_at, updated_at)
    VALUES (DATE '2026-08-06', TIMESTAMP '2026-08-07 10:00:00', TIMESTAMP '2026-08-07 10:00:00');
    INSERT INTO ods.taobao_one_alimama_marketingscenario (stat_date, created_at, updated_at)
    VALUES (DATE '2026-08-06', TIMESTAMP '2026-08-07 10:20:00', TIMESTAMP '2026-08-07 10:20:00');
    INSERT INTO ads.report_all_trade_week_platform (week_period, platform, as_of_date, updated_at)
    VALUES ('2026/8/1～2026/8/7', 'taobao', DATE '2026-08-06', TIMESTAMP '2026-08-07 10:00:00');
    UPDATE etl.all_trade_overview_refresh_state
    SET last_ods_updated_at = TIMESTAMP '2026-08-07 10:00:00'
    WHERE platform = 'taobao';
  `);
  await client.query(
    'CALL ads.refresh_report_all_trade_week_platform_metrics_incremental(14, FALSE)',
  );
  let platformState = await client.query(`
    SELECT
      last_source_updated_at::TEXT AS last_source_updated_at,
      last_trade_updated_at::TEXT AS last_trade_updated_at,
      last_cost_updated_at::TEXT AS last_cost_updated_at
    FROM etl.report_all_trade_week_platform_metrics_refresh_state
    WHERE id = 1
  `);
  assert.equal(platformState.rows[0].last_source_updated_at, '2026-08-07 10:20:00');
  assert.equal(platformState.rows[0].last_trade_updated_at, '2026-08-07 10:00:00');

  await client.query(`
    INSERT INTO ods.taobao_trade_sale_raw (stat_date, created_at, updated_at)
    VALUES (DATE '2026-08-05', TIMESTAMP '2026-08-07 10:15:00', TIMESTAMP '2026-08-07 10:15:00');
    UPDATE ads.report_all_trade_week_platform
    SET updated_at = TIMESTAMP '2026-08-07 10:15:00'
    WHERE platform = 'taobao';
    UPDATE etl.all_trade_overview_refresh_state
    SET last_ods_updated_at = TIMESTAMP '2026-08-07 10:15:00'
    WHERE platform = 'taobao';
  `);
  await client.query(
    'CALL ads.refresh_report_all_trade_week_platform_metrics_incremental(14, FALSE)',
  );
  platformState = await client.query(`
    SELECT
      last_source_updated_at::TEXT AS last_source_updated_at,
      last_trade_updated_at::TEXT AS last_trade_updated_at,
      last_cost_updated_at::TEXT AS last_cost_updated_at
    FROM etl.report_all_trade_week_platform_metrics_refresh_state
    WHERE id = 1
  `);
  assert.equal(platformState.rows[0].last_source_updated_at, '2026-08-07 10:20:00');
  assert.equal(platformState.rows[0].last_trade_updated_at, '2026-08-07 10:15:00');
  calls = await client.query(
    "SELECT COUNT(*)::INTEGER AS count FROM fixture.refresh_calls WHERE target = 'platform'",
  );
  assert.equal(calls.rows[0].count, 2);

  await client.query(`
    UPDATE etl.report_all_trade_week_platform_metrics_refresh_state
    SET last_cost_updated_at = NULL
    WHERE id = 1;
    INSERT INTO ods.taobao_one_alimama_marketingscenario (stat_date, created_at, updated_at)
    VALUES (DATE '2026-07-01', TIMESTAMP '2026-08-07 10:25:00', TIMESTAMP '2026-08-07 10:25:00');
  `);
  await client.query(
    'CALL ads.refresh_report_all_trade_week_platform_metrics_incremental(14, FALSE)',
  );
  const independentlyBootstrappedCost = await client.query(`
    SELECT MIN(start_date)::TEXT AS earliest_start_date
    FROM fixture.refresh_calls
    WHERE target = 'platform'
  `);
  assert.equal(independentlyBootstrappedCost.rows[0].earliest_start_date, '2026-07-01');

  console.log(
    '[report-overview-dependency.postgres] OK: stale overview blocks, completed overview unblocks, catch-up reruns, and each source watermark detects late or first-seen updates independently.',
  );
} finally {
  await client.end();
}
