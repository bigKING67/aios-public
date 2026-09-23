#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

async function importBundledTs(relativePath) {
  const result = await build({
    entryPoints: [path.join(REPO_ROOT, relativePath)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    logLevel: 'silent',
  });
  const source = result.outputFiles?.[0]?.text;
  assert.ok(source, `expected esbuild to bundle ${relativePath}`);
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const handlersSource = await readSource('backend-rust/src/marketing/content_assets/handlers.rs');
const videoLinkMaterialSuggestionSource = await readSource(
  'backend-rust/src/marketing/content_assets/video_link_material_suggestion.rs'
);
const performanceDailySource = await readSource('backend-rust/src/marketing/content_assets/performance_daily.rs');
const detailTypesSource = await readSource('backend-rust/src/marketing/content_assets/detail_types.rs');
const performanceSnapshotSource = await readSource('backend-rust/src/marketing/content_assets/performance_snapshot.rs');
const frontendTypesSource = await readSource('apps/web-vite/src/app/marketing/content-assets/_lib/content-assets-types.ts');
const frontendVideoLinkPreviewSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_lib/content-assets-video-link-preview.ts'
);
const frontendImportModalSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-import-modal.tsx'
);
const frontendImportFormFieldsSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-import-form-fields.tsx'
);
const frontendAnalysisResultSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_lib/content-assets-analysis-result.ts'
);
const frontendSectionsSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-inspector-ai-sections.tsx'
);
const frontendRawMetricGroupsSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-inspector-raw-metric-groups.tsx'
);
const dataopsStreamsSource = await readSource('apps/web-vite/src/config/dataops-hub-streams.ts');
const dataopsPipelinesSource = await readSource('apps/web-vite/src/config/dataops-hub-dashboard-pipelines.ts');
const dataopsMappingSource = await readSource('docs/DATAOPS_HUB_ETL_MAPPING.md');
const packageSource = await readSource('package.json');
const arkResponsesSource = await readSource(
  'etl/groland_postgres/scripts/marketing_content_assets/ark_responses.py'
);
const analysisProcessorSource = await readSource(
  'etl/groland_postgres/scripts/marketing_content_assets/analysis_processor.py'
);
const videoUnderstandingCacheSource = await readSource(
  'etl/groland_postgres/scripts/marketing_content_assets/video_understanding_cache.py'
);
const liveArkSmokeSource = await readSource(
  'scripts/checks/marketing/content-assets-qianchuan-live-ark-smoke.sh'
);
const migrationSource = await readSource(
  'etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql'
);

