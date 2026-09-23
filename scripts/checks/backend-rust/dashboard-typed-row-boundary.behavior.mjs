#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  DASHBOARD_GOODS_SQL_FILE,
  DASHBOARD_TYPED_ROW_MAPPING_FILES,
  DASHBOARD_TYPED_ROW_REQUIRED_FILES,
  DASHBOARD_TYPED_ROW_SQL_FILES,
  auditDashboardTypedRowBoundary,
} from './dashboard-typed-row-boundary.mjs';

const CLEAN_GOODS_SQL = `
pub fn get_goods_metrics_sql() -> &'static str {
  r#"
    WITH filtered AS (
      SELECT product_id, curr_gmv, gmv_delta FROM typed_rows
    ),
    enriched AS (
      SELECT f.* FROM filtered f
    ),
    ranked AS (
      SELECT e.*
      FROM enriched e
      ORDER BY e.curr_gmv DESC, e.gmv_delta DESC, e.product_id
      LIMIT $5
    ),
    ranked_with_names AS (
      SELECT
        r.*,
        COALESCE(latest_non_empty.product_name, '(未命名商品)') AS product_name
      FROM ranked r
      LEFT JOIN LATERAL (
        SELECT src_latest.product_name
        FROM ads.taobao_trade_sale_goods_daily src_latest
        WHERE src_latest.product_id = r.product_id
          AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
        LIMIT 1
      ) AS latest_non_empty ON TRUE
    )
    SELECT r.product_id, r.product_name
    FROM ranked_with_names r
  "#
}
`;

function writeFixtureFile(repoRoot, file, content) {
  const fullPath = path.join(repoRoot, file);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function withFixtureRepo(callback) {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'dashboard-typed-row-boundary-'));
  try {
    for (const file of DASHBOARD_TYPED_ROW_REQUIRED_FILES) {
      writeFixtureFile(repoRoot, file, 'pub fn ok() {}\n');
    }
    for (const file of DASHBOARD_TYPED_ROW_SQL_FILES) {
      const content = file === DASHBOARD_GOODS_SQL_FILE
        ? CLEAN_GOODS_SQL
        : 'pub fn sql() { /* SELECT source_name FROM typed_rows */ }\n';
      writeFixtureFile(repoRoot, file, content);
    }
    for (const file of DASHBOARD_TYPED_ROW_MAPPING_FILES) {
      writeFixtureFile(repoRoot, file, 'pub fn map_row(row: &sqlx::postgres::PgRow) { let _ = row; }\n');
    }
    writeFixtureFile(repoRoot, 'backend-rust/src/dashboard.rs', 'mod pg_row_parse;\nmod traffic;\n');

    callback(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function testPassesCleanTypedRowBoundary() {
  withFixtureRepo((repoRoot) => {
    assert.deepEqual(auditDashboardTypedRowBoundary(repoRoot), []);
  });
}

function testFlagsSqlJsonPayloadRegression() {
  withFixtureRepo((repoRoot) => {
    writeFixtureFile(
      repoRoot,
      'backend-rust/src/dashboard/traffic/sql/metrics.rs',
      'SELECT row_to_json(t)::TEXT AS payload FROM typed_rows t\n',
    );

    const findings = auditDashboardTypedRowBoundary(repoRoot);
    assert.ok(findings.some((finding) => finding.includes('row_to_json')));
    assert.ok(findings.some((finding) => finding.includes('payload column')));
  });
}

function testFlagsRustJsonPayloadRegression() {
  withFixtureRepo((repoRoot) => {
    writeFixtureFile(
      repoRoot,
      'backend-rust/src/dashboard/goods_handlers/metrics_query.rs',
      [
        'use serde_json::Value;',
        'pub fn decode(row: sqlx::postgres::PgRow) {',
        '  let payload = row.try_get::<String, _>("payload").unwrap();',
        '  let _value = serde_json::from_str::<Value>(&payload).unwrap();',
        '}',
      ].join('\n'),
    );

    const findings = auditDashboardTypedRowBoundary(repoRoot);
    assert.ok(findings.some((finding) => finding.includes('payload text')));
    assert.ok(findings.some((finding) => finding.includes('JSON-parse')));
    assert.ok(findings.some((finding) => finding.includes('serde_json::Value')));
  });
}

function testFlagsRetiredValueParseRegression() {
  withFixtureRepo((repoRoot) => {
    writeFixtureFile(repoRoot, 'backend-rust/src/dashboard.rs', 'mod pg_row_parse;\nmod value_parse;\n');
    writeFixtureFile(repoRoot, 'backend-rust/src/dashboard/value_parse.rs', 'pub fn stale() {}\n');

    const findings = auditDashboardTypedRowBoundary(repoRoot);
    assert.ok(findings.some((finding) => finding.includes('mod value_parse')));
    assert.ok(findings.some((finding) => finding.includes('retired JSON value parse helper')));
  });
}

function testFlagsGoodsNameLookupBeforeRankingLimit() {
  withFixtureRepo((repoRoot) => {
    writeFixtureFile(
      repoRoot,
      DASHBOARD_GOODS_SQL_FILE,
      `
pub fn get_goods_metrics_sql() -> &'static str {
  r#"
    WITH base AS (
      SELECT product_id FROM typed_rows
    ),
    latest_product_name AS (
      SELECT b.product_id, latest_non_empty.product_name
      FROM base b
      LEFT JOIN LATERAL (
        SELECT src_latest.product_name
        FROM ads.taobao_trade_sale_goods_daily src_latest
        WHERE src_latest.product_id = b.product_id
        LIMIT 1
      ) AS latest_non_empty ON TRUE
    ),
    ranked AS (
      SELECT * FROM base
      LIMIT $5
    )
    SELECT r.product_id FROM ranked r
  "#
}
`,
    );

    const findings = auditDashboardTypedRowBoundary(repoRoot);
    assert.ok(findings.some((finding) => finding.includes('before ranking')));
    assert.ok(findings.some((finding) => finding.includes('ranked_with_names')));
  });
}

function testFlagsGoodsNameLookupNotBoundToRankedRows() {
  withFixtureRepo((repoRoot) => {
    writeFixtureFile(
      repoRoot,
      DASHBOARD_GOODS_SQL_FILE,
      CLEAN_GOODS_SQL.replace('src_latest.product_id = r.product_id', 'src_latest.product_id = b.product_id'),
    );

    const findings = auditDashboardTypedRowBoundary(repoRoot);
    assert.ok(findings.some((finding) => finding.includes('r.product_id')));
  });
}

function testFlagsMissingPgRowHelper() {
  withFixtureRepo((repoRoot) => {
    rmSync(path.join(repoRoot, 'backend-rust/src/dashboard/pg_row_parse.rs'), { force: true });

    const findings = auditDashboardTypedRowBoundary(repoRoot);
    assert.ok(findings.some((finding) => finding.includes('pg_row_parse.rs')));
  });
}

function runBehaviorFixtures() {
  testPassesCleanTypedRowBoundary();
  testFlagsSqlJsonPayloadRegression();
  testFlagsRustJsonPayloadRegression();
  testFlagsRetiredValueParseRegression();
  testFlagsGoodsNameLookupBeforeRankingLimit();
  testFlagsGoodsNameLookupNotBoundToRankedRows();
  testFlagsMissingPgRowHelper();
  return 'dashboard typed-row boundary fixtures passed.';
}

const guard = createCheckGuard('dashboard-typed-row-boundary-behavior');

try {
  guard.reportOk(runBehaviorFixtures());
} catch (error) {
  guard.reportError(error, 'unexpected runtime error');
}
