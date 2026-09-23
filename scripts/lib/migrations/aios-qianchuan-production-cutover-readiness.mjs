import { compareAiosMigrationHistory } from './aios-migration-history.mjs';
import { summarizeAiosMigrations } from './aios-migration-discovery.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

export const QIANCHUAN_CUTOVER_TARGET_MIGRATION = Object.freeze({
  namespace: 'warehouse',
  version: '20260618_1430',
  relativePath: 'etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql',
});

export const QIANCHUAN_CUTOVER_RELATIONS = Object.freeze([
  'public.aios_schema_migrations',
  'ads.marketing_content_assets',
  'ads.marketing_content_ad_materials',
  'ads.marketing_content_asset_video_understanding_jobs',
  'ads.marketing_content_asset_video_understanding_results',
  'ods.douyin_qianchuan_shortvideo_raw',
  'ods.douyin_qianchuan_live_video_raw',
  'ods.douyin_trade_sale_live_raw',
  'dwd.marketing_content_qianchuan_material_performance_di',
  'dwd.marketing_content_ad_material_stats_di',
  'dws.marketing_content_qianchuan_material_summary',
  'dws.marketing_content_asset_qianchuan_summary',
  'dws.marketing_content_qianchuan_live_room_acceptance_di',
]);

export const QIANCHUAN_LIVE_VIDEO_SETTLEMENT_HORIZON_COLUMNS = Object.freeze([
  'boost_settlement_roi_14d',
  'boost_settlement_amount_14d',
  'boost_settlement_order_count_14d',
  'boost_settlement_order_cost_14d',
  'boost_gmv_settlement_rate_14d',
  'boost_order_settlement_rate_14d',
  'boost_settlement_roi_30d',
  'boost_settlement_amount_30d',
  'boost_settlement_order_count_30d',
  'boost_settlement_order_cost_30d',
  'boost_gmv_settlement_rate_30d',
  'boost_order_settlement_rate_30d',
  'boost_settlement_roi_90d',
  'boost_settlement_amount_90d',
  'boost_settlement_order_count_90d',
  'boost_settlement_order_cost_90d',
  'boost_gmv_settlement_rate_90d',
  'boost_order_settlement_rate_90d',
]);

