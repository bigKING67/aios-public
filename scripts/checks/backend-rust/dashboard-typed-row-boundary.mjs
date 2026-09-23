#!/usr/bin/env node

/**
 * Guards the dashboard cache-miss hot path from regressing back to SQL JSON
 * payloads plus Rust-side JSON reparsing, and keeps goods query name lookups
 * behind the ranked-row limit.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createCheckGuard,
  createLineStartOffsets,
  getRepoRoot,
  lineNumberForOffset,
} from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'dashboard-typed-row-boundary';

export const DASHBOARD_TYPED_ROW_HELPER = 'backend-rust/src/dashboard/pg_row_parse.rs';

export const DASHBOARD_TYPED_ROW_SQL_FILES = Object.freeze([
  'backend-rust/src/dashboard/traffic/sql/metrics.rs',
  'backend-rust/src/dashboard/traffic_goods/sql/metrics.rs',
  'backend-rust/src/dashboard/goods/sql.rs',
]);

export const DASHBOARD_GOODS_SQL_FILE = 'backend-rust/src/dashboard/goods/sql.rs';

export const DASHBOARD_TYPED_ROW_MAPPING_FILES = Object.freeze([
  'backend-rust/src/dashboard/traffic/model.rs',
  'backend-rust/src/dashboard/traffic_handlers/traffic.rs',
  'backend-rust/src/dashboard/traffic_goods/model.rs',
  'backend-rust/src/dashboard/traffic_handlers/traffic_goods.rs',
  'backend-rust/src/dashboard/goods/metrics.rs',
  'backend-rust/src/dashboard/goods_handlers/metrics_query.rs',
]);

export const DASHBOARD_TYPED_ROW_REQUIRED_FILES = Object.freeze([
  DASHBOARD_TYPED_ROW_HELPER,
  ...DASHBOARD_TYPED_ROW_SQL_FILES,
  ...DASHBOARD_TYPED_ROW_MAPPING_FILES,
]);

const SQL_JSON_PAYLOAD_PATTERNS = Object.freeze([
  {
    label: 'row_to_json',
    pattern: /\brow_to_json\s*\(/u,
    reason: 'SQL must return typed columns directly instead of row_to_json payloads.',
  },
  {
    label: 'payload alias',
    pattern: /\bAS\s+payload\b/iu,
    reason: 'Dashboard metrics SQL should not expose a generic payload column.',
  },
]);

const RUST_JSON_PAYLOAD_PATTERNS = Object.freeze([
  {
    label: 'payload string extraction',
    pattern: /try_get::<\s*String\s*,\s*_>\s*\(\s*"payload"\s*\)/u,
    reason: 'Handlers should map sqlx PgRow values directly instead of extracting JSON payload text.',
  },
  {
    label: 'serde_json::from_str',
    pattern: /\bserde_json::from_str\b/u,
    reason: 'Handlers should not JSON-parse dashboard metrics rows on the hot path.',
  },
  {
    label: 'serde_json::Value',
    pattern: /\bserde_json::Value\b/u,
    reason: 'Typed-row boundary files should not depend on serde_json::Value for metrics decoding.',
  },
  {
    label: 'value_parse helper',
    pattern: /\bvalue_parse\b/u,
    reason: 'The old dashboard value_parse helper must stay retired for typed-row paths.',
  },
  {
    label: 'row_from_value mapper',
    pattern: /\bmetric_row_from_value\b/u,
    reason: 'Metrics models should expose PgRow mappers, not Value mappers.',
  },
]);

function readRepoFileIfExists(repoRoot, file) {
  const fullPath = path.join(repoRoot, file);
  if (!existsSync(fullPath)) {
    return null;
  }
  return readFileSync(fullPath, 'utf8');
}

function collectPatternFindings(repoRoot, files, checks) {
  const findings = [];

  for (const file of files) {
    const source = readRepoFileIfExists(repoRoot, file);
    if (source === null) {
      findings.push(`${file}: missing required typed-row boundary file`);
      continue;
    }

    const lineStarts = createLineStartOffsets(source);
    for (const check of checks) {
      const match = check.pattern.exec(source);
      if (!match) {
        continue;
      }
      const lineNumber = lineNumberForOffset(lineStarts, match.index);
      findings.push(`${file}:${lineNumber}: ${check.reason} [${check.label}]`);
    }
  }

  return findings;
}

function collectGoodsQueryShapeFindings(repoRoot) {
  const source = readRepoFileIfExists(repoRoot, DASHBOARD_GOODS_SQL_FILE);
  if (source === null) {
    return [`${DASHBOARD_GOODS_SQL_FILE}: missing required goods SQL file`];
  }

  const findings = [];
  const lineStarts = createLineStartOffsets(source);
  const reportAt = (offset, reason) => {
    const lineNumber = lineNumberForOffset(lineStarts, Math.max(0, offset));
    findings.push(`${DASHBOARD_GOODS_SQL_FILE}:${lineNumber}: ${reason}`);
  };

  const legacyLatestNameMatch = /\blatest_product_name\s+AS\s*\(/iu.exec(source);
  if (legacyLatestNameMatch) {
    reportAt(
      legacyLatestNameMatch.index,
      'Goods query must not resolve product names before ranking; keep the latest-name LATERAL lookup after the LIMIT $5 ranked CTE.',
    );
  }

  const rankedMatch = /\branked\s+AS\s*\(/iu.exec(source);
  const rankedWithNamesMatch = /\branked_with_names\s+AS\s*\(/iu.exec(source);
  if (!rankedMatch) {
    reportAt(0, 'Goods query must keep a ranked CTE with LIMIT $5 before product-name lookup.');
  }
  if (!rankedWithNamesMatch) {
    reportAt(0, 'Goods query must keep ranked_with_names so product-name lookup runs only for ranked rows.');
  }

  if (!rankedMatch || !rankedWithNamesMatch) {
    return findings;
  }

  const rankedLimitIndex = source.indexOf('LIMIT $5', rankedMatch.index);
  if (rankedLimitIndex === -1 || rankedLimitIndex > rankedWithNamesMatch.index) {
    reportAt(
      rankedMatch.index,
      'Goods query ranked CTE must apply LIMIT $5 before ranked_with_names.',
    );
  }

  const rankedWithNamesSource = source.slice(rankedWithNamesMatch.index);
  const rankedWithNamesLateralIndex = rankedWithNamesSource.search(/\bLEFT\s+JOIN\s+LATERAL\b/iu);
  if (rankedWithNamesLateralIndex === -1) {
    reportAt(
      rankedWithNamesMatch.index,
      'Goods query ranked_with_names must use a LATERAL latest product-name lookup.',
    );
  } else if (
    rankedLimitIndex !== -1
    && rankedWithNamesMatch.index + rankedWithNamesLateralIndex < rankedLimitIndex
  ) {
    reportAt(
      rankedWithNamesMatch.index + rankedWithNamesLateralIndex,
      'Goods query product-name LATERAL lookup must stay after LIMIT $5.',
    );
  }

  if (!/\bFROM\s+ranked\s+r\b/iu.test(rankedWithNamesSource)) {
    reportAt(
      rankedWithNamesMatch.index,
      'Goods query ranked_with_names must read from ranked rows, not from the unbounded base/filter set.',
    );
  }

  if (!/\bsrc_latest\.product_id\s*=\s*r\.product_id\b/u.test(rankedWithNamesSource)) {
    reportAt(
      rankedWithNamesMatch.index,
      'Goods query latest product-name lookup must bind src_latest.product_id to ranked row r.product_id.',
    );
  }

  return findings;
}

export function auditDashboardTypedRowBoundary(repoRoot = getRepoRoot()) {
  const findings = [
    ...collectPatternFindings(repoRoot, DASHBOARD_TYPED_ROW_SQL_FILES, SQL_JSON_PAYLOAD_PATTERNS),
    ...collectPatternFindings(repoRoot, DASHBOARD_TYPED_ROW_MAPPING_FILES, RUST_JSON_PAYLOAD_PATTERNS),
    ...collectGoodsQueryShapeFindings(repoRoot),
  ];

  if (!existsSync(path.join(repoRoot, DASHBOARD_TYPED_ROW_HELPER))) {
    findings.push(`${DASHBOARD_TYPED_ROW_HELPER}: missing shared PgRow parser helper`);
  }

  const dashboardModule = readRepoFileIfExists(repoRoot, 'backend-rust/src/dashboard.rs');
  if (dashboardModule === null) {
    findings.push('backend-rust/src/dashboard.rs: missing dashboard module root');
  } else {
    if (!/\bmod\s+pg_row_parse\s*;/u.test(dashboardModule)) {
      findings.push('backend-rust/src/dashboard.rs: missing `mod pg_row_parse;`');
    }
    if (/\bmod\s+value_parse\s*;/u.test(dashboardModule)) {
      findings.push('backend-rust/src/dashboard.rs: `mod value_parse;` must stay retired');
    }
  }

  if (existsSync(path.join(repoRoot, 'backend-rust/src/dashboard/value_parse.rs'))) {
    findings.push('backend-rust/src/dashboard/value_parse.rs: retired JSON value parse helper must not be restored');
  }

  return findings;
}

function main() {
  const guard = createCheckGuard(GUARD_NAME);
  const findings = auditDashboardTypedRowBoundary(getRepoRoot());
  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] dashboard typed-row boundary drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error('\nKeep traffic, traffic_goods, and goods cache-miss metrics on typed SQL columns plus PgRow mappers.');
    process.exit(1);
  }

  guard.reportOk(`protected ${DASHBOARD_TYPED_ROW_SQL_FILES.length} SQL files, ${DASHBOARD_TYPED_ROW_MAPPING_FILES.length} Rust mapping files, and goods query shape.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
