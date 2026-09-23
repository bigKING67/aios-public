export function parseQianchuanProductionCutoverArgs(args) {
  const options = {
    help: false,
    json: false,
    requireReady: false,
  };
  for (const argument of args) {
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--require-ready') options.requireReady = true;
    else throw new Error(`Unknown qianchuan cutover audit option: ${argument}.`);
  }
  return options;
}

function boundedNumber(value, { defaultValue, maximum, minimum, name }) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function resolveQianchuanProductionCutoverConfig(env) {
  if (env.AIOS_QC_ALLOW_LIVE_READONLY !== '1') {
    throw new Error('AIOS_QC_ALLOW_LIVE_READONLY=1 is required for the production read-only audit.');
  }
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required for the production read-only audit.');
  return {
    connectionString,
    statementTimeoutMs: boundedNumber(env.STATEMENT_TIMEOUT_MS, {
      defaultValue: 15000,
      maximum: 120000,
      minimum: 1000,
      name: 'STATEMENT_TIMEOUT_MS',
    }),
    minimumCoveragePct: boundedNumber(env.MIN_QIANCHUAN_BINDING_COVERAGE_PCT, {
      defaultValue: 95,
      maximum: 100,
      minimum: 0,
      name: 'MIN_QIANCHUAN_BINDING_COVERAGE_PCT',
    }),
  };
}

export function qianchuanProductionCutoverExitCode(result, requireReady) {
  return requireReady && !result.ready ? 1 : 0;
}

function namespaceSummaryText(inventory) {
  return Object.entries(inventory.namespaces)
    .map(([namespace, summary]) => `${namespace}:${summary.total}`)
    .join(',');
}

export function formatQianchuanProductionCutoverReadiness(result) {
  const lines = [
    '[qianchuan-production-cutover-readiness]',
    `mode=${result.mode} status=${result.status} ready=${result.ready}`,
    `migration inventory=${result.migration.inventory.total} namespaces=${namespaceSummaryText(result.migration.inventory)} ledger=${result.migration.ledger.exists ? 'present' : 'missing'} target=${result.migration.target.ledgerState}`,
    `schema warehouse_ready=${result.schema.warehouseReady} missing_target_relations=${result.schema.missingTargetRelations.length} missing_target_columns=${result.schema.missingTargetColumns.length}`,
    `source product_rows=${result.source.product.rows} product_materials=${result.source.product.materials} live_rows=${result.source.live.rows} live_materials=${result.source.live.materials} cross_source_ids=${result.source.crossSourceMaterialIds}`,
    `bindings identity_assets=${result.bindings.identityBoundAssets} matched=${result.bindings.combined.matchedMaterials}/${result.bindings.combined.sourceMaterials} coverage_pct=${result.bindings.combined.coveragePct} minimum_pct=${result.bindings.minimumCoveragePct}`,
    `warehouse dwd_rows=${result.warehouse.dwd.rows} dwd_bound_assets=${result.warehouse.dwd.boundAssets} material_summary_rows=${result.warehouse.materialSummary.rows} asset_summary_rows=${result.warehouse.assetSummary.rows} thin_fact_rows=${result.warehouse.thinFact.rows}`,
    `ai jobs_succeeded=${result.ai.jobs.succeededRows} results=${result.ai.results.rows} schema_v21_results=${result.ai.results.schemaV21Rows} assets_with_writeback=${result.ai.assetsWithWriteback}`,
  ];
  for (const finding of result.findings) {
    lines.push(`finding severity=${finding.severity} code=${finding.code} detail=${finding.detail}`);
  }
  return lines.join('\n');
}
