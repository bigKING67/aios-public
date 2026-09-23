#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'dashboard-industry-material-inspiration-contract';
const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const PATHS = {
  api: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-api.ts',
  transport:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-transport.ts',
  backend: 'backend-rust/src/dashboard/industry_material_inspiration.rs',
  backendQuerySqlModule: 'backend-rust/src/dashboard/industry_material_inspiration/query_sql.rs',
  backendWorkerTrigger:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_ai_worker_trigger.rs',
  backendBackfillEnqueue:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_ai_backfill_enqueue.rs',
  backendThemeSourceSql:
    'backend-rust/src/dashboard/industry_material_inspiration/theme_source_ctes.sql',
  backendFusionSql: 'backend-rust/src/dashboard/industry_material_inspiration/fusion_score_ctes.sql',
  backendContentThemeSql:
    'backend-rust/src/dashboard/industry_material_inspiration/content_theme_scoring_ctes.sql',
  backendBackfillAssetsSql:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_ai_backfill_assets.sql',
  backendBackfillScopeSql:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_ai_backfill_scope.sql',
  backendBrandResolutionModule:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_resolution_sql.rs',
  backendBrandResolutionSourceSql:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_resolution_source_cte.sql',
  backendBrandResolutionEffectiveSql:
    'backend-rust/src/dashboard/industry_material_inspiration/brand_resolution_effective_join.sql',
  backendStorageReadinessSql:
    'backend-rust/src/dashboard/industry_material_inspiration/video_understanding_storage_readiness.sql',
  analysisJobs: 'backend-rust/src/marketing/content_assets/processing_mutations/analysis_jobs.rs',
  prefectTrigger: 'backend-rust/src/marketing/content_assets/prefect_trigger.rs',
  analysisProcessor: 'etl/groland_postgres/scripts/marketing_content_assets/analysis_processor.py',
  arkResponses: 'etl/groland_postgres/scripts/marketing_content_assets/ark_responses.py',
  brandResolutionProvider:
    'etl/groland_postgres/scripts/marketing_content_assets/brand_resolution_provider.py',
  brandResolutionContract:
    'etl/groland_postgres/scripts/marketing_content_assets/brand_resolution_contract.py',
  brandResolutionProcessor:
    'etl/groland_postgres/scripts/marketing_content_assets/brand_resolution_processor.py',
  brandResolutionCli: 'etl/groland_postgres/scripts/resolve_industry_material_brands.py',
  brandResolutionProcessorTest:
    'etl/groland_postgres/tests/test_marketing_content_brand_resolution_processor.py',
  backendRoutes: 'backend-rust/src/dashboard.rs',
  client: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-client.tsx',
  clientQuery:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/use-industry-material-inspiration-query.ts',
  clientContent:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-content.tsx',
  clientTopBar:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-top-bar.tsx',
  clientHelpers: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-client-helpers.ts',
  panel: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-ai-insight-panel.tsx',
  panelHelpers: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-ai-insight-panel-helpers.ts',
  panelCss: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-ai-insight-panel.module.css',
  brandAiSummary: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-ai-summary.tsx',
  brandAiSummaryCss:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-ai-summary.module.css',
  brandContentThemeMap:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-content-theme-map.tsx',
  brandContentThemeMapCss:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-content-theme-map.module.css',
  brandEvidenceSection:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-evidence-section.tsx',
  brandEvidenceSectionCss:
    'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-brand-evidence-section.module.css',
  profileCard: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-analysis-profile-card.tsx',
  profileCardCss: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-analysis-profile-card.module.css',
  fusionScorecard: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-fusion-scorecard.tsx',
  fusionScorecardCss: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-fusion-scorecard.module.css',
  tableColumns: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-table-columns.tsx',
  tableCells: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-table-cells.tsx',
  creatorCss: 'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard.module.css',
  css: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration.module.css',
  cellCss: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-table-cells.module.css',
  adsBrandMigration:
    'etl/groland_postgres/sql/migrations/20260628_1615__derive_industry_material_brand_from_title.sql',
  brandResolutionMigration:
    'etl/groland_postgres/sql/migrations/20260721_1328__add_industry_material_brand_resolutions.sql',
  structuredStorageMigration:
    'etl/groland_postgres/sql/migrations/20260713_1100__ensure_marketing_content_video_understanding_storage.sql',
  structuredStorageCheck:
    'etl/groland_postgres/tests/sql/marketing_content_video_understanding_storage_check.sql',
  designAuthority: 'DESIGN.md',
  designTokens: 'apps/web-vite/src/styles/design-tokens.css',
  formatters: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-formatters.ts',
  monthlySqlCheck: 'etl/groland_postgres/tests/sql/douyin_qianchuan_industry_material_inspiration_monthly_check.sql',
  navigation: 'apps/web-vite/src/components/organisms/layout-navigation-model.tsx',
  page: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/page.tsx',
  registry: 'apps/web-vite/src/lib/route-policy-registry.ts',
  routes: 'apps/web-vite/src/routes.tsx',
  tagCells: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-tag-cells.tsx',
  tagLayout: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-tag-layout.ts',
  types: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-types.ts',
  yuntuRepository: 'etl/groland_postgres/scripts/marketing_content_assets/yuntu_archive_repository.py',
};

const REQUIRED_TABLE_LABELS = [
  '排名',
  '品牌',
  '视频',
  '产品',
  '核心人群',
  '营销卖点',
  '曝光',
  '完播率',
  'CTR',
  'CVR',
  '3S播放率',
  '5S播放率',
  '互动率',
  'PVR',
];

const FORBIDDEN_TABLE_LABELS = [
  '月份',
  '视频类型',
  '千川场景',
  '发布时间',
];

const FORBIDDEN_API_ROW_KEYS = [
  'archiveStatus',
  'cdnUrl',
  'cdn_url',
  'tosBucket',
  'tos_bucket',
  'tosObjectKey',
  'tos_object_key',
  'rawSha256',
  'raw_sha256',
  'rowPayload',
  'row_payload',
  'requestPayload',
  'request_payload',
  'cdnEvidence',
  'cdn_evidence',
];

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

function assertIncludes(source, expected, message) {
  assert.match(source, new RegExp(escapeRegExp(expected), 'u'), message);
}

function assertNotIncludes(source, unexpected, message) {
  assert.doesNotMatch(source, new RegExp(escapeRegExp(unexpected), 'u'), message);
}