assert.match(
  handlersSource,
  /"\/assets\/\{asset_id\}\/performance\/daily"/u,
  'content-assets router should expose the lightweight material performance daily endpoint'
);
assert.match(
  handlersSource,
  /get_asset_performance_daily/u,
  'content-assets handler should wire performance/daily through an explicit handler'
);
assert.match(
  performanceDailySource,
  /dwd\.marketing_content_qianchuan_material_performance_di/u,
  'performance/daily should read the canonical qianchuan material/date DWD table'
);
assert.match(
  performanceDailySource,
  /material_id.*objective.*start_date.*end_date/su,
  'performance/daily should support materialId/objective/startDate/endDate filters'
);
assert.match(
  performanceDailySource,
  /product_all_domain_shortvideo[\s\S]*live_all_domain_shortvideo/u,
  'performance/daily should validate the two qianchuan all-domain objectives'
);
assert.match(
  performanceDailySource,
  /DEFAULT_DAILY_WINDOW_DAYS/u,
  'performance/daily should avoid unbounded default result windows'
);
for (const testName of [
  'normalize_performance_daily_query_trims_material_and_keeps_valid_objective',
  'normalize_performance_daily_query_rejects_unknown_objective',
  'normalize_performance_daily_query_caps_explicit_window',
]) {
  assert.match(
    performanceDailySource,
    new RegExp(testName, 'u'),
    `performance/daily should keep executable no-DB backend coverage for ${testName}`
  );
}
assert.match(
  frontendSectionsSource,
  /PerformanceDailyTrendPanel[\s\S]*fetchContentAssetPerformanceDaily[\s\S]*查看日趋势/u,
  'frontend should expose a click-to-load material daily trend panel'
);
assert.match(
  frontendSectionsSource,
  /materialId:\s*material\.materialId[\s\S]*objective/u,
  'frontend daily trend query should include materialId and objective when objective is known'
);
assert.match(
  frontendSectionsSource,
  /enabled:\s*expanded\s*&&\s*Boolean\(assetId && material\.materialId\)/u,
  'frontend daily trend query should stay lazy until the material card is expanded'
);
assert.match(
  frontendSectionsSource,
  /暂无日趋势行[\s\S]*DWD 回填/u,
  'frontend daily trend panel should show an explicit empty state for missing DWD rows'
);
assert.match(
  frontendSectionsSource,
  /boost_\*[\s\S]*不并入 overall_\*/u,
  'frontend daily trend copy should preserve the boost non-addition boundary'
);
assert.match(
  frontendRawMetricGroupsSource,
  /千川全域素材表现完整字段组/u,
  'frontend should expose the complete qianchuan raw/latest metrics field-group region'
);
for (const groupTitle of [
  '流量获取',
  '点击/播放',
  '成交转化',
  '净成交/退款',
  '结算',
  '追投调控',
  '直播间承接',
  '源文件/入库信息',
]) {
  assert.match(
    frontendRawMetricGroupsSource,
    new RegExp(`title:\\s*'${groupTitle}'`, 'u'),
    `frontend raw/latest metrics field groups should include ${groupTitle}`
  );
}
for (const helperMarker of [
  'RAW_METRIC_GROUP_ITEM_LIMIT',
  'buildRawMetricGroups',
  'resolveRawMetricItem',
  'boost_* / legacy_boost_* 只作追投调控解释项',
]) {
  assert.match(
    frontendRawMetricGroupsSource,
    new RegExp(helperMarker.replaceAll('*', '\\*'), 'u'),
    `frontend raw/latest metrics groups should keep helper/contract marker ${helperMarker}`
  );
}

for (const [name, source] of [
  ['Rust live acceptance type', detailTypesSource],
  ['frontend live acceptance type', frontendTypesSource],
]) {
  assert.match(
    source,
    /attributionLevel/u,
    `${name} should expose the live-room attribution level explicitly`
  );
}
assert.match(
  performanceSnapshotSource,
  /account_date_environment/u,
  'backend snapshot should label live acceptance as account/date environment context'
);
assert.match(
  frontendSectionsSource,
  /account_date_environment|账号日期承接环境/u,
  'frontend should surface that live acceptance is account/date context, not material attribution'
);
assert.match(
  frontendSectionsSource,
  /直播承接归因边界[\s\S]*liveAcceptanceAttribution/u,
  'frontend AI diagnosis should display v2.1 live acceptance attribution boundaries'
);
assert.match(
  frontendAnalysisResultSource,
  /primary_problem_stage[\s\S]*final_root_cause_owner/u,
  'frontend analysis parser should understand v2.1 primary stage and final owner aliases'
);

assert.match(
  migrationSource,
  /PRIMARY KEY \(material_id, stat_date\)/u,
  'DWD grain should be qianchuan material_id + stat_date'
);
assert.match(
  migrationSource,
  /marketing_content_asset_qianchuan_summary[\s\S]*asset_id UUID PRIMARY KEY/u,
  'asset-level qianchuan DWS summary should exist at asset_id grain'
);
assert.match(
  migrationSource,
  /marketing_content_asset_qianchuan_summary[\s\S]*material_count[\s\S]*objective_breakdown[\s\S]*material_ids/u,
  'asset-level qianchuan DWS summary should keep lightweight list/detail overview fields'
);
assert.match(
  migrationSource,
  /dws\.marketing_content_asset_qianchuan_summary[\s\S]*ON CONFLICT \(asset_id\) DO UPDATE/u,
  'asset-level qianchuan DWS summary refresh should be idempotent at asset_id grain'
);
assert.match(
  packageSource,
  /verify:marketing:content-assets-qianchuan-live-ark/u,
  'package scripts should expose the explicit opt-in live Ark/Doubao video smoke gate'
);
assert.match(
  liveArkSmokeSource,
  /AIOS_QC_ALLOW_LIVE_ARK[\s\S]*CONTENT_ASSET_LIVE_ARK_SMOKE_VIDEO_URL[\s\S]*analyze_video/u,
  'live Ark/Doubao smoke must require explicit opt-in and a selected video URL before calling input_video'
);
assert.match(
  liveArkSmokeSource,
  /analysis_schema_version[\s\S]*qianchuan_all_domain[\s\S]*live_acceptance_attribution/u,
  'live Ark/Doubao smoke should validate v2.1 schema, qianchuan delivery mode, and live attribution boundary'
);