export const QIANCHUAN_CUTOVER_REQUIRED_COLUMNS = Object.freeze([
  ['ads', 'marketing_content_assets', 'ai_summary'],
  ['ads', 'marketing_content_assets', 'ai_score'],
  ['ads', 'marketing_content_assets', 'analysis_object_key'],
  ['ads', 'marketing_content_ad_materials', 'asset_id'],
  ['ads', 'marketing_content_ad_materials', 'ad_platform'],
  ['ads', 'marketing_content_ad_materials', 'external_material_id'],
  ['ads', 'marketing_content_ad_materials', 'relation_status'],
  ['ads', 'marketing_content_ad_materials', 'source'],
  ['ads', 'marketing_content_ad_materials', 'delivery_mode'],
  ['ads', 'marketing_content_ad_materials', 'objective'],
  ['ads', 'marketing_content_ad_materials', 'objective_source'],
  ['ads', 'marketing_content_ad_materials', 'performance_source_table'],
  ['ads', 'marketing_content_ad_materials', 'last_performance_seen_at'],
  ['ads', 'marketing_content_ad_materials', 'data_quality_status'],
  ['ads', 'marketing_content_asset_video_understanding_jobs', 'asset_id'],
  ['ads', 'marketing_content_asset_video_understanding_jobs', 'analysis_schema_version'],
  ['ads', 'marketing_content_asset_video_understanding_jobs', 'status'],
  ['ads', 'marketing_content_asset_video_understanding_results', 'asset_id'],
  ['ads', 'marketing_content_asset_video_understanding_results', 'analysis_schema_version'],
  ['ads', 'marketing_content_asset_video_understanding_results', 'result_json'],
  ['ods', 'douyin_qianchuan_shortvideo_raw', 'material_id'],
  ['ods', 'douyin_qianchuan_shortvideo_raw', 'stat_date'],
  ['ods', 'douyin_qianchuan_shortvideo_raw', 'ingest_time'],
  ['ods', 'douyin_qianchuan_live_video_raw', 'material_id'],
  ['ods', 'douyin_qianchuan_live_video_raw', 'stat_date'],
  ['ods', 'douyin_qianchuan_live_video_raw', 'ingest_time'],
  ...QIANCHUAN_LIVE_VIDEO_SETTLEMENT_HORIZON_COLUMNS.map((column) => (
    Object.freeze(['ods', 'douyin_qianchuan_live_video_raw', column])
  )),
  ['ods', 'douyin_trade_sale_live_raw', 'anchor_douyin_id'],
  ['ods', 'douyin_trade_sale_live_raw', 'live_start_time'],
  ['dwd', 'marketing_content_qianchuan_material_performance_di', 'material_id'],
  ['dwd', 'marketing_content_qianchuan_material_performance_di', 'stat_date'],
  ['dwd', 'marketing_content_qianchuan_material_performance_di', 'asset_id'],
  ['dwd', 'marketing_content_qianchuan_material_performance_di', 'objective'],
  ['dwd', 'marketing_content_qianchuan_material_performance_di', 'source_table'],
  ['dws', 'marketing_content_qianchuan_material_summary', 'material_id'],
  ['dws', 'marketing_content_qianchuan_material_summary', 'asset_id'],
  ['dws', 'marketing_content_qianchuan_material_summary', 'last_stat_date'],
  ['dws', 'marketing_content_asset_qianchuan_summary', 'asset_id'],
  ['dws', 'marketing_content_asset_qianchuan_summary', 'last_stat_date'],
  ['dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'stat_date'],
  ['dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'douyin_account_display_id'],
  ['dwd', 'marketing_content_ad_material_stats_di', 'ad_platform'],
  ['dwd', 'marketing_content_ad_material_stats_di', 'external_material_id'],
]);

const TARGET_RELATIONS = Object.freeze([
  'dwd.marketing_content_qianchuan_material_performance_di',
  'dws.marketing_content_qianchuan_material_summary',
  'dws.marketing_content_asset_qianchuan_summary',
  'dws.marketing_content_qianchuan_live_room_acceptance_di',
]);
export const QIANCHUAN_CUTOVER_TARGET_RELATIONS = TARGET_RELATIONS;

const TARGET_AD_MATERIAL_COLUMNS = Object.freeze([
  'delivery_mode',
  'objective',
  'objective_source',
  'performance_source_table',
  'last_performance_seen_at',
  'data_quality_status',
]);
export const QIANCHUAN_CUTOVER_TARGET_AD_MATERIAL_COLUMNS = TARGET_AD_MATERIAL_COLUMNS;

export const QIANCHUAN_CUTOVER_OVERLAPPING_VIDEO_RELATIONS = Object.freeze([
  'ads.marketing_content_asset_video_understanding_jobs',
  'ads.marketing_content_asset_video_understanding_results',
]);

const TARGET_RELATION_COLUMNS = Object.freeze({
  'dwd.marketing_content_qianchuan_material_performance_di': [
    'material_id',
    'stat_date',
    'asset_id',
    'objective',
    'source_table',
  ],
  'dws.marketing_content_qianchuan_material_summary': ['material_id', 'asset_id', 'last_stat_date'],
  'dws.marketing_content_asset_qianchuan_summary': ['asset_id', 'last_stat_date'],
  'dws.marketing_content_qianchuan_live_room_acceptance_di': ['stat_date', 'douyin_account_display_id'],
});

const SQL = Object.freeze({
  relations: `/* qianchuan_cutover:relations */
SELECT requested.relation_name,
       to_regclass(requested.relation_name)::TEXT AS resolved_name
FROM unnest($1::TEXT[]) AS requested(relation_name)
ORDER BY requested.relation_name`,
  columns: `/* qianchuan_cutover:columns */
WITH requested AS (
  SELECT *
  FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[])
    AS item(table_schema, table_name, column_name)
)
SELECT requested.table_schema,
       requested.table_name,
       requested.column_name,
       actual.column_name IS NOT NULL AS present
FROM requested
LEFT JOIN information_schema.columns actual
  ON actual.table_schema = requested.table_schema
 AND actual.table_name = requested.table_name
 AND actual.column_name = requested.column_name
ORDER BY requested.table_schema, requested.table_name, requested.column_name`,
  ledger: `/* qianchuan_cutover:ledger */
SELECT namespace, version, checksum, applied_at, app_version, execution_mode
FROM public.aios_schema_migrations
ORDER BY namespace, applied_at, version`,
  productSource: `/* qianchuan_cutover:product_source */
WITH duplicate_groups AS (
  SELECT COUNT(*)::BIGINT AS row_count
  FROM ods.douyin_qianchuan_shortvideo_raw
  WHERE NULLIF(BTRIM(material_id), '') IS NOT NULL
  GROUP BY material_id, stat_date
  HAVING COUNT(*) > 1
)
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT material_id)::BIGINT AS materials,
       MIN(stat_date)::TEXT AS min_date,
       MAX(stat_date)::TEXT AS max_date,
       MAX(ingest_time) AS latest_ingest,
       (SELECT COUNT(*)::BIGINT FROM duplicate_groups) AS duplicate_groups,
       (SELECT COALESCE(SUM(row_count - 1), 0)::BIGINT FROM duplicate_groups) AS duplicate_excess_rows,
       GREATEST(
         CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END,
         (SELECT COALESCE(MAX(row_count), 0)::BIGINT FROM duplicate_groups)
       )::BIGINT AS max_rows_per_material_date
FROM ods.douyin_qianchuan_shortvideo_raw`,
  liveSource: `/* qianchuan_cutover:live_source */
WITH duplicate_groups AS (
  SELECT COUNT(*)::BIGINT AS row_count
  FROM ods.douyin_qianchuan_live_video_raw
  WHERE NULLIF(BTRIM(material_id), '') IS NOT NULL
  GROUP BY material_id, stat_date
  HAVING COUNT(*) > 1
)
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT material_id)::BIGINT AS materials,
       MIN(stat_date)::TEXT AS min_date,
       MAX(stat_date)::TEXT AS max_date,
       MAX(ingest_time) AS latest_ingest,
       (SELECT COUNT(*)::BIGINT FROM duplicate_groups) AS duplicate_groups,
       (SELECT COALESCE(SUM(row_count - 1), 0)::BIGINT FROM duplicate_groups) AS duplicate_excess_rows,
       GREATEST(
         CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END,
         (SELECT COALESCE(MAX(row_count), 0)::BIGINT FROM duplicate_groups)
       )::BIGINT AS max_rows_per_material_date
FROM ods.douyin_qianchuan_live_video_raw`,
  liveAcceptanceSource: `/* qianchuan_cutover:live_acceptance_source */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT anchor_douyin_id)::BIGINT AS anchors,
       MIN(live_start_time::DATE)::TEXT AS min_date,
       MAX(live_start_time::DATE)::TEXT AS max_date,
       NULL::TIMESTAMPTZ AS latest_ingest
FROM ods.douyin_trade_sale_live_raw`,
  crossSourceOverlap: `/* qianchuan_cutover:cross_source_overlap */
SELECT COUNT(*)::BIGINT AS material_ids
FROM (
  SELECT DISTINCT product.material_id
  FROM ods.douyin_qianchuan_shortvideo_raw product
  JOIN ods.douyin_qianchuan_live_video_raw live USING (material_id)
  WHERE NULLIF(BTRIM(product.material_id), '') IS NOT NULL
) overlap`,
  identities: `/* qianchuan_cutover:identities */
WITH active AS (
  SELECT asset_id, external_material_id, source
  FROM ads.marketing_content_ad_materials
  WHERE ad_platform = 'qianchuan'
    AND relation_status = 'active'
    AND NULLIF(BTRIM(external_material_id), '') IS NOT NULL
), source_counts AS (
  SELECT source, COUNT(*)::BIGINT AS rows
  FROM active
  GROUP BY source
), duplicate_groups AS (
  SELECT asset_id, external_material_id, COUNT(*)::BIGINT AS row_count
  FROM active
  GROUP BY asset_id, external_material_id
  HAVING COUNT(*) > 1
)
SELECT (SELECT COUNT(*)::BIGINT FROM active) AS active_rows,
       (SELECT COUNT(DISTINCT external_material_id)::BIGINT FROM active) AS distinct_material_ids,
       (SELECT COUNT(DISTINCT asset_id)::BIGINT FROM active) AS bound_assets,
       (SELECT COUNT(*)::BIGINT FROM duplicate_groups) AS duplicate_active_asset_material_groups,
       COALESCE(
         (SELECT jsonb_object_agg(source, rows ORDER BY source) FROM source_counts),
         '{}'::JSONB
       ) AS source_rows`,
  dwd: `/* qianchuan_cutover:dwd */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT material_id)::BIGINT AS materials,
       COUNT(DISTINCT asset_id) FILTER (WHERE asset_id IS NOT NULL)::BIGINT AS bound_assets,
       MAX(stat_date)::TEXT AS latest_date,
       COUNT(DISTINCT material_id) FILTER (
         WHERE objective = 'product_all_domain_shortvideo'
           AND source_table = 'ods.douyin_qianchuan_shortvideo_raw'
       )::BIGINT AS product_materials,
       COUNT(DISTINCT material_id) FILTER (
         WHERE objective = 'live_all_domain_shortvideo'
           AND source_table = 'ods.douyin_qianchuan_live_video_raw'
       )::BIGINT AS live_materials
FROM dwd.marketing_content_qianchuan_material_performance_di`,
  materialSummary: `/* qianchuan_cutover:material_summary */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT material_id)::BIGINT AS materials,
       COUNT(DISTINCT asset_id) FILTER (WHERE asset_id IS NOT NULL)::BIGINT AS bound_assets,
       MAX(last_stat_date)::TEXT AS latest_date
FROM dws.marketing_content_qianchuan_material_summary`,
  assetSummary: `/* qianchuan_cutover:asset_summary */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT asset_id)::BIGINT AS populated_assets,
       MAX(last_stat_date)::TEXT AS latest_date
FROM dws.marketing_content_asset_qianchuan_summary`,
  liveAcceptanceWarehouse: `/* qianchuan_cutover:live_acceptance_warehouse */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT douyin_account_display_id)::BIGINT AS accounts,
       MAX(stat_date)::TEXT AS latest_date
FROM dws.marketing_content_qianchuan_live_room_acceptance_di`,
  thinFact: `/* qianchuan_cutover:thin_fact */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT external_material_id)::BIGINT AS materials
FROM dwd.marketing_content_ad_material_stats_di
WHERE ad_platform = 'qianchuan'`,
  videoJobs: `/* qianchuan_cutover:video_jobs */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(*) FILTER (WHERE status = 'succeeded')::BIGINT AS succeeded_rows,
       COUNT(DISTINCT asset_id)::BIGINT AS assets,
       COUNT(*) FILTER (WHERE analysis_schema_version = '2.1')::BIGINT AS schema_v21_rows
FROM ads.marketing_content_asset_video_understanding_jobs`,
  videoResults: `/* qianchuan_cutover:video_results */
SELECT COUNT(*)::BIGINT AS rows,
       COUNT(DISTINCT asset_id)::BIGINT AS assets,
       COUNT(*) FILTER (WHERE analysis_schema_version = '2.1')::BIGINT AS schema_v21_rows,
       COUNT(*) FILTER (WHERE jsonb_typeof(result_json) = 'object')::BIGINT AS structured_rows
FROM ads.marketing_content_asset_video_understanding_results`,
  aiWriteback: `/* qianchuan_cutover:ai_writeback */
SELECT COUNT(*) FILTER (
         WHERE NULLIF(BTRIM(ai_summary), '') IS NOT NULL
            OR ai_score IS NOT NULL
            OR NULLIF(BTRIM(analysis_object_key), '') IS NOT NULL
       )::BIGINT AS assets
FROM ads.marketing_content_assets`,
});

const SOURCE_SQL = Object.freeze({
  product: SQL.productSource,
  live: SQL.liveSource,
});

function numericValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function temporalValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function relationParts(relationName) {
  const [schema, table] = relationName.split('.');
  return { schema, table };
}

function columnKey(schema, table, column) {
  return `${schema}.${table}.${column}`;
}

function relationColumnKeys(relationName, columns) {
  const { schema, table } = relationParts(relationName);
  return columns.map((column) => columnKey(schema, table, column));
}

function hasRequiredColumns(columnPresence, relationName, columns) {
  return relationColumnKeys(relationName, columns).every((key) => columnPresence.get(key) === true);
}

function emptySourceMetrics(available = false) {
  return {
    available,
    rows: 0,
    materials: 0,
    minDate: null,
    maxDate: null,
    latestIngest: null,
    duplicateGroups: 0,
    duplicateExcessRows: 0,
    maxRowsPerMaterialDate: 0,
  };
}

function mapSourceMetrics(row, available) {
  if (!available) return emptySourceMetrics(false);
  return {
    available: true,
    rows: numericValue(row.rows),
    materials: numericValue(row.materials),
    minDate: temporalValue(row.min_date),
    maxDate: temporalValue(row.max_date),
    latestIngest: temporalValue(row.latest_ingest),
    duplicateGroups: numericValue(row.duplicate_groups),
    duplicateExcessRows: numericValue(row.duplicate_excess_rows),
    maxRowsPerMaterialDate: numericValue(row.max_rows_per_material_date),
  };
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numericValue(numerator) / numericValue(denominator)) * 10000) / 100;
}