function getCssRuleBlock(source, selector, message) {
  const selectorMatch = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{`, 'u').exec(source);
  assert.notEqual(selectorMatch, null, `${message}: missing selector ${selector}`);
  const openIndex = source.indexOf('{', selectorMatch.index);
  const closeIndex = source.indexOf('}', openIndex);
  assert.ok(openIndex !== -1 && closeIndex !== -1, `${message}: selector ${selector} should have a CSS block`);
  return source.slice(openIndex + 1, closeIndex);
}

function assertCssRuleIncludes(source, selector, expectedDeclaration, message) {
  const block = getCssRuleBlock(source, selector, message);
  assert.match(block, new RegExp(escapeRegExp(expectedDeclaration), 'u'), message);
}

function assertCssRuleNotIncludes(source, selector, unexpectedDeclaration, message) {
  const block = getCssRuleBlock(source, selector, message);
  assert.doesNotMatch(block, new RegExp(escapeRegExp(unexpectedDeclaration), 'u'), message);
}

function assertOrderedIncludes(source, labels, message) {
  let previousIndex = -1;
  for (const label of labels) {
    const token = `title: '${label}'`;
    const nextIndex = source.indexOf(token);
    assert.notEqual(nextIndex, -1, `${message}: missing ${label}`);
    assert.ok(nextIndex > previousIndex, `${message}: ${label} should appear after the previous column`);
    previousIndex = nextIndex;
  }
}

function extractColumnDefinitionByTitle(source, label) {
  const titleToken = `title: '${label}'`;
  const titleIndex = source.indexOf(titleToken);
  assert.notEqual(titleIndex, -1, `table column ${label} should exist`);

  const objectStart = source.lastIndexOf('{', titleIndex);
  assert.notEqual(objectStart, -1, `table column ${label} should have an object definition`);

  let depth = 0;
  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  assert.fail(`table column ${label} should have a closed object definition`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSourceAlias(importPath) {
  const basePath = path.join(REPO_ROOT, 'apps/web-vite/src', importPath.slice(2));
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];
  return candidates.find((candidatePath) => existsSync(candidatePath)) ?? basePath;
}

async function importIndustryMaterialApi() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'industry-material-inspiration-'));
  const entryPath = path.join(tempDir, 'entry.ts');
  const outputPath = path.join(tempDir, 'bundle.mjs');
  const requestStubPath = path.join(tempDir, 'request-stub.ts');

  await writeFile(
    requestStubPath,
    [
      'export const request = {',
      '  get: async () => {',
      "    throw new Error('request.get should not be called by contract normalization tests');",
      '  },',
      '  post: async () => {',
      "    throw new Error('request.post should not be called by contract normalization tests');",
      '  },',
      '};',
      '',
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    entryPath,
    [
      `export {`,
      `  normalizeIndustryMaterialBrandAiBackfillResponse,`,
      `  normalizeIndustryMaterialMonth,`,
      `  normalizeIndustryMaterialResponse,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, PATHS.api))};`,
      `export {`,
      `  resolveBrandAiCoverageState,`,
      `  resolveBrandAiExecutiveSummary,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, PATHS.panelHelpers))};`,
      `export {`,
      `  formatIndustryMaterialBrandResolutionTooltip,`,
      `  resolveIndustryMaterialDisplayBrand,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, PATHS.formatters))};`,
      '',
    ].join('\n'),
    'utf8'
  );

  await build({
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    plugins: [
      {
        name: 'aios-path-alias',
        setup(buildContext) {
          buildContext.onResolve({ filter: /^@\/lib\/request$/ }, () => ({
            path: requestStubPath,
          }));
          buildContext.onResolve({ filter: /^@\// }, (args) => ({
            path: resolveSourceAlias(args.path),
          }));
        },
      },
    ],
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function importIndustryMaterialTagLayout() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'industry-material-tags-'));
  const entryPath = path.join(tempDir, 'entry.ts');
  const outputPath = path.join(tempDir, 'bundle.mjs');

  await writeFile(
    entryPath,
    [
      `export {`,
      `  isMediumSellingPointTag,`,
      `  isWideSellingPointTag,`,
      `  resolveTagGroupCell,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, PATHS.tagLayout))};`,
      '',
    ].join('\n'),
    'utf8'
  );

  await build({
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function assertStaticContracts(sources) {
  const panelRuntimeSource = [
    sources.panel,
    sources.panelHelpers,
    sources.profileCard,
    sources.brandAiSummary,
    sources.brandEvidenceSection,
  ].join('\n');
  const profileCardSource = [sources.profileCard, sources.profileCardCss].join('\n');
  const backendRuntimeSource = [sources.backend, sources.backendWorkerTrigger].join('\n');
  const clientRuntimeSource = [sources.client, sources.clientQuery].join('\n');

  assertIncludes(
    sources.registry,
    "dashboardIndustryMaterialInspiration: '/dashboard/industry-material-inspiration'",
    'route registry should expose the industry material inspiration route path'
  );
  assertIncludes(
    sources.registry,
    "kind: 'content_assets_write'",
    'route registry should restrict industry material inspiration to content operations write access'
  );
  assertIncludes(
    sources.routes,
    "import('@/app/dashboard/industry-material-inspiration/page')",
    'Vite routes should lazy-load the industry material inspiration page'
  );
  assertIncludes(
    sources.routes,
    'ROUTE_PATHS.dashboardIndustryMaterialInspiration',
    'Vite routes should register the route through ROUTE_PATHS'
  );
  assertIncludes(
    sources.navigation,
    '行业素材灵感',
    'layout navigation should expose 行业素材灵感 under 看板'
  );
  assertIncludes(
    sources.navigation,
    'ROUTE_PATHS.dashboardIndustryMaterialInspiration',
    'layout navigation should use the route constant for 行业素材灵感'
  );

  assertIncludes(sources.page, '<ProtectedRoute>', 'page should remain protected');
  assertNotIncludes(
    sources.page,
    '<Layout>',
    'page should not render inside the global app layout; it should match the standalone dashboard shell'
  );
  assertNotIncludes(
    sources.page,
    "components/organisms/layout",
    'page should not import the global app layout chrome'
  );

  assertIncludes(
    sources.types,
    "'douyin_live_lead_short_video' | 'douyin_goods_short_video' | 'xhs_note'",
    'client type contract should split Douyin material into two business tabs plus Xiaohongshu'
  );
  assertIncludes(
    sources.clientHelpers,
    "'douyin_live_lead_short_video'",
    'client helper should keep the Douyin live lead short-video tab key'
  );
  assertIncludes(
    sources.clientHelpers,
    "'douyin_goods_short_video'",
    'client helper should keep the Douyin goods short-video tab key'
  );
  assertIncludes(sources.clientHelpers, "'xhs_note'", 'client helper should keep the Xiaohongshu placeholder tab key');
  assertIncludes(sources.clientHelpers, '抖音直播引流短视频', 'client helper should render 抖音直播引流短视频 tab label');
  assertIncludes(sources.clientHelpers, '抖音带货短视频', 'client helper should render 抖音带货短视频 tab label');
  assertIncludes(sources.clientHelpers, '小红书笔记', 'client helper should render 小红书笔记 tab label');
  assertNotIncludes(
    sources.clientHelpers,
    "'douyin_video'",
    'client helper should not keep the collapsed Douyin video tab key'
  );
  assertIncludes(
    sources.client,
    'Groland Intelligence',
    'client should keep the top-bar product brand unchanged'
  );
  assertNotIncludes(
    sources.client,
    '千川 / 云图素材智能',
    'client should not replace the product brand with source labels'
  );
  assertIncludes(
    sources.client,
    '全量素材明细',
    'client should identify the table as the full-detail evidence section'
  );
  assertIncludes(
    sources.client,
    '以上 AI 洞察展示 Top 5 代表证据；以下为当前筛选条件下的全量素材明细。',
    'client should explain the transition from representative AI evidence to the full table'
  );
  assertNotIncludes(
    sources.client,
    'Douyin video material',
    'client should not expose the English Douyin table eyebrow'
  );
  assertIncludes(sources.client, 'HomeOutlined', 'client top bar should keep the same home icon entry as dashboard');
  assertIncludes(sources.client, 'to="/"', 'client top bar home icon should link back to the home page');
  assertNotIncludes(
    sources.client,
    'AIOS / Dashboard',
    'client should not keep the temporary hero eyebrow from the first layout'
  );
  assertNotIncludes(
    sources.client,
    'styles.introPanel',
    'client should not keep the temporary page hero panel; content should start with dashboard-like data sections'
  );

  for (const label of REQUIRED_TABLE_LABELS) {
    assertIncludes(sources.tableColumns, `title: '${label}'`, `table should include column label ${label}`);
  }
  for (const label of FORBIDDEN_TABLE_LABELS) {
    assertNotIncludes(sources.tableColumns, `title: '${label}'`, `table should not include redundant column label ${label}`);
  }
  assertOrderedIncludes(
    sources.tableColumns,
    REQUIRED_TABLE_LABELS,
    'table columns should start with ranking and keep business metric order'
  );

  const brandColumn = extractColumnDefinitionByTitle(sources.tableColumns, '品牌');
  assertIncludes(brandColumn, 'width: 140', 'brand column should stay narrowed to 140px');

  const audienceColumn = extractColumnDefinitionByTitle(sources.tableColumns, '核心人群');
  assertIncludes(audienceColumn, 'width: 320', 'core audience column should stay widened to 320px');
  assertIncludes(audienceColumn, "align: 'left'", 'core audience column body should be left-aligned');
  assertNotIncludes(audienceColumn, "align: 'center'", 'core audience column should not stay centered');

  const sellingPointColumn = extractColumnDefinitionByTitle(sources.tableColumns, '营销卖点');
  assertIncludes(sellingPointColumn, 'width: 400', 'marketing selling-point column should stay widened to 400px');
  assertIncludes(sellingPointColumn, "align: 'left'", 'marketing selling-point column body should be left-aligned');
  assertNotIncludes(sellingPointColumn, "align: 'center'", 'marketing selling-point column should not stay centered');

  assertIncludes(sources.client, 'locale={datePickerZhCN}', 'month picker should use the Chinese AntD locale');
  assertNotIncludes(
    sources.client,
    '业务表格只展示品牌',
    'table section should not keep an implementation-style explanatory sentence below the heading'
  );
  assertNotIncludes(
    sources.client,
    'resolveText(row.brandName, row.brand)',
    'brand cells should not render the source brand-scope text directly'
  );
  assertIncludes(
    sources.tableCells,
    'resolveIndustryMaterialDisplayBrand(row)',
    'brand cells should render the backend-owned effective brand helper'
  );
  assertIncludes(sources.tableColumns, '<BrandCell row={row}', 'brand cells should receive row-level resolution evidence');
  assertIncludes(sources.tableCells, '<Tooltip title={tooltip}', 'brand provenance should use an inspection tooltip');
  assertIncludes(sources.client, 'const rows = useMemo(', 'client should stabilize conditional row arrays before using them in memoized table and summary derivations');
  assertIncludes(
    sources.client,
    'ALL_BRANDS_KEY',
    'brand filter should model the default all-brands option explicitly'
  );
  assertIncludes(sources.clientHelpers, "export const ALL_BRANDS_LABEL = '全部'", 'brand filter default label should be 全部');
  assertIncludes(sources.client, 'resolveInitialBrandKey(searchParams)', 'client should initialize brand state from URL');
  assertIncludes(sources.clientHelpers, "searchParams.get('brand')", 'client helper should parse the brand URL parameter');
  assertIncludes(
    sources.clientHelpers,
    "nextParams.set('brand', normalizedBrandKey)",
    'client helper should write selected brand into URL'
  );
  assertIncludes(
    sources.clientHelpers,
    "nextParams.delete('brand')",
    'client helper should delete brand from URL for all-brands scope'
  );
  assertIncludes(
    sources.client,
    'const canonicalBrandKey = data.selectedBrand?.key',
    'client should canonicalize label/alias brand URL values to API selected brand keys'
  );
  assertIncludes(
    sources.client,
    "normalizeBrandKey(searchParams.get('brand')) !== ALL_BRANDS_KEY",
    'client should clean redundant brand=all URL parameters without waiting for a control interaction'
  );
  assertNotIncludes(
    sources.client,
    'placeholderData:',
    'client should not render stale previous-brand rows or insight during brand-scope fetches'
  );
  assertNotIncludes(
    sources.client,
    'keepPreviousData',
    'client should avoid React Query previous-data placeholder for brand-scoped data'
  );
  assertIncludes(
    clientRuntimeSource,
    "const dashboardQueryKey = [\n    'dashboard',\n    'industry-material-inspiration'",
    'React Query cache key should include selected brand'
  );
  assertIncludes(
    clientRuntimeSource,
    'queryKey: dashboardQueryKey',
    'client should reuse the current dashboard query key for fetch and invalidation'
  );
  assertIncludes(
    clientRuntimeSource,
    'fetchIndustryMaterialInspiration({ tab: activeTab, month, brand: apiBrand, signal })',
    'client should send selected brand to the dashboard API'
  );
  assertIncludes(
    sources.client,
    '<BrandAiInsightPanel',
    'AI insight panel should be rendered between KPI summary and detail table'
  );
  assertNotIncludes(sources.client, 'mode="multiple"', 'brand filter should no longer be a local multi-select');
  assertIncludes(
    sources.clientModule,
    'rows={tableRows}',
    'client shell should pass the API-scoped row set into the extracted table panel'
  );
  assertIncludes(
    sources.clientContent,
    'dataSource={rows}',
    'extracted detail table should render the API-scoped row set'
  );
  assertIncludes(
    sources.client,
    'buildIndustryMaterialDetailCsvText(tableRows)',
    'detail export should export the API-scoped row set'
  );
  assertIncludes(sources.client, '导出明细', 'detail toolbar should expose an export action');
  assertIncludes(
    sources.client,
    'type="primary"',
    'detail export action should use an AntD primary button instead of a neutral pill button'
  );
  assertIncludes(
    sources.client,
    'downloadDashboardCsvFile(csvText, fileName)',
    'detail export should reuse the shared dashboard CSV downloader'
  );
  for (const exportLabel of ['排名', '品牌', '视频标题', '产品', '核心人群', '营销卖点', '曝光', '完播率']) {
    assertIncludes(
      sources.clientHelpers,
      `'${exportLabel}'`,
      `detail export headers should include ${exportLabel}`
    );
  }
  assertNotIncludes(
    sources.clientHelpers,
    "'月份',",
    'detail export should not reintroduce the redundant month field'
  );
  assertNotIncludes(
    sources.clientHelpers,
    "'视频类型',",
    'detail export should not reintroduce the redundant video-type field'
  );
  assertIncludes(
    sources.backend,
    'brand: Option<String>',
    'backend query should accept optional brand'
  );
  assertIncludes(
    sources.backend,
    '.bind(requested_brand)',
    'backend SQL should bind brand as a query parameter'
  );
  assertIncludes(
    sources.backendBackfillAssetsSql,
    "JSONB_TYPEOF(latest_analysis.analysis->'video_understanding') = 'object'",
    'brand options should use the same usable-AI coverage fields as brand insight coverage'
  );
  assertIncludes(
    sources.backend,
    "to_regclass('ads.marketing_content_asset_video_understanding_results')",
    'backend should detect optional video-understanding result table before querying it'
  );
  assertIncludes(
    sources.backend,
    "to_regclass('ads.marketing_content_asset_video_understanding_jobs')",
    'backend should require both lifecycle and result tables before queueing structured backfill'
  );
  assertIncludes(
    sources.backend,
    'NULL::JSONB AS analysis',
    'backend should keep brand insights available when video-understanding results table is absent'
  );
  assertIncludes(
    sources.backend,
    '.replace(LATEST_ANALYSIS_CTE_MARKER, latest_analysis_cte)',
    'backend should switch latest-analysis CTE through an internal constant, not user input'
  );
  for (const coverageField of [
    'anyAiContentAssets',
    'structuredVideoUnderstandingAssets',
    'analysisArtifactAssets',
    'structuredVideoUnderstandingTableAvailable',
    'structuredVideoUnderstandingReady',
  ]) {
    assertIncludes(
      sources.backend,
      `'${coverageField}'`,
      `backend coverage should expose ${coverageField}`
    );
    assertIncludes(
      sources.types,
      `${coverageField}:`,
      `frontend coverage type should expose ${coverageField}`
    );
  }
  for (const tableName of [
    'ads.marketing_content_asset_video_understanding_jobs',
    'ads.marketing_content_asset_video_understanding_results',
  ]) {
    assertIncludes(
      sources.structuredStorageMigration,
      `CREATE TABLE IF NOT EXISTS ${tableName}`,
      `focused migration should create ${tableName}`
    );
    assertIncludes(
      sources.structuredStorageCheck,
      tableName,
      `readiness SQL should verify ${tableName}`
    );
  }
  assertIncludes(
    sources.analysisJobs,
    'hydrate_video_understanding_cache',
    'backend should queue a distinct existing-artifact hydration operation'
  );
  assertIncludes(
    sources.analysisJobs,
    '"model_call_expected": false',
    'artifact hydration jobs should explicitly promise no model call'
  );
  assertIncludes(
    sources.analysisProcessor,
    '_process_video_understanding_cache_hydration_job',
    'analysis worker should branch to existing-artifact hydration'
  );
  assertIncludes(
    sources.analysisProcessor,
    '"model_call_performed": False',
    'analysis worker should record that hydration did not call the model'
  );
  assertIncludes(
    sources.analysisProcessor,
    'video_understanding_cache_persisted',
    'normal and hydration jobs should expose structured persistence metadata'
  );
  assertIncludes(
    sources.backend,
    'LEFT JOIN ads.marketing_content_assets asset ON asset.asset_id = base_all.asset_id AND asset.is_deleted = FALSE',
    'brand options should join content assets before computing analyzedAssetCount'
  );
  assertIncludes(
    sources.backend,
    'try_get::<Option<Value>, _>("selected_brand_payload")',
    'backend should read nullable selected brand JSON without failing all-brands requests'
  );
  assertIncludes(
    sources.backend,
    'try_get::<Option<Value>, _>("brand_insight_payload")',
    'backend should read nullable brand insight JSON without failing all-brands requests'
  );
  assertIncludes(
    sources.backend,
    '.unwrap_or(Value::Null)',
    'backend should serialize missing selected brand or insight as JSON null'
  );
  for (const backendField of ['brand_options: Value', 'selected_brand: Value', 'brand_insight: Value']) {
    assertIncludes(
      sources.backend,
      backendField,
      `backend response should include ${backendField}`
    );
  }
  assertIncludes(
    sources.backend,
    "'analysisBoundary', (SELECT analysis_boundary_payload FROM analysis_boundary_payload)",
    'backend brand insight should expose the industry analysis boundary payload'
  );
  assertIncludes(
    sources.backend,
    "'analysisProfile', (SELECT analysis_profile_payload FROM analysis_profile_payload)",
    'backend brand insight should expose the active live/goods analysis profile payload'
  );
  assertIncludes(
    sources.backendModule,
    'include_str!("fusion_score_ctes.sql")',
    'backend should extract fusion scoring SQL instead of growing the frozen Rust module'
  );
  assertIncludes(
    sources.backend,
    'include_str!("brand_ai_backfill_assets.sql")',
    'backend should keep brand backfill candidate SQL outside the frozen Rust module'
  );
  assertIncludes(
    sources.backend,
    'include_str!("brand_ai_backfill_scope.sql")',
    'backend should keep brand scope SQL outside the frozen Rust module'
  );
  assertIncludes(
    sources.backend,
    'include_str!("video_understanding_storage_readiness.sql")',
    'backend should keep structured-storage readiness SQL outside the frozen Rust module'
  );
  assertIncludes(
    sources.backendFusionSql,
    'industry_metric_benchmarks AS',
    'fusion SQL should build current-month same-type industry metric benchmarks'
  );
  assertIncludes(
    sources.backendModule,
    'include_str!("theme_source_ctes.sql")',
    'backend should keep theme-source extraction outside the frozen Rust module'
  );
  assertIncludes(
    sources.backendModule,
    'include_str!("content_theme_scoring_ctes.sql")',
    'backend should keep content-theme scoring outside the frozen Rust module'
  );
  for (const requiredThemeSource of [
    "'ai' AS source_kind",
    "'topic' AS term_group",
    "'expression',",
    'normalized_terms AS',
  ]) {
    assertIncludes(
      sources.backendThemeSourceSql,
      requiredThemeSource,
      `theme-source SQL should expose ${requiredThemeSource}`
    );
  }
  for (const requiredThemeContract of [
    'content_theme_payload AS',
    'content_theme_summary_payload AS',
    "'themeScore', theme_score",
    "'semanticScore', semantic_score",
    "'coverageScore', coverage_score",
    "'performanceScore', performance_score",
    "'performanceBand', performance_band",
    'components.semantic_score * 0.45',
    'components.coverage_score * 0.20',
    'components.performance_score * 0.35',
    'components.source_count >= 2',
    "term_group = 'topic' AND group_rank <= 8",
    "term_group = 'expression' AND group_rank <= 6",
  ]) {
    assertIncludes(
      sources.backendContentThemeSql,
      requiredThemeContract,
      `content-theme SQL should expose ${requiredThemeContract}`
    );
  }
  for (const filteredThemeNoise of ['千川', '云图', 'qianchuan', 'yuntu']) {
    assertIncludes(
      sources.backendContentThemeSql,
      filteredThemeNoise,
      `content-theme SQL should filter source noise ${filteredThemeNoise}`
    );
  }
  for (const alias of ['蓬松控油', '控油蓬松', '头皮护理', '头皮养护', '居家浴室场景', '居家浴室']) {
    assertIncludes(
      sources.backendContentThemeSql,
      alias,
      `content-theme SQL should keep explicit synonym contract ${alias}`
    );
  }
  assertIncludes(
    sources.backend,
    "'contentThemeSummary', (SELECT content_theme_summary_payload FROM content_theme_summary_payload)",
    'backend brand insight should expose the high-performance theme summary'
  );
  assertIncludes(
    sources.backend,
    "'contentThemeTerms', (SELECT content_theme_payload FROM content_theme_payload)",
    'backend brand insight should expose scored content themes'
  );
  assertIncludes(
    sources.backendFusionSql,
    'PERCENTILE_CONT(0.25)',
    'fusion SQL should use documented industry-sample quartiles rather than invented absolute thresholds'
  );
  assertIncludes(
    sources.backendFusionSql,
    'play_5s_score * 0.22',
    'live fusion scoring should prioritize 5S retention'
  );
  assertIncludes(
    sources.backendFusionSql,
    'ctr_score * 0.25',
    'goods fusion scoring should prioritize CTR'
  );
  assertIncludes(
    sources.backendFusionSql,
    "'{video_understanding,live_room_fit,entry_reason_clarity}'",
    'live fusion scoring should use visible entry-reason content signals'
  );
  assertIncludes(
    sources.backendFusionSql,
    "'{video_understanding,script,selling_point_clarity}'",
    'goods fusion scoring should use visible selling-point content signals'
  );
  assertNotIncludes(
    sources.backendFusionSql,
    "'{current_ai_analysis,final_judgment}'",
    'industry fusion evidence should not reuse content-assets final judgments with downstream attribution semantics'
  );
  assertIncludes(
    sources.backend,
    "'fusionSummary', (SELECT fusion_summary_payload FROM fusion_summary_payload)",
    'backend brand insight should expose the Phase 2 fusion summary'
  );
  assertIncludes(
    sources.backendFusionSql,
    "'fusionDiagnosis', JSONB_BUILD_OBJECT",
    'backend evidence materials should expose structured fusion diagnoses'
  );
  assertIncludes(
    sources.backendFusionSql,
    "'scoreBasis', 'industry_month_type_relative'",
    'fusion score should state its current-month same-type relative basis'
  );
  assertIncludes(
    sources.backend,
    'analysis_profile_payload AS',
    'backend should build an explicit analysis profile CTE'
  );
  assertIncludes(
    sources.backend,
    'live_lead_industry_visible',
    'backend should expose a live-lead-specific industry-visible profile key'
  );
  assertIncludes(
    sources.backend,
    'goods_cart_industry_visible',
    'backend should expose a goods-cart-specific industry-visible profile key'
  );
  assertIncludes(
    sources.backend,
    '视频内容是否在可见曝光内把用户有效带向直播间',
    'live profile should ask the live-room entry question without judging downstream acceptance'
  );
  assertIncludes(
    sources.backend,
    '视频内容是否在可见曝光内形成内容点击兴趣和购买意向线索',
    'goods profile should ask the product-click intent question without judging product-card acceptance'
  );
  assertIncludes(
    sources.backend,
    "'play3sRate', play_3s_rate",
    'backend evidence payload should include 3S rate for live-lead analysis'
  );
  assertIncludes(
    sources.backend,
    "'interactionRate', interaction_rate",
    'backend evidence payload should include interaction rate for profile-specific evidence metrics'
  );
  assertIncludes(
    sources.backend,
    "'mode', 'industry_visible_metrics_content_fusion'",
    'backend analysis boundary should identify the industry visible metrics x content mode'
  );
  assertIncludes(
    sources.backend,
    "'visibleSignals', JSONB_BUILD_ARRAY",
    'backend analysis boundary should enumerate visible industry signals'
  );
  assertIncludes(
    sources.backend,
    "'unavailableSignals', JSONB_BUILD_ARRAY",
    'backend analysis boundary should enumerate unavailable attribution signals'
  );
  assertIncludes(
    sources.backend,
    '不输出对方承接诊断、ROI 判断、放量或暂停决策',
    'backend analysis boundary should prevent unavailable downstream decisions'
  );
  for (const typeField of ['brandOptions', 'selectedBrand', 'brandInsight']) {
    assertIncludes(
      sources.types,
      `${typeField}:`,
      `frontend response type should include ${typeField}`
    );
  }
  assertIncludes(
    sources.types,
    'IndustryMaterialBrandInsightBoundary',
    'frontend type contract should include the industry analysis boundary'
  );
  assertIncludes(
    sources.types,
    'IndustryMaterialBrandInsightAnalysisProfile',
    'frontend type contract should include the active industry analysis profile'
  );
  assertIncludes(
    sources.types,
    'IndustryMaterialFusionDiagnosis',
    'frontend type contract should include the Phase 2 fusion diagnosis'
  );
  assertIncludes(
    sources.types,
    'fusionSummary:',
    'frontend brand insight should expose the normalized fusion summary'
  );
  assertIncludes(
    sources.types,
    'fusionDiagnosis:',
    'frontend evidence material should expose the normalized fusion diagnosis'
  );
  assertIncludes(
    sources.types,
    'analysisProfile:',
    'frontend brand insight should require an analysis profile'
  );
  assertIncludes(
    sources.types,
    "mode: 'industry_visible_metrics_content_fusion'",
    'frontend analysis boundary should constrain the mode literal'
  );
  assertIncludes(sources.api, 'brandOptions:', 'frontend normalizer should include brandOptions');
  assertIncludes(sources.api, 'selectedBrand,', 'frontend normalizer should include selectedBrand');
  assertIncludes(sources.api, 'brandInsight:', 'frontend normalizer should include brandInsight');
  assertIncludes(
    sources.api,
    'DEFAULT_INDUSTRY_ANALYSIS_BOUNDARY',
    'frontend normalizer should default the boundary for old backend responses'
  );
  assertIncludes(
    sources.api,
    "readField(record, ['analysisBoundary', 'analysis_boundary'])",
    'frontend normalizer should read camelCase and snake_case analysis boundary payloads'
  );
  assertIncludes(
    sources.api,
    'normalizeAnalysisProfile',
    'frontend normalizer should normalize the active analysis profile payload'
  );
  assertIncludes(
    sources.api,
    'normalizeFusionSummary',
    'frontend normalizer should normalize the Phase 2 fusion summary'
  );
  assertIncludes(
    sources.api,
    'normalizeFusionDiagnosis',
    'frontend normalizer should normalize evidence fusion diagnosis payloads'
  );
  assertIncludes(
    sources.api,
    "readField(record, ['analysisProfile', 'analysis_profile'])",
    'frontend normalizer should read camelCase and snake_case analysis profile payloads'
  );
  assertIncludes(
    sources.api,
    'fallbackTab',
    'frontend normalizer should use the root tab when old brand-insight payloads omit tab'
  );
  assertIncludes(
    sources.api,
    'normalizeContentThemeTerms',
    'frontend normalizer should validate scored content-theme terms at the API boundary'
  );
  assertIncludes(
    sources.api,
    "readField(record, ['contentThemeTerms', 'content_theme_terms'])",
    'frontend normalizer should read camelCase and snake_case content themes'
  );
  assertIncludes(
    sources.profileCard,
    '<details className={styles.analysisProfileCard} aria-label="分析口径">',
    'AI panel should keep the analysis profile behind a semantic disclosure'
  );
  assertIncludes(
    sources.profileCard,
    'boundary.conclusionPolicy',
    'analysis disclosure should combine the industry-visible boundary with the active profile'
  );
  assertNotIncludes(
    sources.profileCard,
    '当前分析方案',
    'analysis method should no longer compete with the completed brand insight as a primary card'
  );
  assertIncludes(
    sources.brandAiSummary,
    'AI 洞察摘要',
    'brand insight should lead with an executive AI summary'
  );
  for (const summaryLabel of ['核心打法', '有效信号', '优先验证动作']) {
    assertIncludes(
      panelRuntimeSource,
      summaryLabel,
      `brand insight summary should expose ${summaryLabel}`
    );
  }
  assertNotIncludes(
    sources.brandAiSummary,
    '优先改进',
    'brand insight summary should not repeat the primary validation action under a second label'
  );
  assertIncludes(
    sources.panel,
    '<BrandAiSummary summary={executiveSummary} />',
    'AI panel should render the brand result summary before detailed fusion evidence'
  );
  assertIncludes(
    sources.panel,
    '<BrandContentThemeMap',
    'AI panel should render the high-performance content-theme map'
  );
  assert.ok(
    sources.panel.indexOf('<BrandAiSummary summary={executiveSummary} />') <
      sources.panel.indexOf('<BrandContentThemeMap'),
    'high-performance content themes should appear immediately after the executive summary'
  );
  assert.ok(
    sources.panel.indexOf('<BrandContentThemeMap') < sources.panel.indexOf('<AnalysisProfileCard'),
    'analysis disclosure should follow the result-first content-theme map'
  );
  for (const themeLabel of [
    '高表现内容主题',
    '内容主题｜视频在讲什么',
    '表达方式｜视频怎么讲',
    '字号 = 综合主题强度',
    '蓝色深浅 = 行业相对表现支撑',
    '综合强度 = 内容重要性 45% + 素材覆盖 20% + 行业相对表现 35%',
    '暂无足够的内容 × 表现主题证据',
    '至少需要 2 条同时具备结构化视频理解和行业可见指标的素材。',
  ]) {
    assertIncludes(
      sources.brandContentThemeMap,
      themeLabel,
      `content-theme map should expose ${themeLabel}`
    );
  }
  for (const selector of [
    '.themeMap',
    '.themeGroups',
    '.themeTermSmall',
    '.themeTermMedium',
    '.themeTermLarge',
    '.themeTermLow',
    '.themeTermMid',
    '.themeTermHigh',
    '.themeMethodDetails',
    '.themeEmpty',
  ]) {
    assertIncludes(
      sources.brandContentThemeMapCss,
      selector,
      `content-theme map CSS should include ${selector}`
    );
  }
  assertIncludes(
    sources.brandContentThemeMapCss,
    '@media (max-width: 900px)',
    'content-theme groups should stack before mobile widths'
  );
  assertNotIncludes(
    sources.brandContentThemeMapCss,
    '.themeTermXlarge',
    'content-theme map should use no more than three type scales'
  );
  for (const declaration of ['border:', 'border-radius:', 'background:']) {
    assertCssRuleNotIncludes(
      sources.brandContentThemeMapCss,
      '.themeTerm',
      declaration,
      `content-theme terms should not render as pills with ${declaration}`
    );
  }
  assertNotIncludes(
    sources.panel,
    'termClassName',
    'AI panel should not size themes by array index'
  );
  assertNotIncludes(
    sources.panel,
    'wordCloudCard',
    'AI panel should remove the duplicate legacy word-cloud card'
  );
  assertNotIncludes(
    sources.panel,
    'strategyCardGrid',
    'AI panel should remove the duplicate strategy-card row after the result-first summary'
  );
  assertNotIncludes(
    sources.panelCss,
    '.strategyCard',
    'AI panel CSS should remove unused strategy-card presentation styles'
  );
  assertNotIncludes(
    panelRuntimeSource,
    '品牌内容主题词',
    'AI panel should not retain the duplicate legacy theme-card title'
  );
  assertIncludes(
    panelRuntimeSource,
    'evidenceMetricItems(activeTab, material)',
    'AI panel should render evidence metrics in tab-specific order'
  );
  assertIncludes(
    sources.panel,
    'brandLabel={selectedBrandLabel}',
    'AI panel should pass the selected brand label into the fusion scorecard'
  );
  assertIncludes(
    sources.panel,
    'summary={insight.fusionSummary}',
    'AI panel should render the compact content-metric fusion snapshot'
  );
  assertNotIncludes(
    sources.fusionScorecard,
    'PHASE 2 · INDUSTRY VISIBLE FUSION',
    'fusion snapshot should remove the development-phase label'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '指标相对位置',
    'the unified evidence section should expose metric benchmark bands on demand'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '视频内容信号',
    'the unified evidence section should expose structured video-content signals on demand'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '下一步验证',
    'the unified evidence section should frame material recommendations as validation actions'
  );
  for (const label of [
    '平均融合分',
    '视频理解覆盖',
    '高置信素材',
    '行业对标样本',
    '查看评分口径',
  ]) {
    assertIncludes(
      sources.fusionScorecard,
      label,
      `fusion scorecard should make the benchmark and selected-brand scope explicit with ${label}`
    );
  }
  for (const selector of ['.fusionSnapshot', '.primaryScore', '.supportMetrics', '.methodDetails']) {
    assertIncludes(
      sources.fusionScorecardCss,
      selector,
      `compact fusion snapshot CSS should include ${selector}`
    );
  }
  assertIncludes(
    sources.fusionScorecard,
    '<p className={styles.scoreMeaning}>{summary.methodNote}</p>',
    'fusion scorecard should surface the no-overclaim score meaning without requiring disclosure'
  );
  assertIncludes(
    sources.fusionScorecardCss,
    '.scoreMeaning',
    'fusion scorecard should visually separate the score meaning from support metrics'
  );
  assertNotIncludes(
    sources.fusionScorecard,
    'materials: IndustryMaterialBrandInsightEvidenceMaterial[];',
    'fusion scorecard should no longer own the duplicated per-material evidence list'
  );
  assertNotIncludes(
    sources.fusionScorecard,
    'materials.filter',
    'fusion scorecard should remain a summary-only benchmark and coverage view'
  );
  assertNotIncludes(
    sources.fusionScorecardCss,
    '.fusionMaterial',
    'fusion scorecard CSS should remove the retired nested material cards'
  );
  assertIncludes(
    sources.panel,
    '<BrandEvidenceSection',
    'AI panel should render one unified evidence and validation section'
  );
  assertIncludes(
    sources.panel,
    'materials={insight.evidenceMaterials}',
    'AI panel should pass evidence materials to their single presentation owner'
  );
  assertIncludes(
    sources.panel,
    'const secondaryActions = insight.nextActions.slice(1);',
    'AI panel should exclude the primary summary action from the secondary action disclosure'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '另外 {secondaryActions.length} 项验证动作',
    'secondary action disclosure should state that the primary action was already promoted'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '<details className={styles.actionDisclosure}>',
    'secondary validation actions should use a semantic disclosure'
  );
  assertNotIncludes(
    sources.brandEvidenceSection,
    '<details className={styles.actionDisclosure} open',
    'secondary validation actions should remain closed by default'
  );
  assertNotIncludes(
    sources.panel,
    'insight.evidenceMaterials.map',
    'AI panel should not keep a second inline evidence material mapper'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    'materials.map((material, index)',
    'unified evidence section should be the single per-material mapper'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '<details className={styles.diagnosisDetails}>',
    'per-material fusion diagnosis should use a semantic disclosure'
  );
  assertNotIncludes(
    sources.brandEvidenceSection,
    '<details className={styles.diagnosisDetails} open',
    'per-material fusion diagnosis disclosures should remain closed by default'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    "new Set(['3S', '完播', 'CTR'])",
    'live-lead evidence rows should prioritize three decisive metrics'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    "new Set(['CTR', 'CVR', '完播'])",
    'goods-video evidence rows should prioritize three decisive metrics'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '.slice(0, 3)',
    'collapsed evidence rows should render no more than three decision metrics'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '<span className={styles.diagnosisSummaryClosed}>展开诊断</span>',
    'remaining metrics and subscores should move into a clearly labeled diagnosis disclosure'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '<dl className={styles.evidenceMetrics} aria-label="关键决策指标">',
    'collapsed evidence rows should align their decisive metrics in a comparison-friendly group'
  );
  assertIncludes(
    sources.fusionScorecardCss,
    '@media (max-width: 1100px)',
    'fusion snapshot should stack below the theme field before mobile widths'
  );
  assertIncludes(
    sources.profileCard,
    '不可判断项',
    'analysis disclosure should separate unavailable downstream conclusions from coverage gaps'
  );
  assertIncludes(
    sources.transport,
    "/brand-ai-analysis/backfill",
    'dashboard API client should use the brand-scoped AI backfill endpoint'
  );
  assertIncludes(
    sources.backendRoutes,
    'post_industry_material_brand_ai_analysis_backfill',
    'dashboard router should import the brand AI backfill handler'
  );
  assertIncludes(
    sources.backendRoutes,
    '"/industry-material-inspiration/brand-ai-analysis/backfill"',
    'dashboard router should mount the brand AI backfill endpoint under /v1/dashboard'
  );
  assertIncludes(
    sources.backendRoutes,
    'post(post_industry_material_brand_ai_analysis_backfill)',
    'dashboard router should register the brand AI backfill endpoint as POST'
  );
  assertIncludes(
    sources.transport,
    'backfillIndustryMaterialBrandAiAnalysis',
    'dashboard API client should expose a dashboard-scoped brand AI backfill helper'
  );
  assertIncludes(
    sources.api,
    'normalizeIndustryMaterialBrandAiBackfillResponse',
    'dashboard API client should normalize AI backfill responses at the boundary'
  );
  for (const responseField of [
    'queuedCacheHydrationJobs:',
    'queuedModelAnalysisJobs:',
    'structuredStorageReady:',
    'skippedNoInput:',
    'skippedReady:',
    'skippedExistingJobs:',
    'remainingMissingAfterClick:',
    'limitReached:',
    'workerTrigger:',
  ]) {
    assertIncludes(
      sources.api,
      responseField,
      `dashboard API client should normalize AI backfill ${responseField} response field`
    );
    assertIncludes(
      sources.types,
      responseField,
      `frontend response type should include AI backfill ${responseField} field`
    );
  }
  for (const backendField of [
    'queued_cache_hydration_jobs',
    'queued_model_analysis_jobs',
    'structured_storage_ready',
    'limit_reached',
    'remaining_missing_after_click',
    'skipped_no_input',
    'worker_trigger',
  ]) {
    assertIncludes(
      sources.backend,
      backendField,
      `backend AI backfill response should include ${backendField}`
    );
  }
  assertNotIncludes(
    sources.backend,
    '.take(request.limit as usize)',
    'backend AI backfill loop should not let skipped rows consume the new-job limit window'
  );
  assertIncludes(
    sources.backendBackfillEnqueue,
    'hydration_asset_ids.len() + model_asset_ids.len() >= request.limit as usize',
    'backend AI backfill enqueue should cap eligible candidates at the validated request limit'
  );
  assertIncludes(
    sources.backendBackfillEnqueue,
    'create_analysis_cache_hydration_jobs_for_assets(',
    'backend AI backfill should enqueue artifact hydration through the atomic batch owner'
  );
  assertIncludes(
    sources.backendBackfillEnqueue,
    'MODEL_ANALYSIS_ENQUEUE_CONCURRENCY: usize = 8',
    'backend AI backfill should bound model enqueue concurrency at eight'
  );
  assertIncludes(
    sources.backendBackfillEnqueue,
    'JoinSet::new()',
    'backend AI backfill should use an explicit bounded async join set for model enqueue'
  );
  assertIncludes(
    sources.analysisJobs,
    'create_analysis_cache_hydration_jobs(',
    'analysis job mutations should expose one atomic hydration batch owner'
  );
  assertIncludes(
    sources.analysisJobs,
    'create_analysis_cache_hydration_jobs(pool, &[asset_id], source, profile, actor)',
    'single-asset hydration should delegate to the atomic batch owner'
  );
  assertIncludes(
    sources.analysisJobs,
    'QueryBuilder::<Postgres>::new(',
    'hydration batch owner should use SQLx QueryBuilder for multi-row inserts'
  );
  assertIncludes(
    sources.analysisJobs,
    '.push_values(&new_jobs',
    'hydration batch owner should bulk insert jobs and events'
  );
  assert.equal(
    sources.analysisJobs.match(/\.push_values\(&new_jobs/gu)?.length ?? 0,
    2,
    'hydration batch owner should perform one bulk job insert and one bulk event insert'
  );
  assertIncludes(
    sources.analysisJobs,
    'ORDER BY asset_id ASC',
    'hydration batch owner should lock assets in stable asset ID order'
  );
  assertNotIncludes(
    sources.backend,
    'create_content_asset_analysis_cache_hydration_job(',
    'dashboard handler should not retain the serial per-asset hydration enqueue loop'
  );
  assertNotIncludes(
    sources.backend,
    'spawn_content_asset_processing_job_trigger(',
    'brand backfill must not create one Prefect flow run per queued job'
  );
  assertIncludes(
    backendRuntimeSource,
    'trigger_content_asset_analysis_batch_worker(state).await',
    'brand backfill should request exactly one immediate batch worker run after enqueueing'
  );
  assertIncludes(
    sources.prefectTrigger,
    'CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT: i64 = 10',
    'content asset batch worker should keep the immediate processing limit at 10'
  );
  assertNotIncludes(
    sources.transport,
    'backfillContentAssetAiJobs',
    'dashboard API client should not call the global content-assets AI backfill helper'
  );
  assertIncludes(
    sources.transport,
    "retryMode: 'never'",
    'dashboard brand AI backfill POST should disable automatic retries'
  );
  assertIncludes(
    sources.transport,
    'timeout: 120_000',
    'dashboard brand AI backfill POST should allow bounded remote enqueue latency'
  );
  assertNotIncludes(
    sources.client,
    'backfillContentAssetAiJobs',
    'dashboard client should not call the global content-assets AI backfill helper'
  );
  assertIncludes(
    sources.panel,
    "import { ALL_BRANDS_KEY } from './industry-material-inspiration-client-helpers';",
    'AI panel should reuse the shared all-brands key constant'
  );
  assertNotIncludes(
    sources.panel,
    "const ALL_BRANDS_KEY = 'all'",
    'AI panel should not duplicate the all-brands key literal'
  );
  assertIncludes(panelRuntimeSource, '高表现内容主题', 'AI panel should label the scored content-theme result');
  assertIncludes(
    panelRuntimeSource,
    '视频理解覆盖为 0',
    'AI panel should explicitly downgrade copy when no AI video-understanding coverage exists'
  );
  assertIncludes(
    panelRuntimeSource,
    'material.summary || material.reason',
    'AI evidence material cards should prefer material-specific AI summaries before generic ranking reasons'
  );
  assertNotIncludes(
    sources.brandEvidenceSection,
    'const evidenceReason',
    'AI evidence cards should not repeat the shared ranking reason when a material summary exists'
  );
  assertNotIncludes(
    sources.brandEvidenceSectionCss,
    '.evidenceReason',
    'AI evidence CSS should remove the retired duplicate-reason row'
  );
  assertCssRuleIncludes(
    sources.brandEvidenceSectionCss,
    '.titleLine a,\n.titleLine > strong',
    'color: var(--brand-text);',
    'AI evidence titles should stay brand blue whether or not an asset link is available'
  );
  assertCssRuleIncludes(
    sources.brandEvidenceSectionCss,
    '.titleLine a',
    'cursor: pointer;',
    'linked AI evidence titles should retain explicit link affordance'
  );
  assertCssRuleIncludes(
    sources.brandEvidenceSectionCss,
    '.titleLine a:hover',
    'color: var(--brand-active);',
    'linked AI evidence titles should deepen the brand blue on hover'
  );
  assertCssRuleIncludes(
    sources.brandEvidenceSectionCss,
    '.titleLine a:hover',
    'text-decoration: underline;',
    'linked AI evidence titles should underline on hover'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '<LinkOutlined className={styles.evidenceTitleIcon} aria-hidden />',
    'linked AI evidence titles should keep the external-link icon'
  );
  assertIncludes(
    sources.brandEvidenceSection,
    '<strong title={title}>{title}</strong>',
    'AI evidence titles without asset links should remain non-interactive text'
  );
  assertNotIncludes(
    panelRuntimeSource,
    '暂无可结构化策略卡',
    'AI panel should not retain an empty state for the removed strategy-card row'
  );
  assertIncludes(
    panelRuntimeSource,
    '行业品牌 AI 洞察',
    'AI panel should localize and scope Brand AI insight copy to the industry page'
  );
  assertIncludes(
    panelRuntimeSource,
    '行业内容信号',
    'AI panel should localize and scope Brand content signals copy to the industry page'
  );
  assertNotIncludes(
    panelRuntimeSource,
    'Brand AI insight',
    'AI panel should not expose English insight eyebrow copy'
  );
  assertNotIncludes(
    panelRuntimeSource,
    'Brand content signals',
    'AI panel should not expose English fallback eyebrow copy'
  );
  assertIncludes(
    panelRuntimeSource,
    '补齐缺失分析',
    'AI panel should expose the manual missing video-understanding backfill CTA copy'
  );
  assertIncludes(
    panelRuntimeSource,
    '正在提交补齐',
    'AI panel should expose the pending video-understanding backfill CTA copy'
  );
  assertNotIncludes(
    panelRuntimeSource,
    '视频理解已覆盖',
    'fully-covered state should be status copy rather than a disabled action'
  );
  assertNotIncludes(
    panelRuntimeSource,
    '暂无可补齐素材',
    'no-linked state should not render a disabled placeholder action'
  );
  assertNotIncludes(
    panelRuntimeSource,
    'Prefect flow run',
    'implementation-specific Prefect copy should not remain in the always-visible panel'
  );
  assertIncludes(
    panelRuntimeSource,
    '处理已开始',
    'post-action details should explain that processing has started'
  );
  assertIncludes(
    panelRuntimeSource,
    '完成数追平归档数且处理中归零后即完成',
    'post-action details should define completion without permanent queue/run pills'
  );
  assertIncludes(panelRuntimeSource, '处理中 ${formatInteger(activeAssets)}', 'AI panel should merge active jobs into one processing status');
  assertNotIncludes(panelRuntimeSource, '排队 {coverageValue', 'AI panel should not keep a permanent queued pill');
  assertNotIncludes(panelRuntimeSource, '运行 {coverageValue', 'AI panel should not keep a permanent running pill');
  assertIncludes(
    panelRuntimeSource,
    '已有排队/运行',
    'AI panel should distinguish already queued/running work from completed analysis'
  );
  assertIncludes(
    panelRuntimeSource,
    '缺少可分析输入',
    'AI panel should distinguish no-input skips from existing/running analysis'
  );
  assertIncludes(
    panelRuntimeSource,
    '避免重复消耗视频理解额度',
    'AI panel should explain skipped rows are cost-control dedupe, not failed work'
  );
  assertIncludes(
    sources.profileCard,
    '行业可见指标 × 视频理解',
    'AI panel should summarize the industry-visible analysis boundary in the disclosure'
  );
  assertIncludes(
    sources.panel,
    'boundary={analysisBoundary}',
    'AI panel should pass the normalized boundary into the analysis disclosure'
  );
  assertNotIncludes(
    sources.panel,
    'analysisBoundaryNotice',
    'AI panel should not retain a duplicate always-visible boundary notice'
  );
  for (const forbiddenCopy of [
    '直播间承接边界',
    '商品卡点击与成交承接',
    '成交承接风险',
    '承接假设',
    '商品点击理由',
    '商品卡点击理由',
    '商品卡转化',
    '直播间转化',
    '直播间成交',
    '投放放量',
    '提升 ROI',
    'ROI 优化',
    '一键补齐缺失 AI 分析',
    '正在排队 AI 分析',
    'AI 分析已覆盖',
    '按钮变为「AI 分析已覆盖」才算完成',
  ]) {
    assertNotIncludes(
      panelRuntimeSource,
      forbiddenCopy,
      `AI panel should not keep misleading industry-material copy: ${forbiddenCopy}`
    );
    assertNotIncludes(
      sources.backend,
      forbiddenCopy,
      `backend payload should not keep misleading industry-material copy: ${forbiddenCopy}`
    );
  }
  assertIncludes(
    sources.panel,
    'missingAnalysis > 0 &&',
    'AI panel should only enable the CTA when missing analysis and linked assets exist'
  );
  assertIncludes(sources.panel, 'linked > 0 &&', 'AI panel should require linked assets before backfill');
  assertIncludes(
    sources.panel,
    '{canBackfillMissingAnalysis ? (',
    'AI panel should only render the CTA inside the single-brand missing-analysis scope'
  );
  assertIncludes(
    sources.panel,
    'disabled={isBackfillPending}',
    'AI panel should disable the visible CTA while the explicit mutation is pending'
  );
  assertIncludes(
    sources.panel,
    'onClick={onBackfillMissingAnalysis}',
    'AI panel should trigger AI backfill only from the explicit button click'
  );
  assertIncludes(panelRuntimeSource, '/marketing/content-assets/', 'AI evidence materials should link to content assets');
  assertIncludes(
    sources.client,
    'useMutation<',
    'dashboard client should use an explicit React Query mutation for manual backfill'
  );
  assertIncludes(
    sources.client,
    'mutationFn: backfillIndustryMaterialBrandAiAnalysis',
    'dashboard client should bind the mutation to the dashboard-scoped API helper'
  );
  assertIncludes(sources.client, 'tab: activeTab', 'AI backfill payload should include the active tab');
  assertIncludes(sources.client, 'month: displayMonth', 'AI backfill payload should include the displayed month');
  assertIncludes(sources.client, 'brand: selectedBrandKey', 'AI backfill payload should include the selected brand');
  assertIncludes(
    sources.client,
    "const BRAND_AI_BACKFILL_SOURCE = 'auto';",
    'AI backfill source should use the backend-supported auto source'
  );
  assertIncludes(
    sources.client,
    "const BRAND_AI_BACKFILL_PROFILE = 'preview_fast';",
    'AI backfill profile should use the backend-supported low-cost preview profile'
  );
  assertNotIncludes(
    sources.client,
    'dashboard_industry_material_inspiration',
    'AI backfill source should not use a dashboard-only value rejected by the backend'
  );
  assertNotIncludes(
    sources.client,
    'brand_ai_insight',
    'AI backfill profile should not use a dashboard-only value rejected by the backend'
  );
  assertIncludes(sources.client, 'source: BRAND_AI_BACKFILL_SOURCE', 'AI backfill payload should include source');
  assertIncludes(sources.client, 'profile: BRAND_AI_BACKFILL_PROFILE', 'AI backfill payload should include profile');
  assertIncludes(sources.client, 'limit: BRAND_AI_BACKFILL_LIMIT', 'AI backfill payload should include a per-click limit');
  assertIncludes(
    clientRuntimeSource,
    'const BRAND_AI_POLL_INTERVAL_MS = 5_000',
    'dashboard client should poll active video-understanding work every five seconds'
  );
  assertIncludes(
    clientRuntimeSource,
    'const BRAND_AI_POLL_MAX_DURATION_MS = 2 * 60_000',
    'dashboard client should bound active video-understanding polling to two minutes'
  );
  assertIncludes(
    clientRuntimeSource,
    'refetchInterval:',
    'dashboard client should use React Query scoped polling instead of unmanaged timers'
  );
  assertIncludes(
    sources.client,
    'onBackfillMissingAnalysis={handleBackfillBrandAiAnalysis}',
    'client should pass the manual click handler into the AI panel'
  );
  assertIncludes(
    sources.client,
    'queryClient.invalidateQueries({ queryKey: dashboardQueryKey })',
    'successful AI backfill should invalidate the current dashboard query'
  );
  assertNotIncludes(
    sources.client,
    'useEffect(() => {\n    backfillMutation',
    'dashboard client should not auto-trigger AI backfill from effects'
  );
  assertNotIncludes(
    sources.client,
    'useEffect(() => {\n    void backfillMutation',
    'dashboard client should not auto-trigger AI backfill from effects'
  );
  assertIncludes(
    sources.brandEvidenceSectionCss,
    '.actionDisclosure',
    'secondary validation actions should use a flat disclosure instead of a side rail'
  );
  assertNotIncludes(
    sources.brandEvidenceSectionCss,
    '.evidenceLayout',
    'evidence materials should use the full workspace width'
  );
  assertNotIncludes(
    sources.brandEvidenceSectionCss,
    '.actionRail',
    'the persistent validation-action rail should be removed'
  );
  for (const selector of ['.summaryCard', '.summaryGrid']) {
    assertIncludes(
      sources.brandAiSummaryCss,
      selector,
      `brand AI summary CSS should include ${selector}`
    );
  }
  assertNotIncludes(
    sources.brandAiSummaryCss,
    '.priorityAction',
    'brand AI summary should remove the nested duplicate priority-action container'
  );
  assertCssRuleIncludes(
    sources.panelCss,
    '.aiInsightPanel',
    'border:',
    'brand insight shell should expose one clear task-surface boundary'
  );
  assertCssRuleIncludes(
    sources.panelCss,
    '.aiInsightPanel',
    'background:',
    'brand insight shell should use one white task surface'
  );
  assertCssRuleNotIncludes(
    sources.panelCss,
    '.aiInsightPanel',
    'box-shadow:',
    'brand insight shell should not add an elevation layer around child sections'
  );
  assertCssRuleNotIncludes(
    sources.brandContentThemeMapCss,
    '.themeGroup',
    'border:',
    'content-theme groups should use column dividers instead of nested cards'
  );
  assertCssRuleNotIncludes(
    sources.profileCardCss,
    '.analysisProfileCard',
    'border-radius:',
    'analysis profile should render as a flat disclosure row'
  );
  assertCssRuleNotIncludes(
    sources.fusionScorecardCss,
    '.fusionSnapshot',
    'box-shadow:',
    'compact fusion snapshot should not add a nested card shadow'
  );
  assertCssRuleNotIncludes(
    sources.brandEvidenceSectionCss,
    '.evidenceRow',
    'border-radius:',
    'evidence materials should render as divided rows rather than nested cards'
  );
  assertIncludes(
    sources.brandAiSummaryCss,
    '@media (max-width: 900px)',
    'brand AI summary should collapse before narrow mobile widths'
  );
  assertIncludes(
    profileCardSource,
    '@media (max-width: 1180px)',
    'analysis profile disclosure should collapse before narrow mobile widths'
  );
  for (const selector of [
    '.analysisProfileCard',
    '.analysisProfileSummary',
    '.analysisProfileContent',
    '.analysisProfileGrid',
    '.analysisProfileColumn',
    '.metricPriorityList',
    '.analysisProfileTags',
  ]) {
    assertIncludes(
      profileCardSource,
      selector,
      `AI insight panel CSS should include ${selector} for the profile disclosure`
    );
  }
  assertIncludes(
    sources.profileCardCss,
    '.analysisProfileSummary:focus-visible',
    'analysis disclosure should expose a visible keyboard focus state'
  );
  assertNotIncludes(
    sources.css,
    'brandFilterSelect',
    'route stylesheet should not keep unused legacy brand filter selectors'
  );
  assertNotIncludes(
    sources.clientHelpers,
    "'千川场景',",
    'detail export should not reintroduce the redundant qianchuan-scene field'
  );
  assertIncludes(
    sources.formatters,
    'INDUSTRY_MATERIAL_BRANDS',
    'formatters should keep the fixed supported-brand response dictionary'
  );
  for (const brand of ['卡诗', '欧莱雅PRO', '韩束', 'OKCS', 'EHD', 'SPES', '馥绿德雅', 'Off&Relax']) {
    assertIncludes(sources.formatters, brand, `formatter brand dictionary should include ${brand}`);
    assertIncludes(sources.adsBrandMigration, brand, `ADS brand extractor should include ${brand}`);
  }
  assertIncludes(
    sources.adsBrandMigration,
    'CREATE OR REPLACE FUNCTION ads.extract_douyin_qianchuan_industry_material_brand',
    'ADS migration should define the title-to-brand extractor'
  );
  assertIncludes(
    sources.adsBrandMigration,
    'ads.extract_douyin_qianchuan_industry_material_brand(raw.video_title) AS brand_name',
    'ADS refresh should write extracted title brands into brand_name'
  );
  assertIncludes(
    sources.adsBrandMigration,
    'UPDATE ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly target',
    'ADS migration should write back existing brand_name values'
  );
  assertNotIncludes(
    sources.adsBrandMigration,
    'raw.brand_scope_name AS brand_name',
    'ADS brand_name should no longer be populated from the industry brand-scope filter'
  );
  assertIncludes(
    sources.brandResolutionMigration,
    'CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_brand_resolutions',
    'brand resolution migration should add the versioned asset-level audit store'
  );
  assertIncludes(
    sources.brandResolutionMigration,
    'PRIMARY KEY (asset_id, resolver_version)',
    'brand resolution rows should be idempotent per asset and resolver version'
  );
  assertIncludes(
    sources.brandResolutionMigration,
    'is_manual_override = (primary_source = \'manual\')',
    'manual override rows should keep source semantics consistent'
  );
  assertIncludes(
    sources.brandResolutionMigration,
    'extract_douyin_qianchuan_industry_material_brand_from_evidence',
    'PostgreSQL should own deterministic multi-field brand aliases'
  );
  assertIncludes(
    sources.brandResolutionMigration,
    'COUNT(*) = 1',
    'deterministic resolution should reject conflicting brands in the same source'
  );
  assertIncludes(
    sources.brandResolutionMigration,
    'extract_douyin_qianchuan_industry_material_brand(target.video_title) IS NOT NULL',
    'brand alias backfill must not clear an existing brand when the new extractor has no match'
  );
  assertIncludes(
    sources.monthlySqlCheck,
    'brand_extractor_does_not_guess_from_standalone_or',
    'SQL checks should prevent contextual OR aliases from becoming category guesses'
  );
  assertIncludes(
    sources.backendStorageReadinessSql,
    "to_regclass('ads.marketing_content_asset_brand_resolutions')",
    'backend readiness should probe the optional resolution table before building SQL'
  );
  assertIncludes(
    sources.backendBrandResolutionSourceSql,
    'WHEN resolution.is_manual_override THEN 0',
    'preferred resolution selection should rank manual rows first'
  );
  assertIncludes(
    sources.backendBrandResolutionSourceSql,
    'resolution.confidence >= 0.9000 THEN 1',
    'preferred resolution selection should accept only high-confidence automatic rows'
  );
  assertIncludes(
    sources.backendBrandResolutionEffectiveSql,
    "WHEN NULLIF(BTRIM(material.brand_name), '') IS NOT NULL THEN 'title'",
    'effective-brand fallback should preserve the title-derived ADS result'
  );
  assertIncludes(
    sources.backendBrandResolutionModule,
    'BRAND_RESOLUTION_EMPTY_CTE',
    'pre-migration API compatibility should inject a typed empty resolution CTE'
  );
  for (const field of [
    'brandResolutionStatus',
    'brandResolutionSource',
    'brandResolutionConfidence',
    'brandResolutionEvidence',
  ]) {
    assertIncludes(sources.backend, `'${field}'`, `backend rows should expose optional ${field}`);
    assertIncludes(sources.types, `${field}?`, `frontend row types should accept optional ${field}`);
  }
  for (const sqlSource of [sources.backend, sources.backendBackfillScopeSql, sources.backendBackfillAssetsSql]) {
    assertIncludes(sqlSource, '__BRAND_RESOLUTION_CTE__', 'all brand-scoped SQL templates should share resolution injection');
    assertIncludes(sqlSource, '__BRAND_RESOLUTION_JOIN__', 'all brand-scoped SQL templates should share effective-brand precedence');
  }
  assertIncludes(
    sources.arkResponses,
    'def resolve_video_brand(',
    'Ark transport should expose a narrow brand-only video resolver'
  );
  assertIncludes(
    sources.brandResolutionProvider,
    '"analysis_profile": "brand_resolution_fast"',
    'brand resolver should stay separate from the full marketing-analysis profile'
  );
  assertIncludes(
    sources.brandResolutionProcessor,
    'if allow_model_calls and not apply:',
    'processor should enforce the model/write double gate'
  );
  assertIncludes(
    sources.brandResolutionCli,
    '"--allow-model-calls"',
    'operator CLI should require an explicit paid-model flag'
  );
  assertIncludes(
    sources.brandResolutionProcessorTest,
    'test_exact_asset_scope_does_not_require_month_or_video_type',
    'operator CLI should support the exact-asset scope without forcing month/type filters'
  );
  assertIncludes(
    sources.brandResolutionProcessorTest,
    '4ab75252-b87b-557b-be2d-59e8f4c5a37e',
    'rank-6 OKCS visual case should remain a golden asset fixture'
  );
  assertIncludes(
    sources.brandResolutionProcessorTest,
    'deterministic_brand="OKCS"',
    'rank-6 golden fixture should keep the expected OKCS result'
  );
  assertIncludes(
    sources.brandResolutionProcessorTest,
    'test_dry_run_never_calls_model_or_writes_database',
    'operator dry-run should have an executable no-model/no-write regression test'
  );
  assertIncludes(
    sources.cellCss,
    '.brandPill:focus-visible',
    'inspectable brand pills should expose a visible keyboard focus state'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.brandPill:focus-visible',
    'var(--brand-focus-ring)',
    'brand pill focus should use the shared AIOS focus token'
  );
  assertNotIncludes(
    sources.formatters,
    'INDUSTRY_MATERIAL_BRAND_PATTERNS',
    'frontend must not maintain a competing title-regex brand dictionary'
  );
  assertNotIncludes(
    sources.formatters,
    'extractIndustryMaterialBrandFromTitle',
    'frontend must not infer brands from titles after the backend becomes owner'
  );
  assertIncludes(
    sources.monthlySqlCheck,
    'ads_brand_name_uses_fixed_dictionary',
    'SQL check should guard that ADS brand_name stays within the fixed brand dictionary'
  );
  assertIncludes(sources.formatters, 'parseExposureRangeText', 'client should parse raw exposure range text');
  assertIncludes(
    sources.formatters,
    'parseLegacyConcatenatedExposureRange',
    'client should tolerate pre-raw API payloads where exposure ranges were concatenated into one number'
  );
  assertIncludes(sources.formatters, 'formatExposureRange', 'client should render exposure values as integer 万 ranges');
  assertIncludes(
    sources.formatters,
    'calculateAverageExposureRange',
    'summary exposure should use the current result set average lower/upper range'
  );
  assertIncludes(
    sources.formatters,
    'normalizeIndustryMaterialEvidenceSummary',
    'industry evidence summaries should pass through a page-scoped boundary sanitizer'
  );
  assertIncludes(
    sources.formatters,
    'INDUSTRY_EVIDENCE_DECISION_REPLACEMENTS',
    'industry evidence summary sanitizer should keep decision-copy replacements explicit'
  );
  assertIncludes(
    sources.api,
    'summary: normalizeIndustryMaterialEvidenceSummary',
    'industry evidence material summaries should use the boundary sanitizer during API normalization'
  );
  assertNotIncludes(sources.client, 'formatter="wan"', 'exposure cells should not use decimal 万 formatter');
  assertIncludes(
    sources.css,
    'text-align: center !important',
    'table header labels should be centered by the page stylesheet'
  );
  assertIncludes(
    sources.client,
    'useDashboardPlatformThumb',
    'content-type tabs should reuse the same moving thumb interaction as the operating dashboard'
  );
  assertIncludes(
    sources.client,
    'dashboardTabRailStyles.tabRailThumb',
    'content-type tabs should render the dashboard moving thumb element'
  );
  assertIncludes(
    sources.designAuthority,
    'Dashboard dense detail table contract',
    'DESIGN.md should document the reusable dense detail table system'
  );
  assertIncludes(
    sources.designTokens,
    '--component-table-detail-header-font-size: var(--font-size-base);',
    'runtime tokens should define the dense detail table header size'
  );
  assertIncludes(
    sources.designTokens,
    '--component-table-detail-body-font-size: var(--font-size-sm);',
    'runtime tokens should define the dense detail table body size'
  );
  assertIncludes(
    sources.designTokens,
    '--component-table-detail-link-font-weight: var(--component-table-detail-body-font-weight);',
    'runtime tokens should keep detail table links at body weight without bold inflation'
  );
  assertCssRuleIncludes(
    sources.creatorCss,
    '.detailHeaderCell',
    'font-size: var(--component-table-detail-header-font-size);',
    'creator detail headers should consume the shared dense detail table header token'
  );
  assertCssRuleIncludes(
    sources.creatorCss,
    '.detailBodyCell',
    'font-size: var(--component-table-detail-body-font-size);',
    'creator detail body cells should consume the shared dense detail table body token'
  );
  assertCssRuleIncludes(
    sources.css,
    '.materialTable :global(.ant-table-thead > tr > th)',
    'font-size: var(--component-table-detail-header-font-size);',
    'industry material headers should consume the shared dense detail table header token'
  );
  assertCssRuleIncludes(
    sources.css,
    '.materialTable :global(.ant-table-tbody > tr > td)',
    'font-size: var(--component-table-detail-body-font-size);',
    'industry material body cells should consume the shared dense detail table body token'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.assetLink',
    'font-weight: var(--component-table-detail-link-font-weight);',
    'video links should use the non-bold dense detail table link weight'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.brandCell',
    'font-weight: var(--component-table-detail-body-font-weight);',
    'brand labels should not escape the dense detail table body weight'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.brandPill',
    'border-radius: var(--border-radius-full);',
    'brand labels should render as restrained capsule pills'
  );
  assertIncludes(sources.cellCss, '.brandPillKnown', 'recognized brands should have a dedicated blue-soft pill style');
  assertIncludes(sources.cellCss, '.brandPillReview', 'ambiguous brands should have a dedicated review pill style');
  assertIncludes(sources.cellCss, '.brandPillUnknown', 'unrecognized brands should have a dedicated neutral pill style');
  assertIncludes(
    sources.tableCells,
    "import tableCellStyles from './industry-material-table-cells.module.css';",
    'table cells should keep dense table rendering styles in the split cell CSS module'
  );
  assertIncludes(
    sources.tagCells,
    "import tableCellStyles from './industry-material-table-cells.module.css';",
    'tag cells should consume the split dense table cell CSS module'
  );
  assertIncludes(
    sources.tagCells,
    "resolveTagGroupCell",
    'tag cells should keep rendering light and delegate row packing to a focused layout helper'
  );
  assertIncludes(
    sources.tableColumns,
    'AudienceTagCell',
    'audience cells should render through the compact tag group component'
  );
  assertIncludes(
    sources.tableColumns,
    'SellingPointTagCell',
    'selling point cells should render through the compact tag group component'
  );
  assertIncludes(sources.tagCells, 'export function AudienceTagCell', 'audience tag cell component should be exported');
  assertIncludes(sources.tagCells, 'export function SellingPointTagCell', 'selling point tag cell component should be exported');
  assertIncludes(
    sources.tagLayout,
    'SELLING_POINT_ROW_WIDTH_BUDGET',
    'selling-point tag cells should pack chips by visual width rather than a fixed chip count'
  );
  assertIncludes(
    sources.tagLayout,
    'SELLING_POINT_OVERFLOW_RESERVE_WIDTH',
    'selling-point tag cells should reserve the overflow chip plus row gap before showing +N'
  );
  assertIncludes(
    sources.tagLayout,
    'AUDIENCE_ROW_WIDTH_BUDGET',
    'audience tag cells should pack chips by visual width rather than a fixed chip count'
  );
  assertIncludes(
    sources.tagLayout,
    'buildAudienceRows',
    'audience tag cells should split audience labels and demographic signals into two visual rows'
  );
  assertIncludes(
    sources.tagLayout,
    'buildSellingPointRows',
    'selling-point tag cells should split selling points into two bounded rows'
  );
  assertIncludes(
    sources.tagLayout,
    'buildWidthAwareSellingPointRows',
    'selling-point tag cells should only show +N when the estimated row width cannot fit more chips'
  );
  assertIncludes(
    sources.tagLayout,
    'estimateSellingPointTagWidth',
    'selling-point tag cells should estimate chip width before moving usable tags behind +N'
  );
  assertIncludes(
    sources.tagLayout,
    'SELLING_POINT_COMPACT_CHIP_MAX_WIDTH',
    'selling-point tag cells should keep a compact chip width tier for short labels'
  );
  assertIncludes(
    sources.tagLayout,
    'SELLING_POINT_MEDIUM_CHIP_MAX_WIDTH',
    'selling-point tag cells should keep a medium chip width tier for complete short phrases'
  );
  assertIncludes(
    sources.tagLayout,
    'estimateSellingPointNaturalTagWidth',
    'selling-point tag cells should classify chip tiers by estimated natural text width'
  );
  assertIncludes(
    sources.tagLayout,
    'isMediumSellingPointTag',
    'selling-point tag cells should identify medium complete phrases separately from compact and wide chips'
  );
  assertIncludes(
    sources.tagLayout,
    'isWideSellingPointTag',
    'selling-point tag cells should identify true full-row wide labels by natural width'
  );
  assertIncludes(
    sources.tagLayout,
    'sanitizeSellingPointTags',
    'selling-point tag cells should remove sentence-tail fragments before visible/overflow packing'
  );
  assertIncludes(
    sources.tagLayout,
    'isWeakSellingPointFragment',
    'selling-point tag cells should not expose weak sentence-tail fragments such as 的姐妹们'
  );
  assertIncludes(
    sources.tagLayout,
    'isLongSellingPointTag',
    'selling-point tag cells should identify long usable labels for full-row rendering'
  );
  assertIncludes(
    sources.tagLayout,
    'SELLING_POINT_WEAK_FRAGMENT_PATTERN',
    'selling-point tag cells should guard weak fragments through an explicit pattern'
  );
  assertIncludes(
    sources.tagLayout,
    'expandSellingPointTag',
    'selling-point tag cells should split long concatenated marketing phrases into meaningful chips'
  );
  for (const token of ['520情人节', '宠粉福利', '香滑头发', '拍一发四']) {
    assertIncludes(
      sources.tagLayout,
      token,
      `selling-point tag lexicon should include ${token} for phrase splitting and visible packing`
    );
  }
  assertNotIncludes(
    sources.tagLayout,
    'SELLING_POINT_ROW_VISIBLE_LIMIT',
    'selling-point tag cells should not use a fixed per-row chip-count limit after width-aware packing'
  );
  assertNotIncludes(
    sources.tagLayout,
    'visibleRows[rowIndex].length >= SELLING_POINT_ROW_VISIBLE_LIMIT',
    'selling-point tag cells should not move chips behind +N only because two chips are already visible'
  );
  assertNotIncludes(
    sources.tagLayout,
    'shouldHideSellingPointTag',
    'selling-point tag cells should not hide usable labels behind +N only because they are long'
  );
  assertNotIncludes(
    sources.tagLayout,
    'SELLING_POINT_VISIBLE_LABEL_MAX_LENGTH',
    'selling-point tag cells should not use a short global length threshold that causes only +N cells'
  );
  assertNotIncludes(
    sources.tagLayout,
    'AUDIENCE_PRIMARY_ROW_VISIBLE_LIMIT',
    'audience tag cells should not hide usable audience labels only because two primary chips are already visible'
  );
  assertIncludes(
    sources.tagCells,
    'hiddenTitle',
    'overflow tag indicators should expose hidden chip text through a hover title'
  );
  assertIncludes(
    sources.tagCells,
    'tagChipMedium',
    'tag rendering should apply the medium chip class to complete mid-length selling-point phrases'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'display: grid;',
    'audience/selling-point tag cells should use explicit two-row layout instead of opportunistic wrapping'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'grid-template-rows: repeat(2, 22px);',
    'audience/selling-point tag cells should reserve two consistent chip rows'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'justify-items: start;',
    'audience/selling-point tag groups should align chip rows to the left'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagRow',
    'justify-content: flex-start;',
    'audience/selling-point tag rows should align chips to the left'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagChip,\n.moreTagChip',
    'flex: 0 0 auto;',
    'audience/selling-point tag chips should not shrink into half-visible labels'
  );
  assertCssRuleNotIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'flex-wrap: wrap;',
    'audience/selling-point tag groups should not rely on automatic wrapping after adopting explicit rows'
  );
  assertCssRuleNotIncludes(
    sources.cellCss,
    '.tagRow',
    'justify-content: center;',
    'audience/selling-point tag groups should not stay visually centered'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'text-align: left;',
    'audience/selling-point tag group text should align left'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'min-height: 48px;',
    'audience/selling-point tag groups should reserve a uniform two-line visual height'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.tagGroupCell',
    'max-height: 48px;',
    'audience/selling-point tag groups should cap at the same two-line visual height'
  );
  assertCssRuleIncludes(
    sources.css,
    '.exportButton',
    'border-radius: var(--border-radius-lg);',
    'detail export button should use a rounded-rectangle radius'
  );
  assertCssRuleNotIncludes(
    sources.css,
    '.exportButton',
    'border-radius: var(--border-radius-full);',
    'detail export button should not use the full capsule radius'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.audienceTagGroup .tagChip',
    'background: var(--brand-secondary);',
    'core audience chips should use the blue-soft brand background'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.sellingPointTagGroup .tagChip',
    'background: var(--bg-hover);',
    'marketing selling-point chips should use a restrained neutral gray background'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.sellingPointTagGroup .tagChipMedium',
    'max-width: 220px;',
    'medium selling-point chips should fit complete mid-length phrases before ellipsis'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.sellingPointTagGroup .tagChipWide',
    'max-width: 100%;',
    'long usable selling-point chips should be allowed to occupy a full visual row'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.sellingPointTagGroup .tagChipWideWithMore',
    'max-width: calc(100% - 54px);',
    'long selling-point chips should leave room for the overflow indicator plus row gap on the second row'
  );
  assertCssRuleIncludes(
    sources.cellCss,
    '.brandPillUnknown',
    'background: var(--status-neutral-bg);',
    'unrecognized brand pills should render with a visible neutral gray fill'
  );
  assertIncludes(
    sources.cellCss,
    '.exposureCell',
    'exposure column should have a centered dedicated numeric cell style'
  );
  assertIncludes(
    sources.cellCss,
    'word-break: normal;',
    'video titles should stay on one line instead of wrapping inside the row'
  );
  assertIncludes(sources.client, 'className={styles.tableViewport}', 'table should sit inside a padded viewport');
  assertIncludes(sources.css, '.tableViewport', 'table viewport padding should keep table off panel edges');

  assertIncludes(
    sources.clientHelpers,
    '`/marketing/content-assets/${encodeURIComponent(String(assetId))}`',
    'client helper should build a content-assets detail link from assetId'
  );
  assertIncludes(sources.tableCells, 'target="_blank"', 'asset video link should open in a new tab');
  assertNotIncludes(sources.tableCells, '已归档', 'asset video cell should not show archived status tags');
  assertNotIncludes(sources.tableCells, '未归档', 'asset video cell should not show unarchived status tags');

  assertIncludes(
    sources.backend,
    "'rawExposureCount', raw_exposure_count",
    'backend should return raw exposure range text for display and average-range calculations'
  );
  assertIncludes(sources.api, 'rawExposureCount', 'API normalizer should expose raw exposure range text');
  assertIncludes(sources.types, 'rawExposureCount', 'row type should include raw exposure range text');

  for (const forbidden of FORBIDDEN_API_ROW_KEYS) {
    assertNotIncludes(sources.backend, `'${forbidden}'`, `backend API rows should not expose ${forbidden}`);
  }

  assertIncludes(
    sources.backend,
    'const DOUYIN_LIVE_LEAD_TAB: &str = "douyin_live_lead_short_video"',
    'backend should expose the Douyin live lead short-video tab key'
  );
  assertIncludes(
    sources.backend,
    'const DOUYIN_GOODS_TAB: &str = "douyin_goods_short_video"',
    'backend should expose the Douyin goods short-video tab key'
  );
  assertIncludes(
    sources.backend,
    'const LIVE_LEAD_VIDEO_TYPE: &str = "live_lead_short_video"',
    'backend should map the live lead tab to the ODS/ADS video_type'
  );
  assertIncludes(
    sources.backend,
    'const GOODS_VIDEO_TYPE: &str = "goods_short_video"',
    'backend should map the goods tab to the ODS/ADS video_type'
  );
  assertIncludes(
    sources.backend,
    'WHERE video_type = $1',
    'backend available/latest month queries should filter by video_type'
  );
  assertIncludes(
    sources.backend,
    'AND material.video_type = p.video_type',
    'backend payload query should filter rows by selected video_type'
  );
  assertIncludes(
    sources.backend,
    '"label": "抖音直播引流短视频"',
    'backend tab payload should include 抖音直播引流短视频'
  );
  assertIncludes(
    sources.backend,
    '"label": "抖音带货短视频"',
    'backend tab payload should include 抖音带货短视频'
  );

  assertIncludes(sources.api, 'play3sRate', 'API normalizer should expose play3sRate');
  assertIncludes(sources.api, 'play5sRate', 'API normalizer should expose play5sRate');
  assertIncludes(sources.api, 'interactionRate', 'API normalizer should expose interactionRate');
  assertIncludes(sources.api, 'pvr', 'API normalizer should expose pvr');

  for (const alias of ['3S播放率', '3S完播率', '3秒播放率', '3秒完播率']) {
    assertIncludes(sources.yuntuRepository, alias, `YunTu archive parser should accept ${alias}`);
  }
  for (const alias of ['5S播放率', '5S完播率', '5秒播放率', '5秒完播率']) {
    assertIncludes(sources.yuntuRepository, alias, `YunTu archive parser should accept ${alias}`);
  }
}

function assertTagLayoutContracts({
  isMediumSellingPointTag,
  isWideSellingPointTag,
  resolveTagGroupCell,
}) {
  function assertSellingPointTagsInclude(source, expectedLabels, message) {
    const resolved = resolveTagGroupCell(source, 'sellingPoint');
    assert.ok(
      resolved.visibleRows.some((row) => row.length > 0),
      `${message}: should keep at least one visible selling-point chip`
    );
    for (const label of expectedLabels) {
      assert.ok(resolved.tags.includes(label), `${message}: should expose ${label}`);
    }
    return resolved;
  }

  const compactAudience = resolveTagGroupCell('学生 白领 genz 小镇青年 年轻女性', 'audience');
  assert.deepEqual(
    compactAudience.hiddenTags,
    [],
    'core-audience short chips should not collapse behind +N only because a fixed count was reached'
  );
  assert.deepEqual(
    compactAudience.visibleRows.flat(),
    ['学生', '白领', 'genz', '小镇青年', '年轻女性'],
    'core-audience width-aware rows should preserve all short visible labels when they fit'
  );

  const mixedAudience = resolveTagGroupCell('学生 白领 genz 18-24 女 小镇青年', 'audience');
  assert.deepEqual(mixedAudience.hiddenTags, [], 'core-audience demographic rows should keep fitting labels visible');
  for (const label of ['学生', '白领', 'genz', '小镇青年', '18-24', '女']) {
    assert.ok(mixedAudience.visibleRows.flat().includes(label), `core-audience rows should keep ${label} visible`);
  }

  const denseMixedAudience = resolveTagGroupCell('学生 白领 genz 小镇青年 年轻女性 头皮敏感 18-24 女', 'audience');
  assert.deepEqual(
    denseMixedAudience.hiddenTags,
    [],
    'core-audience mixed rows should backfill fitting primary labels before showing +N'
  );
  for (const label of ['学生', '白领', 'genz', '小镇青年', '年轻女性', '头皮敏感', '18-24', '女']) {
    assert.ok(
      denseMixedAudience.visibleRows.flat().includes(label),
      `core-audience mixed rows should keep ${label} visible`
    );
  }

  const emptySellingPoint = resolveTagGroupCell('--', 'sellingPoint');
  assert.deepEqual(emptySellingPoint.tags, [], 'selling-point placeholder -- should not render as a chip');
  assert.deepEqual(emptySellingPoint.visibleRows, [[], []], 'selling-point placeholder -- should fall back to muted text');

  const punctuationSellingPoint = resolveTagGroupCell('！！！ 免洗洗发精、免洗洗发巾', 'sellingPoint');
  assert.deepEqual(
    punctuationSellingPoint.tags,
    ['免洗洗发精', '免洗洗发巾'],
    'selling-point punctuation-only fragments should be removed before chip layout'
  );

  const weakTailSellingPoint = resolveTagGroupCell(
    '改善脱发掉发脱发掉发严重的姐妹们赠送气垫钢梳买一送一',
    'sellingPoint'
  );
  assert.ok(
    weakTailSellingPoint.visibleRows.some((row) => row.length > 0),
    'selling-point cells with usable text should keep at least one visible chip'
  );
  assert.ok(
    weakTailSellingPoint.tags.every((tag) => !tag.includes('姐妹们')),
    'selling-point weak audience tails such as 的姐妹们 should not remain in visible or overflow tags'
  );
  assert.ok(
    weakTailSellingPoint.tags.includes('买一送一'),
    'selling-point long phrases should expose known commercial tokens instead of keeping one oversized sentence'
  );

  const campaignSellingPoint = resolveTagGroupCell('六幺八特惠六幺八限时成分', 'sellingPoint');
  assert.ok(campaignSellingPoint.tags.includes('618特惠'), 'selling-point aliases should normalize 六幺八特惠');
  assert.ok(campaignSellingPoint.tags.includes('618限时'), 'selling-point aliases should normalize 六幺八限时');
  assert.ok(
    !campaignSellingPoint.tags.includes('成分'),
    'selling-point weak standalone tails such as 成分 should not render as chips'
  );

  const knownCombinedSellingPoint = resolveTagGroupCell('五二零情人节宠粉香滑头发', 'sellingPoint');
  assert.deepEqual(
    knownCombinedSellingPoint.tags,
    ['520情人节', '宠粉福利', '香滑头发'],
    'known concatenated selling-point phrases should split into meaningful chips'
  );

  const summerSellingPoint = resolveTagGroupCell('去油护发一体夏日感十足夏天使用拍一发四', 'sellingPoint');
  assert.ok(
    summerSellingPoint.tags.includes('夏日感十足'),
    'selling-point suffix modifiers should stay with their base phrase instead of becoming standalone chips'
  );
  assert.ok(!summerSellingPoint.tags.includes('十足'), 'selling-point weak modifier 十足 should not render alone');

  const spaSellingPoint = resolveTagGroupCell(
    '改善干枯毛躁在家享受千元头发spa千元光能牧羊梳多功能洗护套装',
    'sellingPoint'
  );
  assert.ok(
    spaSellingPoint.tags.includes('在家享受千元头发spa'),
    'selling-point phrase splitting should keep 千元 attached to the spa phrase'
  );
  assert.ok(!spaSellingPoint.tags.includes('千元'), 'selling-point weak modifier 千元 should not render alone');

  const dyeColorSellingPoint = resolveTagGroupCell(
    '避免布丁头尴尬学生或白领适合多种颜色不张扬耐看',
    'sellingPoint'
  );
  assert.deepEqual(
    dyeColorSellingPoint.hiddenTags,
    [],
    'selling-point compact dye-color phrases should not hide short tail chips such as 耐看'
  );
  for (const label of ['避免布丁头尴尬', '学生或白领', '适合多种颜色', '不张扬', '耐看']) {
    assert.ok(dyeColorSellingPoint.tags.includes(label), `selling-point dye-color phrase should expose ${label}`);
  }

  const giftSellingPoint = resolveTagGroupCell(
    '深层修护改善干枯毛躁赠送千元雾氧按摩梳赠送洗发水、亮发膜、亮精油',
    'sellingPoint'
  );
  assert.deepEqual(
    giftSellingPoint.hiddenTags,
    [],
    'selling-point repeated gift phrases should split before deciding that short gift chips need +N'
  );
  for (const label of ['深层修护', '改善干枯毛躁', '赠送千元雾氧按摩梳', '赠送洗发水', '亮发膜', '亮精油']) {
    assert.ok(giftSellingPoint.tags.includes(label), `selling-point gift phrase should expose ${label}`);
  }

  const proteinSellingPoint = resolveTagGroupCell(
    '根据烫染次数调整护理级别顺滑改善分叉家庭护理四 d 仿生蛋白素',
    'sellingPoint'
  );
  for (const label of ['根据烫染次数调整护理级别', '顺滑', '改善分叉', '家庭护理', '4D仿生蛋白素']) {
    assert.ok(proteinSellingPoint.tags.includes(label), `selling-point care phrase should expose ${label}`);
  }
  assert.ok(
    proteinSellingPoint.tags.every((tag) => !tag.includes('家庭护理四')),
    'selling-point care phrase should not expose broken 四 d fragments'
  );
  assert.deepEqual(
    proteinSellingPoint.hiddenTags,
    [],
    'selling-point care phrase should keep fitting medium and compact chips visible instead of using +N'
  );
  assert.equal(
    isMediumSellingPointTag('根据烫染次数调整护理级别'),
    true,
    'selling-point care phrase should be classified as medium, not clipped by the compact 132px cap'
  );
  assert.equal(
    isWideSellingPointTag('根据烫染次数调整护理级别'),
    false,
    'selling-point care phrase should not occupy a full wide row when it fits as a medium chip'
  );
  assert.equal(
    isWideSellingPointTag('改善发质有效果的发膜深入修护爱烫染家庭护理'),
    true,
    'true long selling-point labels should still be classified as wide full-row chips'
  );

  const flatHairSellingPoint = resolveTagGroupCell(
    '头皮清爽赠送洗头按摩梳易出油、扁塌的亚洲人亚洲发质',
    'sellingPoint'
  );
  for (const label of ['头皮清爽', '赠送洗头按摩梳', '易出油', '扁塌发质', '亚洲发质']) {
    assert.ok(flatHairSellingPoint.tags.includes(label), `selling-point hair-type phrase should expose ${label}`);
  }
  assert.ok(
    flatHairSellingPoint.tags.every((tag) => !tag.includes('亚洲人亚洲发质')),
    'selling-point hair-type phrase should not expose duplicated audience wording as one chip'
  );

  const promoSellingPoint = resolveTagGroupCell('染发赠送修护发膜宠粉活动超显白', 'sellingPoint');
  assert.ok(promoSellingPoint.tags.includes('超显白'), 'selling-point promo phrase should keep 超显白 visible');
  assert.ok(!promoSellingPoint.tags.includes('活动'), 'selling-point weak standalone 活动 should not render alone');

  const mayPromoSellingPoint = assertSellingPointTagsInclude(
    '在家轻松染发省钱染发五一特惠修护发膜',
    ['在家轻松染发', '省钱染发', '五一特惠', '修护发膜'],
    'selling-point May campaign phrase'
  );
  assert.deepEqual(
    mayPromoSellingPoint.hiddenTags,
    [],
    'selling-point May campaign phrase should not hide fitting short chips behind +N'
  );

  assertSellingPointTagsInclude(
    '修护受损发丝限时加赠套盒优惠奢养洗护',
    ['修护受损发丝', '限时加赠', '套盒优惠', '奢养洗护'],
    'selling-point repair bundle phrase'
  );

  assertSellingPointTagsInclude(
    '赠送修护发膜拍一发三无需褪色漂染显白显氛围',
    ['赠送修护发膜', '拍一发三', '无需褪色漂染', '显白显氛围'],
    'selling-point no-bleach dye phrase'
  );

  const wifeTailSellingPoint = assertSellingPointTagsInclude(
    '头发毛躁解决头发问题想要改善发质的老婆们头发滋养效果好',
    ['头发毛躁', '解决头发问题', '改善发质', '头发滋养', '效果好'],
    'selling-point wife-tail phrase'
  );
  assert.ok(
    wifeTailSellingPoint.tags.every((tag) => !tag.includes('老婆')),
    'selling-point weak audience tails such as 的老婆们 should not remain in tags'
  );
  assert.ok(
    wifeTailSellingPoint.tags.every((tag) => tag !== '想要'),
    'selling-point weak bridge fragments such as 想要 should not render alone'
  );

  const girlfriendTailSellingPoint = assertSellingPointTagsInclude(
    '不失去染发自由想换发色的姐妹们赠送修护发膜拍一发三',
    ['染发自由', '想换发色', '赠送修护发膜', '拍一发三'],
    'selling-point girlfriend-tail phrase'
  );
  assert.ok(
    girlfriendTailSellingPoint.tags.every((tag) => !tag.includes('姐妹们') && tag !== '不失去'),
    'selling-point weak lead/tail fragments should not remain in tags'
  );

  const lowPriceSellingPoint = assertSellingPointTagsInclude(
    '轻松上色想要换发色的姐妹们五一福利五一宠粉超低价',
    ['轻松上色', '想换发色', '五一福利', '五一宠粉', '超低价'],
    'selling-point low-price campaign phrase'
  );
  assert.ok(
    lowPriceSellingPoint.tags.every((tag) => !tag.includes('姐妹们')),
    'selling-point low-price campaign should remove weak audience tails before tooltip overflow'
  );

  assertSellingPointTagsInclude(
    '全面升级改善头发状况美女姐妹们清新白花气息',
    ['全面升级', '改善头发状况', '清新白花气息'],
    'selling-point beauty-tail phrase'
  );

  const oilyWeakAddressSellingPoint = resolveTagGroupCell('油头女生必备控油蓬松', 'sellingPoint');
  assert.deepEqual(
    oilyWeakAddressSellingPoint.tags,
    ['油头', '控油蓬松'],
    'selling-point short segments should strip weak audience/address/action wrappers around known tokens'
  );
  assert.deepEqual(
    oilyWeakAddressSellingPoint.hiddenTags,
    [],
    'selling-point stripped short segments should stay visible when they fit'
  );

  const sensitiveScalpSellingPoint = assertSellingPointTagsInclude(
    '头皮敏感人群可用温和不刺激',
    ['头皮敏感', '温和不刺激'],
    'selling-point sensitive-scalp phrase'
  );
  assert.ok(
    sensitiveScalpSellingPoint.tags.every((tag) => !tag.includes('人群') && !tag.includes('可用')),
    'selling-point sensitive-scalp phrase should strip weak audience tail 人群 and weak action 可用'
  );

  const repairWeakFragmentSellingPoint = assertSellingPointTagsInclude(
    '修护受损发质干枯毛躁姐妹必入买一送一',
    ['修护受损', '干枯毛躁', '买一送一'],
    'selling-point repair phrase'
  );
  assert.ok(
    repairWeakFragmentSellingPoint.tags.every(
      (tag) => !tag.includes('发质') && !tag.includes('姐妹') && !tag.includes('必入')
    ),
    'selling-point repair phrase should strip weak residue between known selling-point tokens'
  );

  for (const protectedLabel of ['黄皮姐妹', '浅发色人群', '扁塌发质', '适合多种颜色']) {
    const protectedSellingPoint = resolveTagGroupCell(protectedLabel, 'sellingPoint');
    assert.ok(
      protectedSellingPoint.tags.includes(protectedLabel),
      `selling-point weak-residue cleanup should not damage protected known label ${protectedLabel}`
    );
  }
}

function assertNormalizedBackfillContracts(normalizeIndustryMaterialBrandAiBackfillResponse) {
  const normalized = normalizeIndustryMaterialBrandAiBackfillResponse({
    data: {
      queued_jobs: 3,
      skipped_existing: 2,
      skipped_running: 1,
      skipped_no_input: 4,
      eligible_assets: 6,
      linked_assets: 8,
      missing_analysis: 4,
      remaining_missing_after_click: 1,
      limit: 20,
      limit_reached: true,
      worker_trigger: {
        status: 'created',
        queued_jobs: 3,
        immediate_limit: 10,
        flow_run_id: 'flow-run-1',
        flow_run_name: 'content-asset-analysis-batch-1',
        fallback: 'scheduled',
        message: 'immediate worker created',
      },
      message: 'qianchuan / yuntu backfill queued',
    },
  });

  assert.equal(normalized.queuedJobs, 3, 'AI backfill normalizer should read queued_jobs');
  assert.equal(normalized.skippedExisting, 2, 'AI backfill normalizer should read skipped_existing');
  assert.equal(normalized.skippedRunning, 1, 'AI backfill normalizer should read skipped_running');
  assert.equal(normalized.skippedNoInput, 4, 'AI backfill normalizer should read skipped_no_input');
  assert.equal(normalized.eligibleAssets, 6, 'AI backfill normalizer should read eligible_assets');
  assert.equal(normalized.linkedAssets, 8, 'AI backfill normalizer should read linked_assets');
  assert.equal(normalized.missingAnalysis, 4, 'AI backfill normalizer should read missing_analysis');
  assert.equal(
    normalized.remainingMissingAfterClick,
    1,
    'AI backfill normalizer should read remaining_missing_after_click'
  );
  assert.equal(normalized.limit, 20, 'AI backfill normalizer should read limit');
  assert.equal(normalized.limitReached, true, 'AI backfill normalizer should read limit_reached');
  assert.equal(normalized.workerTrigger.status, 'created', 'AI backfill normalizer should read worker status');
  assert.equal(normalized.workerTrigger.immediateLimit, 10, 'AI backfill immediate limit should stay 10');
  assert.equal(normalized.workerTrigger.flowRunId, 'flow-run-1', 'AI backfill normalizer should read flow run id');
  assert.equal(
    normalized.message,
    '千川 / 云图 backfill queued',
    'AI backfill normalizer should localize snake-case response messages'
  );

  const camel = normalizeIndustryMaterialBrandAiBackfillResponse({
    queuedJobs: 5,
    skippedReadyAssets: 4,
    skippedExistingJobs: 1,
    skippedRunningJobs: 2,
    skippedNoInput: 3,
    candidateAssets: 7,
    scannedAssets: 9,
    missingAnalysisBefore: 5,
    remainingMissingAfterClick: 0,
    limit: 20,
    limitReached: false,
    workerTrigger: {
      status: 'failed',
      queuedJobs: 5,
      immediateLimit: 10,
      flowRunId: null,
      flowRunName: null,
      fallback: 'scheduled',
      message: 'scheduled fallback',
    },
  });
  assert.equal(camel.queuedJobs, 5, 'AI backfill normalizer should read queuedJobs');
  assert.equal(camel.skippedExisting, 5, 'AI backfill normalizer should sum backend skipped existing fields');
  assert.equal(camel.skippedReady, 4, 'AI backfill normalizer should read skippedReadyAssets');
  assert.equal(camel.skippedExistingJobs, 1, 'AI backfill normalizer should read skippedExistingJobs');
  assert.equal(camel.skippedRunning, 2, 'AI backfill normalizer should read skippedRunning');
  assert.equal(camel.skippedNoInput, 3, 'AI backfill normalizer should read skippedNoInput');
  assert.equal(camel.eligibleAssets, 7, 'AI backfill normalizer should read backend candidateAssets');
  assert.equal(camel.linkedAssets, 9, 'AI backfill normalizer should read backend scannedAssets');
  assert.equal(camel.missingAnalysis, 5, 'AI backfill normalizer should read missingAnalysis');
  assert.equal(camel.remainingMissingAfterClick, 0, 'AI backfill normalizer should read remainingMissingAfterClick');
  assert.equal(camel.limit, 20, 'AI backfill normalizer should read camel limit');
  assert.equal(camel.limitReached, false, 'AI backfill normalizer should read camel limitReached');
  assert.equal(camel.workerTrigger.status, 'failed', 'AI backfill normalizer should read camel worker status');
  assert.equal(camel.workerTrigger.fallback, 'scheduled', 'AI backfill fallback should remain scheduled');
}

function assertBrandAiPresentationContracts({
  resolveBrandAiCoverageState,
  resolveBrandAiExecutiveSummary,
}) {
  const fullCoverage = resolveBrandAiCoverageState({
    totalMaterials: 29,
    linkedAssets: 29,
    analyzedAssets: 29,
    anyAiContentAssets: 29,
    structuredVideoUnderstandingAssets: 29,
    analysisArtifactAssets: 29,
    missingAnalysis: 0,
    missingStructuredVideoUnderstanding: 0,
    queuedStructuredVideoUnderstanding: 0,
    runningStructuredVideoUnderstanding: 0,
    structuredVideoUnderstandingTableAvailable: true,
    structuredVideoUnderstandingReady: true,
    rowsWithPerformance: 29,
  });
  assert.equal(
    fullCoverage.primaryLabel,
    'AI 分析完成 · 29/29',
    'fully covered brands should collapse duplicate counts into one completed status'
  );
  assert.equal(fullCoverage.secondaryLabel, null, 'fully covered brands should not repeat AI content coverage');
  assert.equal(fullCoverage.processingLabel, null, 'fully covered brands should not render a zero-work status');

  const partialCoverage = resolveBrandAiCoverageState({
    totalMaterials: 29,
    linkedAssets: 24,
    analyzedAssets: 27,
    anyAiContentAssets: 27,
    structuredVideoUnderstandingAssets: 20,
    analysisArtifactAssets: 27,
    missingAnalysis: 4,
    missingStructuredVideoUnderstanding: 4,
    queuedStructuredVideoUnderstanding: 2,
    runningStructuredVideoUnderstanding: 1,
    structuredVideoUnderstandingTableAvailable: true,
    structuredVideoUnderstandingReady: true,
    rowsWithPerformance: 29,
  });
  assert.equal(partialCoverage.primaryLabel, '视频理解 20/24', 'active partial coverage should stay concise');
  assert.equal(partialCoverage.secondaryLabel, '待归档 5 条', 'archive gaps should remain visible only when they exist');
  assert.equal(partialCoverage.processingLabel, '处理中 3', 'queued and running work should merge into one status');

  const executiveSummary = resolveBrandAiExecutiveSummary({
    coverage: {
      totalMaterials: 29,
      linkedAssets: 29,
      analyzedAssets: 29,
      anyAiContentAssets: 29,
      structuredVideoUnderstandingAssets: 29,
      analysisArtifactAssets: 29,
      missingAnalysis: 0,
      missingStructuredVideoUnderstanding: 0,
      queuedStructuredVideoUnderstanding: 0,
      runningStructuredVideoUnderstanding: 0,
      structuredVideoUnderstandingTableAvailable: true,
      structuredVideoUnderstandingReady: true,
      rowsWithPerformance: 29,
    },
    fusionSummary: {
      reinforcedMaterials: 2,
      highConfidenceMaterials: 3,
      structuredVideoMaterials: 29,
    },
    strategyCards: [
      { key: 'core_strategy', value: '千川', helper: '从高表现内容聚合。' },
      { key: 'hook', value: '痛点开场', helper: '' },
    ],
    wordCloudTerms: [{ term: '头皮护理' }],
    evidenceMaterials: [
      {
        title: '高表现直播引流素材',
        fusionDiagnosis: {
          headline: '进房内容信号与行业可见表现一致',
          contentPattern: '进房利益前置',
        },
      },
    ],
    nextActions: [
      {
        title: '复剪前三秒进房钩子',
        detail: '把直播利益和进房理由拆成小样本 A/B。',
        metricTarget: '提升 5S 留存与 PVR',
      },
    ],
    gaps: [],
  });
  assert.equal(
    executiveSummary.headline,
    '已找到 2 条内容与表现相互支持的证据样本',
    'executive summary should lead with the strongest defensible brand-level conclusion'
  );
  assert.deepEqual(
    executiveSummary.items.map((item) => item.label),
    ['核心打法', '有效信号', '优先验证动作'],
    'executive summary should keep a stable three-point scan order'
  );
  assert.equal(
    executiveSummary.items[0]?.value,
    '进房利益前置',
    'summary should skip source-channel noise and prefer a structured content pattern'
  );
  assert.equal(
    executiveSummary.items[1]?.value,
    '进房内容信号与行业可见表现一致',
    'summary should use the highest-ranked fusion evidence without inventing a new model claim'
  );
  assert.equal(
    executiveSummary.items[2]?.value,
    '复剪前三秒进房钩子',
    'summary should promote the primary validation action exactly once'
  );
  assert.equal(
    executiveSummary.items[2]?.detail,
    '把直播利益和进房理由拆成小样本 A/B。 · 提升 5S 留存与 PVR',
    'summary should keep both the action detail and metric target without a nested duplicate block'
  );

  const contentThemeSummary = resolveBrandAiExecutiveSummary({
    coverage: {
      totalMaterials: 6,
      linkedAssets: 6,
      analyzedAssets: 6,
      anyAiContentAssets: 6,
      structuredVideoUnderstandingAssets: 6,
      missingAnalysis: 0,
      missingStructuredVideoUnderstanding: 0,
      queuedStructuredVideoUnderstanding: 0,
      runningStructuredVideoUnderstanding: 0,
    },
    fusionSummary: null,
    contentThemeTerms: [
      { term: '头皮养护', group: 'topic', themeScore: 86 },
      { term: '痛点开场', group: 'expression', themeScore: 90 },
    ],
    strategyCards: [],
    wordCloudTerms: [{ term: '旧主题兜底' }],
    evidenceMaterials: [],
    nextActions: [],
    gaps: [],
  });
  assert.equal(
    contentThemeSummary.items[0]?.value,
    '头皮养护',
    'executive summary should prefer the highest scored content topic over the legacy word cloud'
  );

  const conservativeSummary = resolveBrandAiExecutiveSummary({
    coverage: {
      totalMaterials: 4,
      linkedAssets: 4,
      analyzedAssets: 4,
      anyAiContentAssets: 4,
      structuredVideoUnderstandingAssets: 0,
      missingAnalysis: 4,
      missingStructuredVideoUnderstanding: 4,
      queuedStructuredVideoUnderstanding: 0,
      runningStructuredVideoUnderstanding: 0,
    },
    fusionSummary: null,
    strategyCards: [],
    wordCloudTerms: [],
    evidenceMaterials: [],
    nextActions: [],
    gaps: [],
  });
  assert.equal(
    conservativeSummary.headline,
    '已形成初步品牌内容假设，当前证据置信度有限',
    'legacy AI coverage should stay explicitly low confidence'
  );
  assert.equal(
    'action' in conservativeSummary,
    false,
    'executive summary should not retain the retired nested action contract'
  );
}

function assertNormalizedResponseContracts(
  normalizeIndustryMaterialResponse,
  resolveIndustryMaterialDisplayBrand,
  formatIndustryMaterialBrandResolutionTooltip
) {
  const normalized = normalizeIndustryMaterialResponse({
    data: {
      tab: 'douyin_video',
      month: '2026-05',
      availableMonths: ['2026-05'],
      summary: {
        totalCount: 1,
        brandCount: 1,
        archivedCount: 1,
        unarchivedCount: 0,
        totalExposure: 123456,
        avgCompletionRate: 0.11,
        avgCtr: 0.22,
        avgCvr: 0.33,
        avgPlay3sRate: 0.44,
        avgPlay5sRate: 0.55,
        avgInteractionRate: 0.66,
        avgPvr: 0.77,
      },
      brand_options: [
        {
          key: '卡诗',
          label: '卡诗',
          material_count: 1,
          linked_asset_count: 1,
          analyzed_asset_count: 1,
          structured_video_understanding_asset_count: 1,
        },
      ],
      selected_brand: {
        key: '卡诗',
        label: '卡诗',
      },
      brand_insight: {
        tab: 'douyin_goods_short_video',
        month: '2026-05',
        objective: 'goods_cart',
        coverage: {
          total_materials: 1,
          linked_assets: 1,
          analyzed_assets: 1,
          any_ai_content_assets: 1,
          structured_video_understanding_assets: 1,
          analysis_artifact_assets: 1,
          missing_analysis: 0,
          missing_structured_video_understanding: 0,
          queued_structured_video_understanding: 2,
          running_structured_video_understanding: 1,
          structured_video_understanding_table_available: true,
          structured_video_understanding_ready: true,
          rows_with_performance: 1,
        },
        fusion_summary: {
          score_basis: 'industry_month_type_relative',
          benchmark_label: '当前月份同视频类型行业样本四分位',
          benchmark_sample_size: 120,
          scored_materials: 1,
          data_content_fusion_materials: 1,
          structured_video_materials: 1,
          legacy_content_materials: 0,
          high_confidence_materials: 1,
          reinforced_materials: 1,
          average_score: 84,
          method_note: '融合分仅表示行业样本相对证据强度。',
        },
        content_theme_summary: {
          eligible_materials: 29,
          topic_count: 1,
          expression_count: 1,
        },
        content_theme_terms: [
          {
            term: '头皮养护',
            group: 'topic',
            theme_score: 82.4,
            semantic_score: 88,
            coverage_score: 76,
            performance_score: 81,
            performance_band: 'high',
            source_count: 6,
            evidence_asset_ids: ['asset-1', 'asset-1', 'asset-2'],
          },
          {
            term: '痛点开场',
            group: 'expression',
            theme_score: 67.5,
            semantic_score: 72,
            coverage_score: 60,
            performance_score: 66,
            performance_band: 'mid',
            source_count: 4,
            evidence_asset_ids: ['asset-1'],
          },
          {
            term: '非法分组',
            group: 'source',
            theme_score: 90,
            semantic_score: 90,
            coverage_score: 90,
            performance_score: 90,
            performance_band: 'high',
            source_count: 4,
          },
          {
            term: '非法表现档',
            group: 'topic',
            theme_score: 90,
            semantic_score: 90,
            coverage_score: 90,
            performance_score: 90,
            performance_band: 'excellent',
            source_count: 4,
          },
          {
            term: '非法分数',
            group: 'topic',
            theme_score: Number.POSITIVE_INFINITY,
            semantic_score: 90,
            coverage_score: 90,
            performance_score: 90,
            performance_band: 'high',
            source_count: 4,
          },
        ],
        analysis_boundary: {
          mode: 'industry_visible_metrics_content_fusion',
          visible_signals: ['rank', 'ctr', 'videoUnderstanding'],
          unavailable_signals: ['liveRoomAcceptance', 'roi'],
          conclusion_policy: 'fixture boundary policy',
        },
        analysis_profile: {
          key: 'goods_cart_industry_visible',
          title: 'goods qianchuan profile',
          primary_question: '用 qianchuan 指标判断内容点击线索',
          decision_lens: '围绕 yuntu 和 qianchuan 信号判断卖点表达。',
          metric_priority: [
            {
              key: 'ctr',
              label: 'CTR',
              role: 'qianchuan click signal',
            },
            {
              key: 'cvr',
              label: 'CVR',
              role: 'visible conversion signal',
            },
          ],
          video_content_focus: ['selling point', 'YunTu proof'],
          forbidden_conclusions: ['product card acceptance unavailable'],
        },
        theme_terms: [
          {
            term: '修护',
            weight: 6,
            source_count: 1,
            evidence_asset_ids: ['asset-1'],
          },
          {
            term: 'qianchuan',
            weight: 5,
            source_count: 1,
            evidence_asset_ids: ['asset-1'],
          },
          {
            term: 'YunTu',
            weight: 4,
            source_count: 1,
            evidence_asset_ids: ['asset-1'],
          },
        ],
        strategy_cards: [
          {
            key: 'core_strategy',
            title: '核心策略',
            value: '',
            helper: '允许空值卡片进入 UI，由面板展示占位。',
            evidence_count: 1,
          },
          {
            key: 'source_alias',
            title: '来源口径',
            value: 'qianchuan / yuntu',
            helper: '来自 YunTu 和 qianchuan 的聚合信号。',
            evidence_count: 1,
          },
        ],
        evidence_materials: [
          {
            asset_id: 'asset-1',
            title: '修护发丝素材',
            rank: 1,
            exposure: 123456,
            completion_rate: 0.11,
            ctr: 0.22,
            cvr: 0.33,
            play_3s_rate: 0.44,
            play_5s_rate: 0.55,
            interaction_rate: 0.66,
            pvr: 0.77,
            summary: '该素材适合继续放量投放，需优化后再投放，建议小测观察投放表现。qianchuan',
            reason: '表现稳定',
            fusion_diagnosis: {
              score_basis: 'industry_month_type_relative',
              benchmark_label: '当前月份同视频类型行业样本四分位',
              benchmark_sample_size: 120,
              score: 84,
              metric_score: 80,
              content_score: 92,
              diagnosis_mode: 'data_content_fusion',
              content_evidence_tier: 'structured_video_understanding',
              confidence: 'high',
              alignment: 'reinforced',
              headline: '商品表达与行业可见点击/转化线索一致',
              diagnosis: '修护卖点与 CTR、CVR、PVR 相对表现相互支持，不代表商品页承接。',
              next_step: '复刻首屏卖点与 CTA，继续观察 CTR、CVR 与 PVR。',
              content_pattern: '适合继续放量投放的痛点开场',
              metric_signals: [
                { key: 'ctr', label: 'CTR', value: 0.22, band: 'high' },
                { key: 'cvr', label: 'CVR', value: 0.33, band: 'mid' },
              ],
              content_signals: [
                { key: 'hook', label: '钩子类型', value: '适合继续放量投放的痛点开场', level: 'strong' },
                { key: 'sellingPoint', label: '卖点清晰度', value: 'medium', level: 'medium' },
              ],
            },
          },
        ],
        next_actions: [
          {
            title: '复剪首屏卖点',
            detail: '围绕 qianchuan 与 yuntu 信号做 A/B。',
            owner: 'creative',
            priority: 'high',
            action_type: 'rewrite_hook',
            metric_target: '提升 CTR',
            evidence_count: 1,
          },
        ],
        gaps: ['fixture gap', 'missing yuntu/qianchuan'],
      },
      rows: [
        {
          recordId: 'record-1',
          statMonth: '2026-05',
          brandName: '卡诗',
          videoTypeName: '带货短视频',
          qianchuanSceneName: '千川短视频',
          rank: 1,
          product: '洗护',
          audience: '精致护理人群',
          sellingPoint: '修护发丝',
          publishTime: '2026-05',
          assetId: 'asset-1',
          rawExposureCount: '700-800万',
          exposureCount: 123456,
          completionRate: 0.11,
          ctr: 0.22,
          cvr: 0.33,
          play3sRate: 0.44,
          play5sRate: 0.55,
          interactionRate: 0.66,
          pvr: 0.77,
          archiveStatus: 'succeeded',
          cdn_url: 'https://example.invalid/video.mp4',
          tos_object_key: 'private/key.mp4',
          raw_sha256: 'sha256-fixture',
          row_payload: { raw: true },
        },
        {
          recordId: 'b186e316-fd17-5bbb-bef7-5a6dc514cd18',
          statMonth: '2026-05',
          brandName: 'OKCS',
          brandResolutionStatus: 'recognized',
          brandResolutionSource: 'visual',
          brandResolutionConfidence: 0.99,
          brandResolutionEvidence: {
            evidence: [
              {
                source: 'frame',
                kind: 'package_logo',
                text: 'OKCS',
                timeRange: '00:24-00:31',
              },
            ],
            alternatives: [],
          },
          rank: 6,
          title: '黄黑皮闭眼冲！亚麻灰棕色显白显气质，时髦靓丽超适合春天',
          assetId: '4ab75252-b87b-557b-be2d-59e8f4c5a37e',
        },
      ],
    },
  });

  assert.equal(normalized.tab, 'douyin_live_lead_short_video', 'normalizer should reject the legacy collapsed Douyin tab');
  assert.equal(
    normalizeIndustryMaterialResponse({ data: { tab: 'douyin_goods_short_video', rows: [] } }).tab,
    'douyin_goods_short_video',
    'normalizer should keep the Douyin goods tab'
  );
  assert.equal(normalized.month, '2026-05', 'normalizer should keep YYYY-MM month');
  assert.deepEqual(normalized.availableMonths, ['2026-05'], 'normalizer should keep valid available months');
  assert.equal(normalized.summary?.avgInteractionRate, 0.66, 'summary should keep average interaction rate');
  assert.equal(normalized.summary?.avgPvr, 0.77, 'summary should keep average PVR');
  assert.equal(normalized.brandOptions[0]?.key, '卡诗', 'normalizer should keep brand option keys');
  assert.equal(normalized.selectedBrand?.label, '卡诗', 'normalizer should keep selected brand');
  assert.equal(normalized.brandInsight?.brand.key, '卡诗', 'brand insight should fall back to root selected brand');
  assert.equal(normalized.brandInsight?.wordCloudTerms[0]?.term, '修护', 'brand insight should normalize theme terms');
  assert.equal(normalized.brandInsight?.wordCloudTerms[1]?.term, '千川', 'brand insight should localize qianchuan terms');
  assert.equal(normalized.brandInsight?.wordCloudTerms[2]?.term, '云图', 'brand insight should localize YunTu terms');
  assert.equal(
    normalized.brandInsight?.strategyCards[0]?.value,
    '',
    'strategy cards should preserve empty values for UI fallback'
  );
  assert.equal(
    normalized.brandInsight?.strategyCards[1]?.value,
    '千川 / 云图',
    'strategy cards should localize source aliases before rendering'
  );
  assert.equal(
    normalized.brandInsight?.analysisBoundary.mode,
    'industry_visible_metrics_content_fusion',
    'brand insight should normalize snake-case analysis boundary mode'
  );
  assert.deepEqual(
    normalized.brandInsight?.analysisBoundary.visibleSignals,
    ['rank', 'ctr', 'videoUnderstanding'],
    'brand insight should normalize snake-case visible signals'
  );
  assert.deepEqual(
    normalized.brandInsight?.analysisBoundary.unavailableSignals,
    ['liveRoomAcceptance', 'roi'],
    'brand insight should normalize snake-case unavailable signals'
  );
  assert.equal(
    normalized.brandInsight?.analysisBoundary.conclusionPolicy,
    'fixture boundary policy',
    'brand insight should normalize snake-case conclusion policy'
  );
  assert.equal(
    normalized.brandInsight?.analysisProfile.key,
    'goods_cart_industry_visible',
    'brand insight should normalize snake-case analysis profile key'
  );
  assert.equal(
    normalized.brandInsight?.analysisProfile.title,
    'goods 千川 profile',
    'brand insight should localize analysis profile title'
  );
  assert.equal(
    normalized.brandInsight?.analysisProfile.metricPriority[0]?.role,
    '千川 click signal',
    'brand insight should normalize and localize profile metric roles'
  );
  assert.equal(
    normalized.brandInsight?.fusionSummary?.scoreBasis,
    'industry_month_type_relative',
    'brand insight should normalize the Phase 2 fusion score basis'
  );
  assert.equal(
    normalized.brandInsight?.fusionSummary?.benchmarkSampleSize,
    120,
    'brand insight should keep the fusion benchmark sample size'
  );
  assert.equal(
    normalized.brandInsight?.fusionSummary?.averageScore,
    84,
    'brand insight should normalize the brand fusion average score'
  );
  assert.equal(
    normalized.brandInsight?.fusionSummary?.structuredVideoMaterials,
    1,
    'brand insight should distinguish structured video understanding coverage'
  );
  assert.deepEqual(
    normalized.brandInsight?.contentThemeSummary,
    { eligibleMaterials: 29, topicCount: 1, expressionCount: 1 },
    'brand insight should normalize the scored content-theme summary'
  );
  assert.equal(
    normalized.brandInsight?.contentThemeTerms.length,
    2,
    'brand insight should discard invalid theme groups, bands, and non-finite scores'
  );
  assert.deepEqual(
    normalized.brandInsight?.contentThemeTerms.map((term) => [term.term, term.group, term.performanceBand]),
    [
      ['头皮养护', 'topic', 'high'],
      ['痛点开场', 'expression', 'mid'],
    ],
    'brand insight should preserve valid topic and expression terms'
  );
  assert.equal(
    normalized.brandInsight?.contentThemeTerms[0]?.themeScore,
    82.4,
    'brand insight should preserve finite theme scores'
  );
  assert.deepEqual(
    normalized.brandInsight?.contentThemeTerms[0]?.evidenceAssetIds,
    ['asset-1', 'asset-2'],
    'brand insight should trim and deduplicate content-theme evidence asset IDs'
  );
  assert.equal(
    normalized.brandInsight?.coverage.anyAiContentAssets,
    1,
    'brand insight should preserve any-AI content coverage separately'
  );
  assert.equal(
    normalized.brandInsight?.coverage.structuredVideoUnderstandingAssets,
    1,
    'brand insight should normalize real structured video-understanding coverage'
  );
  assert.equal(
    normalized.brandInsight?.coverage.queuedStructuredVideoUnderstanding,
    2,
    'brand insight should normalize queued structured video-understanding jobs'
  );
  assert.equal(
    normalized.brandInsight?.coverage.runningStructuredVideoUnderstanding,
    1,
    'brand insight should normalize running structured video-understanding jobs'
  );
  assert.equal(
    normalized.brandInsight?.coverage.structuredVideoUnderstandingReady,
    true,
    'brand insight should expose structured storage readiness'
  );
  assert.deepEqual(
    normalized.brandInsight?.analysisProfile.videoContentFocus,
    ['selling point', '云图 proof'],
    'brand insight should normalize and localize profile video content focus'
  );
  assert.equal(normalized.brandInsight?.evidenceMaterials[0]?.assetId, 'asset-1', 'brand insight evidence should keep asset links');
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.play3sRate,
    0.44,
    'brand insight evidence should keep 3S rate'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.play5sRate,
    0.55,
    'brand insight evidence should keep 5S rate'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.interactionRate,
    0.66,
    'brand insight evidence should keep interaction rate'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.fusionDiagnosis?.score,
    84,
    'brand insight evidence should normalize the fusion score'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.fusionDiagnosis?.alignment,
    'reinforced',
    'brand insight evidence should normalize fusion alignment'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.fusionDiagnosis?.contentEvidenceTier,
    'structured_video_understanding',
    'brand insight evidence should normalize its content-evidence tier'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.fusionDiagnosis?.metricSignals[0]?.band,
    'high',
    'brand insight evidence should normalize metric benchmark bands'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.fusionDiagnosis?.contentSignals[0]?.level,
    'strong',
    'brand insight evidence should normalize content signal strength'
  );
  assert.doesNotMatch(
    normalized.brandInsight?.evidenceMaterials[0]?.fusionDiagnosis?.contentPattern ?? '',
    /放量/u,
    'fusion content patterns should sanitize content-assets scale decisions'
  );
  assert.equal(
    normalized.brandInsight?.evidenceMaterials[0]?.summary,
    '该素材可作为高表现内容表达样本继续观察，存在内容表达优化空间，建议小样本观察内容表现。千川',
    'industry evidence summaries should sanitize scale/redeploy decisions and localize source aliases'
  );
  assert.equal(normalized.brandInsight?.nextActions[0]?.actionType, 'rewrite_hook', 'brand insight actions should normalize action type');
  assert.equal(
    normalized.brandInsight?.nextActions[0]?.detail,
    '围绕 千川 与 云图 信号做 A/B。',
    'brand insight actions should localize source aliases before rendering'
  );
  assert.deepEqual(
    normalized.brandInsight?.gaps,
    ['fixture gap', 'missing 云图/千川'],
    'brand insight should keep and localize gap notices'
  );

  const row = normalized.rows[0];
  assert.ok(row, 'normalizer should keep the first row');
  assert.equal(row.brandName, '卡诗', 'row should keep brandName');
  assert.equal(row.assetId, 'asset-1', 'row should keep assetId for content-assets linking');
  assert.equal(row.rawExposureCount, '700-800万', 'row should keep raw exposure range text');
  assert.equal(row.exposureRange, '700-800万', 'row should expose raw exposure text as exposureRange');
  assert.equal(row.exposure, 123456, 'row should keep exposure');
  assert.equal(row.completionRate, 0.11, 'row should keep completionRate');
  assert.equal(row.ctr, 0.22, 'row should keep ctr');
  assert.equal(row.cvr, 0.33, 'row should keep cvr');
  assert.equal(row.play3sRate, 0.44, 'row should keep 3S播放率');
  assert.equal(row.play5sRate, 0.55, 'row should keep 5S播放率');
  assert.equal(row.interactionRate, 0.66, 'row should keep 互动率');
  assert.equal(row.pvr, 0.77, 'row should keep PVR');

  const goldenBrandRow = normalized.rows[1];
  assert.ok(goldenBrandRow, 'normalizer should keep the rank-6 OKCS visual fixture');
  assert.equal(
    resolveIndustryMaterialDisplayBrand(goldenBrandRow),
    'OKCS',
    'rank-6 visual evidence should render OKCS even when the title has no brand'
  );
  assert.equal(goldenBrandRow.brandResolutionSource, 'visual', 'row should keep visual brand provenance');
  assert.equal(goldenBrandRow.brandResolutionConfidence, 0.99, 'row should keep brand confidence');
  assert.equal(
    formatIndustryMaterialBrandResolutionTooltip(goldenBrandRow),
    '视频画面识别 · 99% · OKCS',
    'brand tooltip should expose the evidence angle, confidence, and concise evidence text'
  );

  const ambiguousBrandRow = normalizeIndustryMaterialResponse({
    data: {
      rows: [
        {
          brandName: null,
          brandResolutionStatus: 'ambiguous',
          brandResolutionSource: 'transcript',
          brandResolutionConfidence: 0.72,
          brandResolutionEvidence: {
            evidence: [{ source: 'audio', kind: 'partial_mention', text: '疑似 SPES', timeRange: '' }],
            alternatives: ['SPES'],
          },
        },
      ],
    },
  }).rows[0];
  assert.ok(ambiguousBrandRow, 'normalizer should keep ambiguous brand audit rows');
  assert.equal(
    resolveIndustryMaterialDisplayBrand(ambiguousBrandRow),
    '待复核',
    'ambiguous evidence should remain a review state instead of being guessed'
  );
  assert.equal(
    formatIndustryMaterialBrandResolutionTooltip(ambiguousBrandRow),
    '视频脚本识别 · 72% · 疑似 SPES',
    'ambiguous tooltip should preserve script provenance for operator review'
  );

  for (const forbidden of FORBIDDEN_API_ROW_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(row, forbidden),
      false,
      `normalizer should not copy governance/lifecycle key ${forbidden}`
    );
  }

  const camelBoundary = normalizeIndustryMaterialResponse({
    data: {
      selectedBrand: { key: '卡诗', label: '卡诗' },
      brandInsight: {
        brand: { key: '卡诗', label: '卡诗' },
        coverage: {},
        analysisBoundary: {
          mode: 'industry_visible_metrics_content_fusion',
          visibleSignals: ['completionRate', 'pvr'],
          unavailableSignals: ['productCardAcceptance'],
          conclusionPolicy: 'camel boundary policy',
        },
      },
    },
  }).brandInsight?.analysisBoundary;
  assert.deepEqual(
    camelBoundary?.visibleSignals,
    ['completionRate', 'pvr'],
    'brand insight should normalize camelCase visible signals'
  );
  assert.deepEqual(
    camelBoundary?.unavailableSignals,
    ['productCardAcceptance'],
    'brand insight should normalize camelCase unavailable signals'
  );
  assert.equal(
    camelBoundary?.conclusionPolicy,
    'camel boundary policy',
    'brand insight should normalize camelCase conclusion policy'
  );

  const camelProfile = normalizeIndustryMaterialResponse({
    data: {
      selectedBrand: { key: '卡诗', label: '卡诗' },
      brandInsight: {
        brand: { key: '卡诗', label: '卡诗' },
        tab: 'douyin_live_lead_short_video',
        coverage: {},
        analysisProfile: {
          key: 'live_lead_industry_visible',
          title: 'live qianchuan profile',
          primaryQuestion: 'live question',
          decisionLens: 'live lens',
          metricPriority: [{ key: 'play5sRate', label: '5S', role: 'live qianchuan role' }],
          videoContentFocus: ['live yuntu focus'],
          forbiddenConclusions: ['live roi unavailable'],
        },
      },
    },
  }).brandInsight?.analysisProfile;
  assert.equal(
    camelProfile?.title,
    'live 千川 profile',
    'brand insight should normalize camelCase analysis profile title'
  );
  assert.equal(
    camelProfile?.metricPriority[0]?.key,
    'play5sRate',
    'brand insight should normalize camelCase metricPriority'
  );
  assert.deepEqual(
    camelProfile?.videoContentFocus,
    ['live 云图 focus'],
    'brand insight should normalize camelCase videoContentFocus'
  );

  const missingFusion = normalizeIndustryMaterialResponse({
    data: {
      selectedBrand: { key: '卡诗', label: '卡诗' },
      brandInsight: {
        brand: { key: '卡诗', label: '卡诗' },
        coverage: {},
        evidenceMaterials: [{ title: 'legacy material' }],
      },
    },
  }).brandInsight;
  assert.equal(missingFusion?.fusionSummary, null, 'old backend responses should not fabricate a fusion summary');
  assert.equal(
    missingFusion?.evidenceMaterials[0]?.fusionDiagnosis,
    null,
    'old evidence payloads should not fabricate a fusion diagnosis'
  );
  assert.deepEqual(
    missingFusion?.contentThemeSummary,
    { eligibleMaterials: 0, topicCount: 0, expressionCount: 0 },
    'old payloads should default the content-theme summary to explicit zero coverage'
  );
  assert.deepEqual(
    missingFusion?.contentThemeTerms,
    [],
    'old payloads should not derive high-performance themes from legacy word-cloud terms'
  );

  const defaultBoundary = normalizeIndustryMaterialResponse({
    data: {
      selected_brand: { key: '卡诗', label: '卡诗' },
      brand_insight: {
        coverage: {},
      },
    },
  }).brandInsight?.analysisBoundary;
  assert.equal(
    defaultBoundary?.mode,
    'industry_visible_metrics_content_fusion',
    'brand insight should default missing analysis boundary mode'
  );
  assert.ok(
    defaultBoundary?.visibleSignals.includes('videoUnderstanding'),
    'default analysis boundary should include videoUnderstanding as a visible signal'
  );
  assert.ok(
    defaultBoundary?.unavailableSignals.includes('singleMaterialTransactionAttribution'),
    'default analysis boundary should include unavailable single-material attribution'
  );
  assert.match(
    defaultBoundary?.conclusionPolicy ?? '',
    /行业可见指标/u,
    'default analysis boundary should explain the industry-visible conclusion policy'
  );

  const defaultGoodsProfile = normalizeIndustryMaterialResponse({
    data: {
      selected_brand: { key: '卡诗', label: '卡诗' },
      brand_insight: {
        tab: 'douyin_goods_short_video',
        coverage: {},
      },
    },
  }).brandInsight?.analysisProfile;
  assert.equal(
    defaultGoodsProfile?.key,
    'goods_cart_industry_visible',
    'missing analysis profile should default to the goods industry-visible profile for goods tab'
  );
  assert.ok(
    defaultGoodsProfile?.metricPriority.some((metric) => metric.key === 'cvr'),
    'default goods profile should keep CVR in the metric priority'
  );
  assert.deepEqual(
    defaultGoodsProfile?.metricPriority.map((metric) => metric.key),
    ['ctr', 'cvr', 'pvr', 'completionRate', 'interactionRate', 'play5sRate'],
    'default goods profile should keep the full goods metric priority order'
  );

  const defaultGoodsProfileFromRootTab = normalizeIndustryMaterialResponse({
    data: {
      tab: 'douyin_goods_short_video',
      selected_brand: { key: '卡诗', label: '卡诗' },
      brand_insight: {
        coverage: {},
      },
    },
  }).brandInsight?.analysisProfile;
  assert.equal(
    defaultGoodsProfileFromRootTab?.key,
    'goods_cart_industry_visible',
    'missing brand-insight tab should inherit the root goods tab for default profile selection'
  );

  const defaultLiveProfile = normalizeIndustryMaterialResponse({
    data: {
      selected_brand: { key: '卡诗', label: '卡诗' },
      brand_insight: {
        tab: 'douyin_live_lead_short_video',
        coverage: {},
      },
    },
  }).brandInsight?.analysisProfile;
  assert.equal(
    defaultLiveProfile?.key,
    'live_lead_industry_visible',
    'missing analysis profile should default to the live-lead industry-visible profile for live tab'
  );
  assert.ok(
    defaultLiveProfile?.metricPriority.some((metric) => metric.key === 'play3sRate'),
    'default live profile should keep early retention in the metric priority'
  );
  assert.deepEqual(
    defaultLiveProfile?.metricPriority.map((metric) => metric.key),
    ['play3sRate', 'play5sRate', 'completionRate', 'pvr', 'interactionRate', 'ctr'],
    'default live profile should keep the full live metric priority order'
  );
}

async function main() {
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(PATHS).map(async ([key, relativePath]) => [key, await readSource(relativePath)])
    )
  );
  sources.backendModule = `${sources.backend}\n${sources.backendQuerySqlModule}`;
  sources.backend = `${sources.backendModule}\n${sources.backendThemeSourceSql}\n${sources.backendFusionSql}\n${sources.backendContentThemeSql}\n${sources.backendStorageReadinessSql}`;
  sources.clientModule = sources.client;
  sources.client = `${sources.client}\n${sources.clientTopBar}\n${sources.clientContent}`;

  assertStaticContracts(sources);

  const {
    normalizeIndustryMaterialBrandAiBackfillResponse,
    normalizeIndustryMaterialMonth,
    normalizeIndustryMaterialResponse,
    formatIndustryMaterialBrandResolutionTooltip,
    resolveIndustryMaterialDisplayBrand,
    resolveBrandAiCoverageState,
    resolveBrandAiExecutiveSummary,
  } = await importIndustryMaterialApi();
  const {
    isMediumSellingPointTag,
    isWideSellingPointTag,
    resolveTagGroupCell,
  } = await importIndustryMaterialTagLayout();

  assert.equal(normalizeIndustryMaterialMonth('2026-05'), '2026-05', 'YYYY-MM month should pass');
  assert.equal(normalizeIndustryMaterialMonth('2026-5'), null, 'non-YYYY-MM month should be rejected');
  assertNormalizedBackfillContracts(normalizeIndustryMaterialBrandAiBackfillResponse);
  assertBrandAiPresentationContracts({
    resolveBrandAiCoverageState,
    resolveBrandAiExecutiveSummary,
  });
  assertNormalizedResponseContracts(
    normalizeIndustryMaterialResponse,
    resolveIndustryMaterialDisplayBrand,
    formatIndustryMaterialBrandResolutionTooltip
  );
  assertTagLayoutContracts({
    isMediumSellingPointTag,
    isWideSellingPointTag,
    resolveTagGroupCell,
  });

  createCheckGuard(GUARD_NAME).reportOk(
    'route, nav, effective-brand provenance, API, brand summary, scored content themes, disclosure, asset link, tags, 8-metric, fusion, and structured readiness contracts passed.'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