assert.match(
  handlersSource,
  /post_video_link_preview[\s\S]*query_qianchuan_material_suggestion_for_video[\s\S]*qianchuan_material_suggestion/u,
  'video-link preview should enrich resolved Douyin video IDs with Qianchuan material suggestions'
);
assert.match(
  videoLinkMaterialSuggestionSource,
  /ads\.marketing_content_platform_videos[\s\S]*ads\.marketing_content_ad_materials[\s\S]*ads\.douyin_shortvideo_detail/u,
  'Qianchuan material suggestion should combine active content-center identity and creator short-video ADS facts'
);
assert.match(
  videoLinkMaterialSuggestionSource,
  /status:\s*"unique"[\s\S]*requires_confirmation:\s*true/u,
  'unique Qianchuan material suggestions should still require operator confirmation'
);
assert.match(
  videoLinkMaterialSuggestionSource,
  /status:\s*"conflict"[\s\S]*recommended_external_item_id[\s\S]*requires_confirmation:\s*true/u,
  'conflicting Qianchuan material suggestions should be visible and require confirmation'
);
assert.match(
  videoLinkMaterialSuggestionSource,
  /status:\s*"ambiguous"[\s\S]*recommended_external_item_id:\s*None[\s\S]*requires_confirmation:\s*true/u,
  'ambiguous Qianchuan material suggestions should not auto-fill a material ID'
);
assert.match(
  frontendTypesSource,
  /qianchuanMaterialSuggestion\?:\s*ContentAssetQianchuanMaterialSuggestion/u,
  'frontend video-link preview candidate type should carry Qianchuan material suggestion metadata'
);
assert.match(
  frontendVideoLinkPreviewSource,
  /suggestion\?\.status !== 'unique'[\s\S]*return null/u,
  'frontend should only auto-prefill recommended material ID for unique suggestions'
);
assert.match(
  frontendVideoLinkPreviewSource,
  /materialIds\.size > 0[\s\S]*!materialIds\.has\(recommendedExternalItemId\)[\s\S]*return null/u,
  'frontend should reject recommended material IDs that are not present in suggestion materialIds'
);
assert.match(
  frontendVideoLinkPreviewSource,
  /系统不会自动覆盖[\s\S]*请业务核对后再修改/u,
  'frontend suggestion notices should tell operators that uncertain/conflicting material IDs are not silently overwritten'
);
assert.match(
  frontendImportModalSource,
  /confirmQianchuanMaterialReviewBeforeSubmit[\s\S]*Modal\.confirm[\s\S]*已核对，继续保存/u,
  'upload modal should require a second confirmation before saving or intentionally leaving reviewed Qianchuan material IDs'
);
assert.match(
  frontendImportModalSource,
  /当前未保存千川素材 ID[\s\S]*核对是否需要手动填写或修改千川素材 ID/u,
  'upload modal should confirm uncertain Qianchuan material suggestions even when no material ID is saved'
);
assert.doesNotMatch(
  frontendImportModalSource,
  /!review\?\.requiresConfirmation\s*\|\|\s*!externalItemId/u,
  'upload modal should not skip second confirmation just because the material ID field is blank'
);
assert.match(
  frontendImportModalSource,
  /previewVideoLinkBeforeSubmit\(rawValues\)[\s\S]*confirmQianchuanMaterialReviewBeforeSubmit/u,
  'local video upload path should preview video links and confirm material-ID review before submit'
);
assert.match(
  frontendImportModalSource,
  /resolveVideoLinkImportSelection\(rawValues\)[\s\S]*confirmQianchuanMaterialReviewBeforeSubmit/u,
  'remote video-link import path should confirm material-ID review before submit'
);
assert.match(
  frontendImportModalSource,
  /candidate\.externalItemId && \(!currentExternalItemId \|\| currentExternalItemId === candidate\.externalItemId\)[\s\S]*suggestedExternalItemId && !currentExternalItemId/u,
  'upload modal should auto-fill material IDs only when the field is empty or already matches'
);
assert.match(
  frontendImportFormFieldsSource,
  /qianchuanMaterialReviewNotice[\s\S]*type="warning"[\s\S]*resolveQianchuanMaterialCandidateReviewNotice/u,
  'upload form should show visible review warnings for auto-detected or suggested Qianchuan material IDs'
);
assert.match(
  frontendImportFormFieldsSource,
  /name="creatorDouyinId"[\s\S]*label="达人抖音号"/u,
  'upload form should register creator Douyin id so dashboard prefill survives validation and can be reviewed'
);
for (const columnName of [
  'delivery_mode',
  'objective',
  'source_table',
  'material_id',
  'asset_id',
  'overall_impression_count',
  'overall_click_count',
  'overall_click_rate',
  'overall_conversion_rate',
  'overall_cost',
  'overall_order_count',
  'overall_gmv',
  'overall_pay_roi',
  'net_gmv_roi',
  'net_gmv',
  'net_order_count',
  'net_gmv_settlement_rate',
  'boost_cost',
  'boost_order_count',
  'boost_gmv',
  'boost_pay_roi',
  'boost_click_rate',
  'raw_metrics',
  'diagnosis_json',
  'data_quality_status',
  'sample_quality_status',
]) {
  assert.match(
    migrationSource,
    new RegExp(`\\b${columnName}\\b`, 'u'),
    `DWD material performance contract should include ${columnName}`
  );
}
assert.match(
  migrationSource,
  /douyin_qianchuan_shortvideo_raw[\s\S]*product_all_domain_shortvideo/u,
  'refresh SQL should map qianchuan shortvideo raw rows to product all-domain objective'
);
assert.match(
  migrationSource,
  /douyin_qianchuan_live_video_raw[\s\S]*live_all_domain_shortvideo/u,
  'refresh SQL should map qianchuan live video raw rows to live all-domain objective'
);
assert.match(
  migrationSource,
  /boost_[\s\S]*raw_metrics[\s\S]*diagnosis_json/u,
  'migration should keep boost metrics as separate explanatory fields through diagnosis payloads'
);
assert.match(
  migrationSource,
  /marketing_content_qianchuan_live_room_acceptance_di[\s\S]*PRIMARY KEY \(stat_date, douyin_account_display_id\)/u,
  'live acceptance DWS should stay at account/date grain'
);
assert.match(
  migrationSource,
  /douyin_trade_sale_live_raw[\s\S]*marketing_content_qianchuan_live_room_acceptance_di/u,
  'trade sale live raw should only feed live-room acceptance context'
);
assert.doesNotMatch(
  migrationSource,
  /overall_(?:click_count|order_count|gmv|cost)\s*[+,][\s\S]{0,80}boost_/u,
  'overall metrics must not be computed by adding boost metrics'
);
assert.doesNotMatch(
  migrationSource,
  /boost_[\w]*\s*[+,][\s\S]{0,80}overall_(?:click_count|order_count|gmv|cost)/u,
  'boost metrics must remain explanatory and separate from overall metrics'
);
assert.match(
  arkResponsesSource,
  /analysis_schema_version[\s\S]*enum": \["2\.1"\]/u,
  'Ark response schema should enforce v2.1 analysis schema'
);
assert.match(
  arkResponsesSource,
  /data_content_fusion[\s\S]*data_only[\s\S]*content_only[\s\S]*insufficient_data/u,
  'Ark response schema should expose fusion and degraded diagnosis modes'
);
for (const marker of [
  'first_3s_assessment',
  'cta_assessment',
  'product_cart_fit',
  'live_room_fit',
  'risk_assessment',
  'product_cart',
  'live_room',
  'contradictions',
  'final_root_cause_owner',
]) {
  assert.match(
    arkResponsesSource,
    new RegExp(marker, 'u'),
    `Ark v2.1 schema/prompt should require structured video+fusion field ${marker}`
  );
}
assert.match(
  arkResponsesSource,
  /缺 performanceSnapshot \/ performanceDiagnosis[\s\S]*content_only/u,
  'Ark prompt should explicitly degrade when performance context is missing'
);
assert.match(
  arkResponsesSource,
  /视频画面、口播或 transcript 不足[\s\S]*data_only/u,
  'Ark prompt should explicitly degrade when video/content context is missing'
);
assert.match(
  analysisProcessorSource,
  /performanceSnapshot[\s\S]*performanceDiagnosis/u,
  'analysis processor should pass performance snapshot and deterministic diagnosis into AI context'
);
assert.match(
  analysisProcessorSource,
  /constraints[\s\S]*boost_metrics_policy[\s\S]*live_acceptance_policy[\s\S]*product_card_acceptance_policy/u,
  'analysis processor should pass explicit qianchuan fusion constraints into AI context'
);
assert.match(
  analysisProcessorSource,
  /productCardAcceptance[\s\S]*missing_card_acceptance[\s\S]*ods\.douyin_trade_sale_card_detail_raw/u,
  'analysis processor should pass degraded product-card acceptance context into AI context'
);
assert.match(
  analysisProcessorSource,
  /PRODUCT_CARD_ACCEPTANCE_BRIDGE_SOURCE[\s\S]*ads\.douyin_shortvideo_detail[\s\S]*product_day_aligned/u,
  'analysis processor should build product-card acceptance through the short-video detail bridge when aligned'
);
assert.match(
  analysisProcessorSource,
  /douyin_qianchuan_shortvideo_raw[\s\S]*trusted material_id -> product_id[\s\S]*source_level1/u,
  'analysis processor should require material_id -> product_id bridge before product-card acceptance linkage'
);
assert.match(
  arkResponsesSource,
  /productCardAcceptance[\s\S]*missing_card_acceptance[\s\S]*product_day_aligned\/product_range_aligned[\s\S]*bridge_source[\s\S]*不能输出商品卡点击、成交或 GMV 对单 material_id/u,
  'Ark prompt should prevent exact product-card attribution even when a bridge-backed context exists'
);
assert.match(
  arkResponsesSource,
  /product_card_acceptance_attribution[\s\S]*bridge_source[\s\S]*source_grain[\s\S]*required_bridge/u,
  'Ark v2.1 schema should expose product-card bridge/source grain attribution boundary'
);
assert.match(
  analysisProcessorSource,
  /from \.video_understanding_cache import[\s\S]*persist_video_understanding_cache as _persist_video_understanding_cache[\s\S]*_persist_video_understanding_cache\(/u,
  'analysis processor should delegate video-understanding cache persistence to the cache owner'
);
assert.match(
  videoUnderstandingCacheSource,
  /def persist_video_understanding_cache\([\s\S]*INSERT INTO ads\.marketing_content_asset_video_understanding_jobs \([\s\S]*media_hash[\s\S]*analysis_schema_version[\s\S]*input_snapshot_hash[\s\S]*cache_key/u,
  'video-understanding cache owner should persist job identity fields'
);
assert.match(
  videoUnderstandingCacheSource,
  /INSERT INTO ads\.marketing_content_asset_video_understanding_results \([\s\S]*media_hash[\s\S]*analysis_schema_version[\s\S]*input_snapshot_hash[\s\S]*cache_key/u,
  'video-understanding cache owner should persist result identity fields'
);

const analysisResultModule = await importBundledTs(
  'apps/web-vite/src/app/marketing/content-assets/_lib/content-assets-analysis-result.ts'
);
const v21AnalysisFixture = {
  analysis_schema_version: '2.1',
  diagnosis_mode: 'data_content_fusion',
  primary_decision: 'recut',
  current_ai_analysis: {
    content_understanding: {
      what_it_says: '视频用头皮出油和扁塌开场，转入控油洗护的解决方案。',
      content_structure: '前三秒抛出油头痛点，中段解释成分和使用感，结尾引导看商品卡或直播间权益。',
      core_selling_points: '核心卖点是控油、蓬松、低刺激和即时可见的头皮清爽感。',
      visual_rhythm: '画面以近景头皮和洗护前后对比为主，节奏偏快，适合短视频小屏快速理解。',
      speech_and_emotion: '口播是问题-解决的理性说服，情绪基调偏焦虑缓解和专业可信。',
      user_comprehension_barrier: '用户需要快速理解适用人群、使用频次和是否会刺激头皮。',
      reusable_content_assets: '可复用头皮近景、蓬松前后对比、成分解释和直播间权益口播。',
    },
    final_judgment: '点击意图可用，但承接弱，建议重剪再测。',
    core_reasons: ['前三秒钩子能解释点击', '直播承接环境偏弱'],
    problem_stages: ['live_room_acceptance_weak'],
    next_actions: [
      {
        title: '重剪直播间承接版本',
        detail: '保留前三秒钩子，补直播间福利和下单路径。',
        owner: 'creative',
        priority: 'high',
        metric_target: 'live_room_click_rate',
        expected_metric_lift: '提升直播间商品点击率',
        action_type: 'check_live_room_script',
        reason: '素材点击不弱但承接弱。',
        evidence_refs: ['metric:live_acceptance', 'content:hook'],
      },
    ],
  },
  diagnosis_boundary: {
    mode: 'data_content_fusion',
    message: '已结合千川素材表现和视频内容判断。',
    data_evidence_summary: '千川素材表现来自 DWD/DWS 聚合，直播承接为账号日期级环境。',
    data_mapping_anchor: 'performance-summary',
  },
  platform_fit: {
    qianchuan: '可继续小预算验证',
    product_cart: '商品卡承接明确',
    live_room: '直播间利益点需要补强',
  },
  fusion_diagnosis: {
    one_sentence_summary: '内容钩子能解释进房，但承接弱限制成交。',
    final_verdict: 'weak',
    good_points: ['前三秒能清楚给出利益点'],
    bad_points: [{ label: '直播承接', value: '弱', judgment: 'weak' }],
    primary_problem_stage: 'live_room_acceptance_weak',
    final_root_cause_owner: 'live_room',
    why: 'CTR 和进房意图可用，但账号日期承接弱，需先排查直播间脚本。',
    metric_evidence: [
      {
        key: 'ctr',
        metric: 'ctr',
        label: '点击率',
        value: 0.018,
        benchmark: '>= 1.5%',
        judgment: 'good',
      },
    ],
    content_evidence: [
      {
        metric: 'hook',
        label: '前三秒钩子',
        value: '强',
        benchmark: '3 秒内讲清收益',
        judgment: 'good',
      },
    ],
    evidence_ledger: [
      {
        id: 'fusion:root_cause',
        metric: 'root_cause',
        value: '承接弱',
        benchmark: '同时解释数据与内容',
        judgment: 'weak',
        source: 'performanceDiagnosis + input_video',
        meaning: '素材引流可以，成交承接不是单素材精确归因。',
      },
    ],
    live_acceptance_attribution: {
      level: 'account_date_environment',
      confidence: 'medium',
      source: 'dws.marketing_content_qianchuan_live_room_acceptance_di',
      limitation: '直播间成交数据为账号/日期级承接环境，不代表单 material_id 精确成交贡献',
    },
    next_actions: [
      {
        title: '对齐直播间利益点',
        detail: '首屏口播补直播间权益和价格锚点。',
        owner: 'live_room',
        priority: 'high',
        metric_target: 'live_room_click_rate',
        expected_metric_lift: '提升直播间点击率',
        action_type: 'align_video_to_live_room_offer',
        reason: '数据强在进房，弱在承接。',
        evidence_refs: ['metric:ctr', 'content:hook'],
      },
    ],
  },
  performance_diagnosis: {
    evidence_ledger: [
      {
        id: 'metric:ctr',
        metric: 'ctr',
        value: '1.8%',
        benchmark: '>= 1.5%',
        judgment: 'good',
        source: 'dwd.marketing_content_qianchuan_material_performance_di',
        meaning: '点击意图不弱。',
      },
    ],
  },
  content_diagnosis: {
    evidence_ledger: [
      {
        id: 'content:hook',
        metric: 'hook',
        value: '强',
        benchmark: '3 秒内讲清收益',
        judgment: 'good',
        source: 'input_video',
        meaning: '内容钩子能支撑点击。',
      },
    ],
  },
  evidence_ledger: [
    {
      id: 'metric:live_acceptance',
      metric: 'live_acceptance',
      value: '弱',
      benchmark: '账号日期级承接环境',
      judgment: 'weak',
      source: 'dws.marketing_content_qianchuan_live_room_acceptance_di',
      meaning: '只能解释直播间环境，不能归因到单素材成交。',
    },
  ],
  scores: {
    data_performance_score: 72,
    content_quality_score: 81,
    hook_score: 86,
    selling_point_score: 76,
    conversion_support_score: 62,
    live_entry_score: 78,
    live_acceptance_score: 45,
    risk_score: 70,
    fusion_overall_score: 64,
    confidence: 0.74,
  },
  next_actions: [
    {
      title: '重写直播间承接口播',
      detail: '补进房后的福利和购买路径。',
      owner: 'creative',
      priority: 'high',
      metric_target: 'live_room_click_rate',
      expected_metric_lift: '提升直播间商品点击率',
      action_type: 'check_live_room_script',
      reason: '素材点击不弱但承接弱。',
      evidence_refs: ['metric:live_acceptance', 'content:hook'],
    },
  ],
};

const fusionDiagnosis = analysisResultModule.resolveFusionDiagnosis(v21AnalysisFixture);
assert.ok(fusionDiagnosis, 'frontend should resolve v2.1 fusion diagnosis fixtures');
assert.equal(fusionDiagnosis.diagnosisMode, 'data_content_fusion');
assert.equal(fusionDiagnosis.problemStage, 'live_room_acceptance_weak');
assert.equal(fusionDiagnosis.rootCauseOwner, 'live_room');
assert.deepEqual(fusionDiagnosis.goodPoints, ['前三秒能清楚给出利益点']);
assert.ok(
  fusionDiagnosis.badPoints.some((item) => item.includes('直播承接')),
  'fusion diagnosis should preserve v2.1 bad_points'
);
assert.ok(
  fusionDiagnosis.metricEvidence.some((item) => item.includes('点击率') && item.includes('1.8%')),
  'fusion diagnosis should format v2.1 metric_evidence'
);
assert.ok(
  fusionDiagnosis.contentEvidence.some((item) => item.includes('前三秒钩子') && item.includes('强')),
  'fusion diagnosis should format v2.1 content_evidence'
);
assert.equal(fusionDiagnosis.liveAcceptanceAttribution?.level, 'account_date_environment');

const contentUnderstanding = analysisResultModule.resolveContentUnderstanding(v21AnalysisFixture);
assert.equal(
  contentUnderstanding.source,
  'structured',
  'frontend should prefer v2.1 structured content_understanding'
);
for (const understandingKey of [
  'what_it_says',
  'content_structure',
  'core_selling_points',
  'visual_rhythm',
  'speech_and_emotion',
  'user_comprehension_barrier',
  'reusable_content_assets',
]) {
  assert.ok(
    contentUnderstanding.items.some((item) => item.key === understandingKey && item.text),
    `frontend should resolve v2.1 content_understanding.${understandingKey}`
  );
}

const currentAiAnalysis = analysisResultModule.resolveCurrentAiAnalysis(v21AnalysisFixture, {
  fusionDiagnosis,
  diagnosisMode: 'data_content_fusion',
});
assert.equal(
  currentAiAnalysis.primaryDecision.key,
  'recut',
  'frontend should resolve v2.1 primary_decision'
);
assert.equal(
  currentAiAnalysis.diagnosisBoundary.mode,
  'data_content_fusion',
  'frontend should resolve v2.1 diagnosis_boundary mode'
);
assert.equal(
  currentAiAnalysis.diagnosisBoundary.dataMappingAnchor,
  'performance-summary',
  'frontend should preserve v2.1 diagnosis_boundary data mapping anchor'
);
assert.match(
  fusionDiagnosis.liveAcceptanceAttribution?.limitation || '',
  /不代表单 material_id 精确成交贡献/u,
  'fusion diagnosis should preserve live attribution limitation copy'
);

const platformFitItems = analysisResultModule.resolveAnalysisPlatformFitItems(v21AnalysisFixture);
assert.ok(
  platformFitItems.some((item) => item.key === 'product_cart') &&
    platformFitItems.some((item) => item.key === 'live_room'),
  'frontend should render v2.1 product_cart/live_room platform-fit fields'
);

const scoreKeys = analysisResultModule.resolveAnalysisScores(v21AnalysisFixture).map((item) => item.key);
for (const scoreKey of [
  'data_performance_score',
  'content_quality_score',
  'hook_score',
  'selling_point_score',
  'conversion_support_score',
  'live_entry_score',
  'live_acceptance_score',
  'risk_score',
  'fusion_overall_score',
  'confidence',
]) {
  assert.ok(scoreKeys.includes(scoreKey), `frontend should map v2.1 score key ${scoreKey}`);
}

const nextActions = analysisResultModule.resolveAnalysisNextActions(v21AnalysisFixture);
assert.ok(
  nextActions.some((item) =>
    item.actionType === 'check_live_room_script' &&
    item.evidenceRefs.includes('metric:live_acceptance') &&
    item.evidenceRefs.includes('content:hook')
  ),
  'frontend should preserve v2.1 next action evidence_refs'
);

const evidenceLedger = analysisResultModule.resolveAnalysisEvidenceLedger(v21AnalysisFixture);
for (const evidenceId of [
  'metric:live_acceptance',
  'metric:ctr',
  'content:hook',
  'fusion:root_cause',
]) {
  assert.ok(
    evidenceLedger.some((item) => item.id === evidenceId),
    `frontend evidence ledger should include top-level and nested evidence ${evidenceId}`
  );
}

const degradedDiagnosis = analysisResultModule.resolveFusionDiagnosis({
  diagnosis_mode: 'content_only',
  fusion_diagnosis: {
    why: '只有视频内容，不能评价 ROI 或放量。',
  },
});
assert.equal(
  degradedDiagnosis?.diagnosisMode,
  'content_only',
  'frontend should preserve degraded diagnosis_mode on v2.1 diagnosis blocks'
);

for (const [mode, why] of [
  ['data_only', '只有千川投放数据，不能评价脚本、画面或前三秒优劣。'],
  ['content_only', '只有视频内容，不能评价 ROI 或放量。'],
  ['insufficient_data', '投放样本和视频证据都不足，只能继续观察。'],
]) {
  const diagnosis = analysisResultModule.resolveFusionDiagnosis({
    diagnosis_mode: mode,
    fusion_diagnosis: { why },
  });
  assert.equal(
    diagnosis?.diagnosisMode,
    mode,
    `frontend should preserve degraded diagnosis_mode=${mode}`
  );
  assert.equal(
    diagnosis?.reasoning,
    why,
    `frontend should preserve degraded reasoning copy for diagnosis_mode=${mode}`
  );
}

for (const degradedCopy of [
  '缺内容理解，仅按千川表现数据复盘。',
  '缺投放样本，仅按视频内容、画面、脚本、口播和节奏复盘。',
  '数据和内容证据都不足，仅展示可确认线索。',
]) {
  assert.match(
    frontendSectionsSource,
    new RegExp(degradedCopy, 'u'),
    `frontend should render explicit degraded-mode copy: ${degradedCopy}`
  );
}
assert.match(
  frontendSectionsSource,
  /当前 AI 分析未给出明确动作[\s\S]*补齐数据映射或重跑 AI 分析/u,
  'frontend current AI analysis should keep a constant next-action empty state'
);

for (const streamId of [
  'stream_marketing_content_qianchuan_all_domain_material_performance',
  'stream_marketing_content_asset_video_understanding',
  'stream_marketing_content_asset_fusion_diagnostics',
]) {
  assert.match(dataopsStreamsSource, new RegExp(streamId, 'u'), `DataOps streams should include ${streamId}`);
  assert.match(dataopsMappingSource, new RegExp(streamId, 'u'), `DataOps mapping doc should include ${streamId}`);
}
assert.match(
  dataopsPipelinesSource,
  /dws_marketing_content_qianchuan_all_domain_material_performance/u,
  'DataOps pipeline config should include qianchuan all-domain material performance refresh'
);
assert.match(
  dataopsPipelinesSource,
  /ads_marketing_content_asset_fusion_diagnostics/u,
  'DataOps pipeline config should include content asset fusion diagnostics'
);

console.log('[content-assets-qianchuan-contract] ok');