async function queryFirst(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows?.[0] ?? {};
}

function buildCoverageSql(sourceTypes) {
  const sourceSelects = sourceTypes.map((sourceType) => {
    if (sourceType === 'product') {
      return `SELECT 'product'::TEXT AS source_type, material_id
              FROM ods.douyin_qianchuan_shortvideo_raw
              WHERE NULLIF(BTRIM(material_id), '') IS NOT NULL`;
    }
    return `SELECT 'live'::TEXT AS source_type, material_id
            FROM ods.douyin_qianchuan_live_video_raw
            WHERE NULLIF(BTRIM(material_id), '') IS NOT NULL`;
  });
  return `/* qianchuan_cutover:binding_coverage */
WITH source_ids AS (
  ${sourceSelects.join('\n  UNION ALL\n  ')}
), scopes AS (
  SELECT source_type AS scope, material_id
  FROM source_ids
  GROUP BY source_type, material_id
  UNION ALL
  SELECT 'combined'::TEXT AS scope, material_id
  FROM source_ids
  GROUP BY material_id
), active AS (
  SELECT external_material_id, asset_id
  FROM ads.marketing_content_ad_materials
  WHERE ad_platform = 'qianchuan'
    AND relation_status = 'active'
    AND NULLIF(BTRIM(external_material_id), '') IS NOT NULL
)
SELECT scopes.scope,
       COUNT(DISTINCT scopes.material_id)::BIGINT AS source_materials,
       COUNT(DISTINCT scopes.material_id) FILTER (
         WHERE active.external_material_id IS NOT NULL
       )::BIGINT AS matched_materials,
       COUNT(DISTINCT active.asset_id)::BIGINT AS matched_assets
FROM scopes
LEFT JOIN active ON active.external_material_id = scopes.material_id
GROUP BY scopes.scope
ORDER BY scopes.scope`;
}

function migrationInventory(records) {
  const byNamespace = summarizeAiosMigrations(records);
  return {
    total: records.length,
    namespaces: Object.fromEntries(
      Object.entries(byNamespace).map(([namespace, summary]) => [namespace, {
        total: summary.total,
        bytes: summary.bytes,
        modes: summary.modes,
      }]),
    ),
  };
}

function targetLedgerState({ ledgerExists, targetLedgerRows, targetRecord }) {
  if (!ledgerExists) return 'ledger_missing';
  if (targetLedgerRows.length === 0) return 'not_recorded';
  if (targetLedgerRows.length > 1) return 'duplicate_records';
  return targetLedgerRows[0].checksum === targetRecord.checksum
    ? 'recorded_matching'
    : 'checksum_mismatch';
}

function statusForAudit({
  bindingCoverageSufficient,
  historyFailures,
  ledgerExists,
  sourceRows,
  targetLedgerStatus,
  warehousePopulated,
  warehouseSchemaReady,
}) {
  if (!ledgerExists) return 'ledger_missing';
  if (historyFailures.length || ['checksum_mismatch', 'duplicate_records'].includes(targetLedgerStatus)) {
    return 'migration_history_inconsistent';
  }
  if (!warehouseSchemaReady) return 'warehouse_schema_missing';
  if (targetLedgerStatus !== 'recorded_matching') return 'migration_reconciliation_required';
  if (!sourceRows) return 'source_data_missing';
  if (!warehousePopulated) return 'warehouse_unpopulated';
  if (!bindingCoverageSufficient) return 'binding_coverage_insufficient';
  return 'ready_for_live_validation';
}

function buildFindings(result) {
  const findings = [];
  const add = (code, severity, detail) => findings.push({ code, severity, detail });
  if (!result.migration.ledger.exists) {
    add('ledger_missing', 'blocker', 'Migration history cannot be trusted until production schema reconciliation is complete.');
  }
  for (const failure of result.migration.ledger.historyFailures) {
    add('migration_history_inconsistent', 'blocker', failure);
  }
  if (result.migration.target.ledgerState === 'not_recorded') {
    add('target_migration_not_recorded', 'blocker', `${result.migration.target.version} is not recorded in the ledger.`);
  } else if (result.migration.target.ledgerState === 'checksum_mismatch') {
    add('target_migration_checksum_mismatch', 'blocker', 'The production ledger checksum differs from the repository migration.');
  } else if (result.migration.target.ledgerState === 'duplicate_records') {
    add('target_migration_duplicate_records', 'blocker', 'The target migration has duplicate ledger records.');
  }
  if (!result.schema.warehouseReady) {
    add(
      'warehouse_schema_missing',
      'blocker',
      `${result.schema.missingTargetRelations.length} target relation(s) and ${result.schema.missingTargetColumns.length} target column(s) are missing.`,
    );
  }
  if (result.source.product.available && result.source.product.duplicateGroups > 0) {
    add('product_source_duplicates', 'warning', `${result.source.product.duplicateGroups} duplicate material/date group(s) exist.`);
  }
  if (result.source.live.available && result.source.live.duplicateGroups > 0) {
    add('live_source_duplicates', 'warning', `${result.source.live.duplicateGroups} duplicate material/date group(s) exist.`);
  }
  if (result.bindings.duplicateActiveAssetMaterialGroups > 0) {
    add(
      'duplicate_active_bindings',
      'warning',
      `${result.bindings.duplicateActiveAssetMaterialGroups} duplicate active asset/material group(s) exist.`,
    );
  }
  if (result.source.totalRows === 0) {
    add('source_data_missing', 'blocker', 'No qianchuan source rows are available for cutover validation.');
  }
  if (result.schema.warehouseReady && !result.warehouse.populated) {
    add('warehouse_unpopulated', 'blocker', 'The qianchuan DWD/DWS relations exist but are not populated end to end.');
  }
  if (!result.bindings.coverageSufficient) {
    add(
      'binding_coverage_insufficient',
      'blocker',
      `Combined source binding coverage is ${result.bindings.combined.coveragePct}% (minimum ${result.bindings.minimumCoveragePct}%).`,
    );
  }
  if (result.ready) {
    add('ready_for_live_validation', 'info', 'Ledger, schema, population, and binding gates are ready for live API/browser validation.');
  }
  return findings;
}

function normalizeCoverageRows(rows, minimumCoveragePct) {
  const defaults = {
    product: { sourceMaterials: 0, matchedMaterials: 0, matchedAssets: 0, coveragePct: 0 },
    live: { sourceMaterials: 0, matchedMaterials: 0, matchedAssets: 0, coveragePct: 0 },
    combined: { sourceMaterials: 0, matchedMaterials: 0, matchedAssets: 0, coveragePct: 0 },
  };
  for (const row of rows) {
    if (!Object.hasOwn(defaults, row.scope)) continue;
    const sourceMaterials = numericValue(row.source_materials);
    const matchedMaterials = numericValue(row.matched_materials);
    defaults[row.scope] = {
      sourceMaterials,
      matchedMaterials,
      matchedAssets: numericValue(row.matched_assets),
      coveragePct: percentage(matchedMaterials, sourceMaterials),
    };
  }
  return {
    ...defaults,
    coverageSufficient: defaults.combined.sourceMaterials > 0
      && defaults.combined.coveragePct >= minimumCoveragePct,
  };
}

export async function runQianchuanProductionCutoverReadiness({
  client,
  descriptor,
  minimumCoveragePct = 95,
  now = () => new Date(),
  records,
  statementTimeoutMs = 15000,
}) {
  if (descriptor.ledgerTable !== 'public.aios_schema_migrations') {
    throw new Error(`Unsupported migration ledger table: ${descriptor.ledgerTable}.`);
  }
  const targetRecord = records.find((record) => (
    record.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    && record.version === QIANCHUAN_CUTOVER_TARGET_MIGRATION.version
  ));
  if (!targetRecord) throw new Error(`Target migration ${QIANCHUAN_CUTOVER_TARGET_MIGRATION.version} was not discovered.`);

  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const relationRows = (await client.query(SQL.relations, [QIANCHUAN_CUTOVER_RELATIONS])).rows ?? [];
    const relationPresence = new Map(QIANCHUAN_CUTOVER_RELATIONS.map((relation) => [relation, false]));
    for (const row of relationRows) relationPresence.set(row.relation_name, Boolean(row.resolved_name));

    const schemas = QIANCHUAN_CUTOVER_REQUIRED_COLUMNS.map(([schema]) => schema);
    const tables = QIANCHUAN_CUTOVER_REQUIRED_COLUMNS.map(([, table]) => table);
    const columns = QIANCHUAN_CUTOVER_REQUIRED_COLUMNS.map(([, , column]) => column);
    const columnRows = (await client.query(SQL.columns, [schemas, tables, columns])).rows ?? [];
    const columnPresence = new Map(
      QIANCHUAN_CUTOVER_REQUIRED_COLUMNS.map(([schema, table, column]) => [columnKey(schema, table, column), false]),
    );
    for (const row of columnRows) {
      columnPresence.set(columnKey(row.table_schema, row.table_name, row.column_name), row.present === true);
    }

    const ledgerExists = relationPresence.get('public.aios_schema_migrations') === true;
    const ledgerRows = ledgerExists ? (await client.query(SQL.ledger)).rows ?? [] : [];
    const history = ledgerExists
      ? compareAiosMigrationHistory(records, ledgerRows)
      : { failures: [], summaries: [] };
    const targetLedgerRows = ledgerRows.filter((row) => (
      row.namespace === targetRecord.namespace && row.version === targetRecord.version
    ));
    const ledgerState = targetLedgerState({ ledgerExists, targetLedgerRows, targetRecord });

    const sourceRequirements = {
      product: {
        relation: 'ods.douyin_qianchuan_shortvideo_raw',
        columns: ['material_id', 'stat_date', 'ingest_time'],
      },
      live: {
        relation: 'ods.douyin_qianchuan_live_video_raw',
        columns: ['material_id', 'stat_date', 'ingest_time'],
      },
    };
    const source = {};
    const availableSourceTypes = [];
    for (const [sourceType, requirement] of Object.entries(sourceRequirements)) {
      const available = relationPresence.get(requirement.relation) === true
        && hasRequiredColumns(columnPresence, requirement.relation, requirement.columns);
      if (available) availableSourceTypes.push(sourceType);
      const row = available ? await queryFirst(client, SOURCE_SQL[sourceType]) : {};
      source[sourceType] = mapSourceMetrics(row, available);
    }

    const acceptanceRelation = 'ods.douyin_trade_sale_live_raw';
    const acceptanceAvailable = relationPresence.get(acceptanceRelation) === true
      && hasRequiredColumns(
        columnPresence,
        acceptanceRelation,
        ['anchor_douyin_id', 'live_start_time'],
      );
    const acceptanceRow = acceptanceAvailable ? await queryFirst(client, SQL.liveAcceptanceSource) : {};
    source.liveAcceptance = {
      available: acceptanceAvailable,
      rows: numericValue(acceptanceRow.rows),
      anchors: numericValue(acceptanceRow.anchors),
      minDate: temporalValue(acceptanceRow.min_date),
      maxDate: temporalValue(acceptanceRow.max_date),
      latestIngest: temporalValue(acceptanceRow.latest_ingest),
    };
    source.crossSourceMaterialIds = availableSourceTypes.length === 2
      ? numericValue((await queryFirst(client, SQL.crossSourceOverlap)).material_ids)
      : 0;
    source.totalRows = source.product.rows + source.live.rows;
    source.totalDistinctMaterialsUpperBound = source.product.materials + source.live.materials;

    const identityRelation = 'ads.marketing_content_ad_materials';
    const identityAvailable = relationPresence.get(identityRelation) === true
      && hasRequiredColumns(
        columnPresence,
        identityRelation,
        ['asset_id', 'ad_platform', 'external_material_id', 'relation_status', 'source'],
      );
    const identityRow = identityAvailable ? await queryFirst(client, SQL.identities) : {};
    const coverageRows = identityAvailable && availableSourceTypes.length
      ? (await client.query(buildCoverageSql(availableSourceTypes))).rows ?? []
      : [];
    const coverage = normalizeCoverageRows(coverageRows, minimumCoveragePct);
    const bindings = {
      available: identityAvailable,
      activeIdentityRows: numericValue(identityRow.active_rows),
      distinctIdentityMaterialIds: numericValue(identityRow.distinct_material_ids),
      identityBoundAssets: numericValue(identityRow.bound_assets),
      duplicateActiveAssetMaterialGroups: numericValue(identityRow.duplicate_active_asset_material_groups),
      sourceRowsByBindingOrigin: identityRow.source_rows ?? {},
      product: coverage.product,
      live: coverage.live,
      combined: coverage.combined,
      minimumCoveragePct,
      coverageSufficient: coverage.coverageSufficient,
    };

    const dwdAvailable = relationPresence.get(TARGET_RELATIONS[0]) === true
      && hasRequiredColumns(
        columnPresence,
        TARGET_RELATIONS[0],
        ['material_id', 'stat_date', 'asset_id', 'objective', 'source_table'],
      );
    const materialSummaryAvailable = relationPresence.get(TARGET_RELATIONS[1]) === true
      && hasRequiredColumns(columnPresence, TARGET_RELATIONS[1], ['material_id', 'asset_id', 'last_stat_date']);
    const assetSummaryAvailable = relationPresence.get(TARGET_RELATIONS[2]) === true
      && hasRequiredColumns(columnPresence, TARGET_RELATIONS[2], ['asset_id', 'last_stat_date']);
    const acceptanceWarehouseAvailable = relationPresence.get(TARGET_RELATIONS[3]) === true
      && hasRequiredColumns(
        columnPresence,
        TARGET_RELATIONS[3],
        ['stat_date', 'douyin_account_display_id'],
      );
    const thinFactAvailable = relationPresence.get('dwd.marketing_content_ad_material_stats_di') === true
      && hasRequiredColumns(
        columnPresence,
        'dwd.marketing_content_ad_material_stats_di',
        ['ad_platform', 'external_material_id'],
      );
    const dwdRow = dwdAvailable ? await queryFirst(client, SQL.dwd) : {};
    const materialSummaryRow = materialSummaryAvailable ? await queryFirst(client, SQL.materialSummary) : {};
    const assetSummaryRow = assetSummaryAvailable ? await queryFirst(client, SQL.assetSummary) : {};
    const acceptanceWarehouseRow = acceptanceWarehouseAvailable
      ? await queryFirst(client, SQL.liveAcceptanceWarehouse)
      : {};
    const thinFactRow = thinFactAvailable ? await queryFirst(client, SQL.thinFact) : {};
    const warehouse = {
      dwd: {
        available: dwdAvailable,
        rows: numericValue(dwdRow.rows),
        materials: numericValue(dwdRow.materials),
        boundAssets: numericValue(dwdRow.bound_assets),
        latestDate: temporalValue(dwdRow.latest_date),
        productMaterials: numericValue(dwdRow.product_materials),
        liveMaterials: numericValue(dwdRow.live_materials),
      },
      materialSummary: {
        available: materialSummaryAvailable,
        rows: numericValue(materialSummaryRow.rows),
        materials: numericValue(materialSummaryRow.materials),
        boundAssets: numericValue(materialSummaryRow.bound_assets),
        latestDate: temporalValue(materialSummaryRow.latest_date),
      },
      assetSummary: {
        available: assetSummaryAvailable,
        rows: numericValue(assetSummaryRow.rows),
        populatedAssets: numericValue(assetSummaryRow.populated_assets),
        latestDate: temporalValue(assetSummaryRow.latest_date),
      },
      liveAcceptance: {
        available: acceptanceWarehouseAvailable,
        rows: numericValue(acceptanceWarehouseRow.rows),
        accounts: numericValue(acceptanceWarehouseRow.accounts),
        latestDate: temporalValue(acceptanceWarehouseRow.latest_date),
      },
      thinFact: {
        available: thinFactAvailable,
        rows: numericValue(thinFactRow.rows),
        materials: numericValue(thinFactRow.materials),
      },
    };
    warehouse.populated = warehouse.dwd.rows > 0
      && warehouse.materialSummary.rows > 0
      && warehouse.assetSummary.rows > 0;

    const videoJobsRelation = 'ads.marketing_content_asset_video_understanding_jobs';
    const videoResultsRelation = 'ads.marketing_content_asset_video_understanding_results';
    const assetRelation = 'ads.marketing_content_assets';
    const videoJobsAvailable = relationPresence.get(videoJobsRelation) === true
      && hasRequiredColumns(columnPresence, videoJobsRelation, ['asset_id', 'analysis_schema_version', 'status']);
    const videoResultsAvailable = relationPresence.get(videoResultsRelation) === true
      && hasRequiredColumns(columnPresence, videoResultsRelation, ['asset_id', 'analysis_schema_version', 'result_json']);
    const aiWritebackAvailable = relationPresence.get(assetRelation) === true
      && hasRequiredColumns(columnPresence, assetRelation, ['ai_summary', 'ai_score', 'analysis_object_key']);
    const videoJobsRow = videoJobsAvailable ? await queryFirst(client, SQL.videoJobs) : {};
    const videoResultsRow = videoResultsAvailable ? await queryFirst(client, SQL.videoResults) : {};
    const aiWritebackRow = aiWritebackAvailable ? await queryFirst(client, SQL.aiWriteback) : {};
    const ai = {
      jobs: {
        available: videoJobsAvailable,
        rows: numericValue(videoJobsRow.rows),
        succeededRows: numericValue(videoJobsRow.succeeded_rows),
        assets: numericValue(videoJobsRow.assets),
        schemaV21Rows: numericValue(videoJobsRow.schema_v21_rows),
      },
      results: {
        available: videoResultsAvailable,
        rows: numericValue(videoResultsRow.rows),
        assets: numericValue(videoResultsRow.assets),
        schemaV21Rows: numericValue(videoResultsRow.schema_v21_rows),
        structuredRows: numericValue(videoResultsRow.structured_rows),
      },
      assetsWithWriteback: numericValue(aiWritebackRow.assets),
      writebackAvailable: aiWritebackAvailable,
    };

    const missingRelations = QIANCHUAN_CUTOVER_RELATIONS.filter((relation) => !relationPresence.get(relation));
    const missingColumns = [...columnPresence.entries()]
      .filter(([, present]) => !present)
      .map(([key]) => key);
    const missingTargetRelations = TARGET_RELATIONS.filter((relation) => !relationPresence.get(relation));
    const missingTargetIdentityColumns = relationColumnKeys(
      'ads.marketing_content_ad_materials',
      TARGET_AD_MATERIAL_COLUMNS,
    ).filter((key) => columnPresence.get(key) !== true);
    const missingTargetSourceColumns = relationColumnKeys(
      'ods.douyin_qianchuan_live_video_raw',
      QIANCHUAN_LIVE_VIDEO_SETTLEMENT_HORIZON_COLUMNS,
    ).filter((key) => columnPresence.get(key) !== true);
    const missingTargetRelationColumns = Object.entries(TARGET_RELATION_COLUMNS).flatMap(([relation, columns]) => (
      relationPresence.get(relation)
        ? relationColumnKeys(relation, columns).filter((key) => columnPresence.get(key) !== true)
        : []
    ));
    const missingTargetColumns = [
      ...missingTargetIdentityColumns,
      ...missingTargetSourceColumns,
      ...missingTargetRelationColumns,
    ];
    const warehouseSchemaReady = missingTargetRelations.length === 0 && missingTargetColumns.length === 0;
    const targetLedgerStatus = ledgerState;
    const status = statusForAudit({
      bindingCoverageSufficient: bindings.coverageSufficient,
      historyFailures: history.failures,
      ledgerExists,
      sourceRows: source.totalRows,
      targetLedgerStatus,
      warehousePopulated: warehouse.populated,
      warehouseSchemaReady,
    });
    const result = {
      schemaVersion: 1,
      auditedAt: now().toISOString(),
      mode: 'live_readonly',
      status,
      ready: status === 'ready_for_live_validation',
      readOnlyTransaction: true,
      statementTimeoutMs: Math.trunc(statementTimeoutMs),
      migration: {
        inventory: migrationInventory(records),
        ledger: {
          exists: ledgerExists,
          recordedRows: ledgerRows.length,
          historyFailures: history.failures,
          namespaceSummaries: history.summaries.map((summary) => ({
            namespace: summary.namespace,
            applied: summary.applied,
            pending: summary.pending,
            total: summary.total,
          })),
        },
        target: {
          namespace: targetRecord.namespace,
          version: targetRecord.version,
          relativePath: targetRecord.relativePath,
          checksum: targetRecord.checksum,
          ledgerState: targetLedgerStatus,
          recordedChecksum: targetLedgerRows[0]?.checksum ?? null,
        },
      },
      schema: {
        warehouseReady: warehouseSchemaReady,
        missingRelations,
        missingColumns,
        missingTargetRelations,
        missingTargetColumns,
      },
      source,
      bindings,
      warehouse,
      ai,
      findings: [],
    };
    result.findings = buildFindings(result);
    return result;
  });
}
