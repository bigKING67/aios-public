#!/usr/bin/env node

import path from 'node:path';
import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredPackageJson,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditSpecialReportChartGallery,
} from '../../lib/reports/special-report-chart-gallery-smoke.mjs';
import {
  auditSpecialReportReaderFatigue,
} from '../../lib/reports/special-report-reader-fatigue-smoke.mjs';
import { auditGsvSnapshotBoundary } from '../../lib/reports/gsv-snapshot-smoke.mjs';
import {
  parseGsvSnapshotData,
  readGsvSnapshotTmallMonthlyTopProductRows,
  readGsvSnapshotTocItems,
} from '../../lib/reports/gsv-snapshot-data-smoke.mjs';
import {
  collectRenderedSectionIds,
  extractSectionSource,
} from '../../lib/reports/special-report-section-source.mjs';
import { auditSpecialReportBrowserVisualContract } from '../../lib/reports/special-report-browser-visual-contract-smoke.mjs';
import { auditPublishedPlatformDetailOwners } from '../../lib/reports/special-report-published-platform-owners-smoke.mjs';
import { auditSpecialReportTmallCss } from '../../lib/reports/special-report-tmall-css-smoke.mjs';
const GUARD_NAME = 'reports-special-smoke';
const REPORT_ROUTE = '/reports/special/gsv-monthly-channel';
const NPM_SCRIPT_NAME = 'verify:reports:special-smoke';
const NPM_SCRIPT_COMMAND = 'tsx scripts/checks/reports/gsv-snapshot-artifact.ts && node scripts/checks/reports/special-smoke.mjs';
const NPM_BROWSER_SCRIPT_NAME = 'verify:reports:special-browser-smoke';
const NPM_BROWSER_SCRIPT_COMMAND = 'node scripts/checks/reports/special-browser-visual-smoke.mjs';
const NPM_BROWSER_EVIDENCE_BEHAVIOR_SCRIPT_NAME = 'verify:reports:special-browser-smoke-evidence-behavior';
const NPM_BROWSER_EVIDENCE_BEHAVIOR_SCRIPT_COMMAND = 'node scripts/checks/reports/special-browser-smoke-evidence.behavior.mjs';
const PATHS = {
  designAuthority: 'DESIGN.md',
  chartGalleryDoc: 'docs/SPECIAL_REPORT_CHART_GALLERY.md',
  pageCompositionDoc: 'docs/SPECIAL_REPORT_PAGE_COMPOSITION.md',
  page: 'apps/web-vite/src/app/reports/special/gsv-monthly-channel/page.tsx',
  snapshotLoader: 'apps/web-vite/src/app/reports/special/gsv-monthly-channel/gsv-monthly-channel-report-loader.ts',
  snapshotParser: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-report-parser.ts',
  snapshotArtifact: 'public/reports/special/gsv-monthly-channel-2026-ytd-05.json',
  snapshotArtifactCheck: 'scripts/checks/reports/gsv-snapshot-artifact.ts',
  content: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05.ts',
  contentData: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05-data.json',
  juneEstimates: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05-estimates.ts',
  contentActions: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05-actions.ts',
  contentGovernance: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05-governance.ts',
  registry: 'apps/web-vite/src/app/reports/special/_content/special-report-registry.ts',
  types: 'apps/web-vite/src/app/reports/special/_content/special-report-types.ts',
  specialReportIndex: 'apps/web-vite/src/app/reports/special/_components/special-report-index.tsx',
  shell: 'apps/web-vite/src/app/reports/special/_components/special-report-shell.tsx',
  toc: 'apps/web-vite/src/app/reports/special/_components/special-report-toc.tsx',
  tocActive: 'apps/web-vite/src/app/reports/special/_components/special-report-toc-active.ts',
  tocModel: 'apps/web-vite/src/app/reports/special/_components/special-report-toc-model.ts',
  sections: 'apps/web-vite/src/app/reports/special/_components/special-report-sections.tsx',
  platformMatrix: 'apps/web-vite/src/app/reports/special/_components/special-report-platform-matrix.tsx',
  deferredChapters: 'apps/web-vite/src/app/reports/special/_components/special-report-deferred-chapters.tsx',
  chartBarrel: 'apps/web-vite/src/app/reports/special/_components/special-report-chart-options.ts',
  reportChartPanel: 'apps/web-vite/src/app/reports/special/_components/report-chart-panel.tsx',
  staticDomVisual: 'apps/web-vite/src/app/reports/special/_components/static-report-dom-visual.ts',
  staticReportChart: 'apps/web-vite/src/app/reports/special/_components/static-report-chart.tsx',
  staticReportEchartsRuntime: 'apps/web-vite/src/app/reports/special/_components/static-report-echarts-runtime.ts',
  styleMap: 'apps/web-vite/src/app/reports/special/_components/special-report-style-map.ts',
  chartCatalog: 'apps/web-vite/src/app/reports/special/_components/chart-options/catalog.ts',
  chartGalleryFixtures: 'apps/web-vite/src/app/reports/special/_components/chart-options/gallery-fixtures.ts',
  candidateVisuals: 'apps/web-vite/src/app/reports/special/_components/chart-options/candidate-visuals.ts',
  chartGalleryBoard: 'apps/web-vite/src/app/reports/special/_components/chart-options/gallery-reference-board.tsx',
  chartGalleryPreviewRenderers: 'apps/web-vite/src/app/reports/special/_components/chart-options/gallery-reference-preview-renderers.tsx',
  monthlyOverviewChart: 'apps/web-vite/src/app/reports/special/_components/chart-options/monthly-overview.ts',
  platformStructureChart: 'apps/web-vite/src/app/reports/special/_components/chart-options/platform-structure.ts',
  reportChartTheme: 'apps/web-vite/src/app/reports/special/_components/chart-options/templates/report-chart-theme.ts',
  horizontalCompositionTemplate: 'apps/web-vite/src/app/reports/special/_components/chart-options/templates/horizontal-composition.ts',
  lollipopTemplate: 'apps/web-vite/src/app/reports/special/_components/chart-options/templates/lollipop.ts',
  quadrantBubbleTemplate: 'apps/web-vite/src/app/reports/special/_components/chart-options/templates/quadrant-bubble.ts',
  routeWorksheet: 'apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05-worksheet.ts',
  rankedBarTemplate: 'apps/web-vite/src/app/reports/special/_components/chart-options/templates/ranked-bar.ts',
  reportFigure: 'apps/web-vite/src/app/reports/special/_components/report-figure.tsx',
  reportEvidence: 'apps/web-vite/src/app/reports/special/_components/report-evidence.tsx',
  reportEvidenceModel: 'apps/web-vite/src/app/reports/special/_components/report-evidence-model.ts',
  evidenceRowCap: 'apps/web-vite/src/app/reports/special/_components/evidence/evidence-row-cap.ts',
  evidenceDrawer: 'apps/web-vite/src/app/reports/special/_components/evidence/evidence-drawer.tsx',
  evidenceSummary: 'apps/web-vite/src/app/reports/special/_components/evidence/evidence-summary.tsx',
  evidenceTable: 'apps/web-vite/src/app/reports/special/_components/evidence/evidence-table.tsx',
  evidenceTableMobileLabels: 'apps/web-vite/src/app/reports/special/_components/evidence/evidence-table-mobile-labels.tsx',
  evidenceTypes: 'apps/web-vite/src/app/reports/special/_components/evidence/evidence-types.ts',
  brandTotalSection: 'apps/web-vite/src/app/reports/special/_components/brand-management/brand-total-section.tsx',
  douyinSection: 'apps/web-vite/src/app/reports/special/_components/brand-management/douyin-section.tsx',
  brandShared: 'apps/web-vite/src/app/reports/special/_components/brand-management/shared.tsx',
  brandSharedModel: 'apps/web-vite/src/app/reports/special/_components/brand-management/shared-model.ts',
  tmallSection: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-section.tsx',
  tmallPaidDriverSections: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-paid-driver-sections.tsx',
  tmallProductAnalysis: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-product-analysis.ts',
  tmallProductMiniVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-product-mini-visuals.tsx',
  tmallProductTrendVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-product-trend-visuals.tsx',
  tmallProductVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-product-visuals.tsx',
  tmallTrafficAnalysis: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-traffic-analysis.ts',
  tmallTrafficVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-traffic-visuals.tsx',
  operatingPrioritySection: 'apps/web-vite/src/app/reports/special/_components/brand-management/operating-priority-section.tsx',
  tmallEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-evidence.tsx',
  tmallProductEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-evidence/product.tsx',
  tmallTrafficMatrixEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-evidence/traffic-matrix.tsx',
  tmallTrafficSourceEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-evidence/traffic-source.tsx',
  tmallWanxiangtaiEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-evidence/wanxiangtai.tsx',
  tmallDriverEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-evidence/driver.tsx',
  douyinEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/douyin-evidence.tsx',
  douyinCommerceEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/douyin-commerce-evidence.tsx',
  douyinQianchuanEvidence: 'apps/web-vite/src/app/reports/special/_components/brand-management/douyin-qianchuan-evidence.tsx',
  brandTotalReadiness: 'apps/web-vite/src/app/reports/special/_components/brand-management/brand-total-readiness.tsx',
  brandTotalPromotionSignal: 'apps/web-vite/src/app/reports/special/_components/brand-management/brand-total-promotion-signal.tsx',
  brandTotalPromotionSignalData: 'apps/web-vite/src/app/reports/special/_components/brand-management/brand-total-promotion-signal-data.ts',
  tmallVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/tmall-visuals.tsx',
  douyinVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/douyin-visuals.tsx',
  priorityVisuals: 'apps/web-vite/src/app/reports/special/_components/brand-management/priority-visuals.tsx',
  indexCss: 'apps/web-vite/src/app/reports/special/special-report-index.module.css',
  layoutCss: 'apps/web-vite/src/app/reports/special/special-report.module.css',
  tocCss: 'apps/web-vite/src/app/reports/special/special-report-toc.module.css',
  detailCss: 'apps/web-vite/src/app/reports/special/special-report-detail.module.css',
  evidenceCss: 'apps/web-vite/src/app/reports/special/special-report-evidence.module.css',
  evidenceDrawerCss: 'apps/web-vite/src/app/reports/special/special-report-evidence-drawer.module.css',
  brandManagementCss: 'apps/web-vite/src/app/reports/special/special-report-brand-management.module.css',
  tmallProductsCss: 'apps/web-vite/src/app/reports/special/special-report-tmall-products.module.css',
  tmallTrafficCss: 'apps/web-vite/src/app/reports/special/special-report-tmall-traffic.module.css',
  reportSourceSql: 'scripts/reports/gsv-monthly-channel-brand-management.sql',
  chartGallerySmoke: 'scripts/lib/reports/special-report-chart-gallery-smoke.mjs',
  readerFatigueSmoke: 'scripts/lib/reports/special-report-reader-fatigue-smoke.mjs',
  browserSmokeEvidence: 'scripts/lib/reports/special-report-browser-smoke-evidence.mjs',
  browserSmokeEvidenceCheck: 'scripts/checks/reports/special-browser-smoke-evidence.behavior.mjs',
  browserSmokeEvidenceFixtures: 'scripts/lib/reports/special-report-browser-smoke-evidence-fixtures.mjs',
  browserSnapshotCapture: 'scripts/lib/reports/special-report-browser-snapshot-capture.mjs',
  browserVisualContract: 'scripts/lib/reports/special-report-browser-visual-contract.mjs',
  browserVisualSmoke: 'scripts/lib/reports/special-report-browser-visual-smoke.mjs',
  browserVisualSmokeSummary: 'scripts/lib/reports/special-report-browser-visual-smoke-summary.mjs',
  browserVisualSmokeCheck: 'scripts/checks/reports/special-browser-visual-smoke.mjs',
};
const RENDERED_SECTION_SOURCE_PATHS = [
  PATHS.brandTotalSection,
  PATHS.tmallSection,
  PATHS.tmallPaidDriverSections,
  PATHS.douyinSection,
  PATHS.operatingPrioritySection,
];
const EXPECTED_DESIGN_AUTHORITY_SNIPPETS = [
  'Static special reports',
  'left table of contents',
  'business-first',
  'Cover density budget',
  'front matter',
  'one analytical question gets one dominant visual',
  'table demotion ladder',
  'lower-left methodology footnote',
  'hidden navigation anchors',
  'top-level chapter skeleton (`I/II/III`)',
  'section and page rows should use indentation, typography, and title-only labels',
  'they must not appear as visible TOC markers',
  'Drawer tables should cap the initial rendered rows at 8',
  'Static report chart acceptance rubric',
  'Static report scoring rubric for delivery review',
  'no primary number, caveat, label, or comparison may be tooltip-only',
  'At 390px mobile width, the chart block must not create horizontal page overflow',
  'Every new visual template must have a catalog entry before the local implementation uses it',
  'docs/SPECIAL_REPORT_CHART_GALLERY.md',
  'docs/SPECIAL_REPORT_PAGE_COMPOSITION.md',
];

const EXPECTED_PAGE_COMPOSITION_SNIPPETS = [
  '# Special report page composition',
  '## Composition principle',
  'answer one business question through an answer-first pyramid',
  'Primary reading sections: 6-9 visible sections in the document TOC',
  'More than 9 primary sections',
  'front matter, not a dashboard hero',
  'Duplicate visual failure',
  'table demotion ladder',
  '### Cover page',
  '### Chapter answer page',
  '### Evidence page',
  '### Platform detail page',
  '### Action priority page',
  '### Methodology and evidence gaps page',
  'gsv-monthly-channel-2026-ytd-05-worksheet.ts',
  'Top-level chapter labels may use a restrained Roman skeleton',
  'they should not be visible TOC markers',
  'New routes map each primary TOC section to one of the page archetypes above',
  'Long tables are demoted unless the route states why the question is',
];

const EXPECTED_TMALL_TRAFFIC_BODY_ONLY_SECTION_IDS = [
  'tmall-traffic-structure',
  'tmall-traffic-goods-source',
  'tmall-traffic-delta',
  'tmall-traffic-actions',
];

const EXPECTED_TMALL_TRAFFIC_BODY_SECTION_IDS = [
  'tmall-traffic',
  ...EXPECTED_TMALL_TRAFFIC_BODY_ONLY_SECTION_IDS,
];

const EXPECTED_CONTENT_HANDLES = [
  'monthlyTrend',
  'platformTotals',
  'platformMonthly',
  'douyinDrivers',
  'tmallDrivers',
  'tmallProductHighlights',
  'tmallMonthlyTopProducts',
  'tmallRefundDragProducts',
  'tmallTrafficSources',
  'tmallProductTrafficMatrix',
  'tmallTrafficMonthlyFlow',
  'tmallTrafficSourceMonthlyRoles',
  'tmallTrafficProductSourceMatrix',
  'tmallTrafficSourceDeltas',
  'tmallDriverMonthly',
  'douyinChannelBreakdown',
  'douyinLiveSessions',
  'douyinLiveProducts',
  'douyinCardSources',
  'douyinCardProducts',
  'douyinShortVideoHighlights',
  'douyinSpendDiagnostics',
  'operatingPriorities',
  'evidenceStatus',
  'referenceBands',
  'insights',
  'methodologyNotes',
];

const EXPECTED_TOC_ITEMS = [
  { id: 'brand-management', targetId: 'business-overview', index: 'I', title: '品牌经营', level: 'chapter' },
  { id: 'brand-business', title: '品牌生意', level: 'section', groupLabel: true },
  { id: 'business-overview', title: '经营总览', level: 'sub' },
  { id: 'platform-role', title: '平台结构', level: 'sub' },
  { id: 'platform-may-readiness', title: '大促承接', level: 'sub' },
  { id: 'industry-promotion-appendix', title: '外部大促参照', level: 'sub' },
  { id: 'platform-detail', title: '平台详情', level: 'section', groupLabel: true },
  { id: 'tmall-shelf-commerce', title: '天猫', level: 'sub' },
  { id: 'tmall-products', targetId: 'tmall-products', title: '商品', level: 'micro' },
  { id: 'tmall-traffic', targetId: 'tmall-traffic', title: '流量', level: 'micro' },
  { id: 'tmall-wanxiangtai', targetId: 'tmall-wanxiangtai', title: '万相台', level: 'micro' },
  { id: 'tmall-driver', targetId: 'tmall-driver', title: 'Driver 变化', level: 'micro' },
  { id: 'douyin-content-commerce', title: '抖音', level: 'sub' },
  { id: 'douyin-channel', targetId: 'douyin-channel', title: '渠道拆解', level: 'micro' },
  { id: 'douyin-live', targetId: 'douyin-live', title: '直播', level: 'micro' },
  { id: 'douyin-card', targetId: 'douyin-card', title: '商品卡', level: 'micro' },
  { id: 'douyin-qianchuan', targetId: 'douyin-qianchuan', title: '千川', level: 'micro' },
  { id: 'douyin-short-video', targetId: 'douyin-short-video', title: '短视频触点', level: 'micro' },
  { id: 'business-actions', targetId: 'business-actions', title: '经营动作', level: 'section' },
  { id: 'industry-insight', index: 'II', title: '行业洞察', level: 'chapter', disabled: true },
  { id: 'competitor-analysis', index: 'III', title: '竞品分析', level: 'chapter', disabled: true },
];

const RETIRED_QUESTION_TOC_TITLES = [
  '总盘是否健康',
  '5 月是否接住大促',
  '增长来自哪类平台',
  '平台诊断路径',
  '天猫为什么没接住',
  '抖音放量质量风险',
  '先做哪几个动作',
];

const EXPECTED_HIDDEN_MICRO_TOC_IDS = [];

const EXPECTED_COMPACT_VISIBLE_TOC_IDS = [
  'business-overview',
  'platform-role',
  'platform-may-readiness',
  'industry-promotion-appendix',
  'tmall-shelf-commerce',
  'tmall-products',
  'tmall-traffic',
  'tmall-wanxiangtai',
  'tmall-driver',
  'douyin-content-commerce',
  'douyin-channel',
  'douyin-live',
  'douyin-card',
  'douyin-qianchuan',
  'douyin-short-video',
  'business-actions',
];

const EXPECTED_DESKTOP_VISIBLE_TOC_IDS = [
  'brand-management',
  'brand-business',
  'business-overview',
  'platform-role',
  'platform-may-readiness',
  'industry-promotion-appendix',
  'platform-detail',
  'tmall-shelf-commerce',
  'tmall-products',
  'tmall-traffic',
  'tmall-wanxiangtai',
  'tmall-driver',
  'douyin-content-commerce',
  'douyin-channel',
  'douyin-live',
  'douyin-card',
  'douyin-qianchuan',
  'douyin-short-video',
  'business-actions',
  'industry-insight',
  'competitor-analysis',
];

const EXPECTED_COMPACT_ACTIVE_FALLBACKS = [];

const EXPECTED_RENDERED_SECTION_IDS = [
  'business-overview',
  'platform-role',
  'platform-may-readiness',
  'industry-promotion-appendix',
  'tmall-shelf-commerce',
  'tmall-products',
  'tmall-product-trend',
  'tmall-product-delta',
  'tmall-product-attribution',
  'tmall-traffic',
  ...EXPECTED_TMALL_TRAFFIC_BODY_ONLY_SECTION_IDS,
  'tmall-wanxiangtai',
  'tmall-driver',
  'douyin-content-commerce',
  'douyin-channel',
  'douyin-live',
  'douyin-card',
  'douyin-qianchuan',
  'douyin-short-video',
  'business-actions',
];

const EXPECTED_CHART_BUILDERS = [
  {
    name: 'buildMonthlyTrendOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/monthly-overview.ts',
    usePath: PATHS.brandTotalSection,
  },
  {
    name: 'buildPlatformGsvShareStructureOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/platform-structure.ts',
    usePath: PATHS.brandTotalSection,
  },
  {
    name: 'buildPlatformGsvTrendWithMayReferenceOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/platform-may-readiness.ts',
    usePath: PATHS.brandTotalSection,
    optionalRouteUse: true,
  },
  {
    name: 'buildPlatformRoleBubbleOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/platform-role.ts',
    usePath: PATHS.brandTotalSection,
    optionalRouteUse: true,
  },
  {
    name: 'buildTmallProductContributionRiskOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/tmall.ts',
    usePath: PATHS.tmallVisuals,
  },
  {
    name: 'buildTmallTrafficSourceOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/tmall.ts',
    usePath: PATHS.tmallVisuals,
  },
  {
    name: 'buildTmallDriverDeltaRankOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/tmall.ts',
    usePath: PATHS.tmallVisuals,
  },
  {
    name: 'buildDouyinChannelStackOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/douyin-channel.ts',
    usePath: PATHS.douyinVisuals,
  },
  {
    name: 'buildDouyinLiveTopOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/douyin-live.ts',
    usePath: PATHS.douyinVisuals,
  },
  {
    name: 'buildDouyinCardSourceOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/douyin-card.ts',
    usePath: PATHS.douyinVisuals,
  },
  {
    name: 'buildDouyinQianchuanRoiOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/douyin-qianchuan.ts',
    usePath: PATHS.douyinVisuals,
  },
  {
    name: 'buildDouyinShortVideoTouchpointOption',
    modulePath: 'apps/web-vite/src/app/reports/special/_components/chart-options/douyin-short-video.ts',
    usePath: PATHS.douyinVisuals,
  },
];

const EXPECTED_CHART_TEMPLATES = new Set([
  'annotated-bar-line',
  'stacked-percent-bar',
  'benchmark-bullet',
  'connected-dot',
  'quadrant-bubble',
  'lollipop',
  'ranked-bar',
  'delta-rank',
  'horizontal-composition',
  'tile-heatmap',
]);

const EXPECTED_CANDIDATE_VISUALS = [
  'top-list-cards',
  'visual-ranked-table',
  'slopegraph',
  'waterfall-delta-bridge',
  'small-multiples',
  'coverage-confidence-strip',
  'distribution-long-tail-strip',
  'action-ownership-list',
];

const EXPECTED_ROUTE_WORKSHEET_SECTION_IDS = [
  'cover',
  ...EXPECTED_RENDERED_SECTION_IDS,
];
const EXPECTED_TMALL_PRODUCT_PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

const EXPECTED_STATIC_VISUALS = [
  {
    name: 'TmallProductContributionVisual',
    definitionName: 'TmallProductContributionVisual',
    renderer: 'dom',
    template: 'horizontal-composition',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallProductContributionVisual monthlyProducts={monthlyTopProducts} />',
    evidenceDestination: '#tmall-products',
  },
  {
    name: 'TmallProductTrendVisualTable',
    definitionName: 'TmallProductTrendVisualTable',
    renderer: 'dom',
    template: 'tile-heatmap',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallProductTrendVisualTable monthlyProducts={monthlyTopProducts} />',
    evidenceDestination: '#tmall-product-trend',
  },
  {
    name: 'TmallProductDeltaContributionTable',
    definitionName: 'TmallProductDeltaContributionTable',
    renderer: 'dom',
    template: 'delta-rank',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallProductDeltaContributionTable monthlyProducts={monthlyTopProducts} />',
    evidenceDestination: '#tmall-product-delta',
  },
  {
    name: 'TmallProductAttributionMatrix',
    definitionName: 'TmallProductAttributionMatrix',
    renderer: 'dom',
    template: 'tile-heatmap',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallProductAttributionMatrix monthlyProducts={monthlyTopProducts} />',
    evidenceDestination: '#tmall-product-attribution',
  },
  {
    name: 'TmallTrafficFlowVisual',
    definitionName: 'TmallTrafficFlowVisual',
    renderer: 'dom',
    template: 'tile-heatmap',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallTrafficFlowVisual',
    evidenceDestination: '#tmall-traffic',
  },
  {
    name: 'TmallTrafficSourceRoleVisual',
    definitionName: 'TmallTrafficSourceRoleVisual',
    renderer: 'dom',
    template: 'quadrant-bubble',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallTrafficSourceRoleVisual',
    evidenceDestination: '#tmall-traffic-structure',
  },
  {
    name: 'TmallTrafficProductSourceMatrix',
    definitionName: 'TmallTrafficProductSourceMatrix',
    renderer: 'dom',
    template: 'tile-heatmap',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallTrafficProductSourceMatrix',
    evidenceDestination: '#tmall-traffic-goods-source',
  },
  {
    name: 'TmallTrafficSourceDeltaVisual',
    definitionName: 'TmallTrafficSourceDeltaVisual',
    renderer: 'dom',
    template: 'delta-rank',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallTrafficSourceDeltaVisual',
    evidenceDestination: '#tmall-traffic-delta',
  },
  {
    name: 'TmallTrafficActionBoard',
    definitionName: 'TmallTrafficActionBoard',
    renderer: 'dom',
    template: 'horizontal-composition',
    definitionPath: PATHS.tmallSection,
    usePath: PATHS.tmallSection,
    useSnippet: '<TmallTrafficActionBoard',
    evidenceDestination: '#tmall-traffic-actions',
  },
  {
    name: 'PlatformMayReadinessBenchmark',
    definitionName: 'PlatformReadinessVisualBoard',
    renderer: 'dom',
    template: 'benchmark-bullet',
    definitionPath: PATHS.brandTotalReadiness,
    usePath: PATHS.brandTotalSection,
    useSnippet: '<PlatformReadinessVisualBoard report={report} />',
    evidenceDestination: '#platform-may-readiness',
  },
  {
    name: 'PromotionSignalEvidenceTable',
    definitionName: 'PromotionSignalEvidenceTable',
    renderer: 'dom',
    template: 'tile-heatmap',
    definitionPath: PATHS.brandTotalPromotionSignal,
    usePath: PATHS.brandTotalSection,
    useSnippet: '<PromotionSignalEvidenceTable />',
    evidenceDestination: '#industry-promotion-appendix',
  },
  {
    name: 'TmallWanxiangtaiPaidSourceMeters',
    definitionName: 'TmallWanxiangtaiVisualBoard',
    renderer: 'dom',
    template: 'ranked-bar',
    definitionPath: PATHS.tmallVisuals,
    usePath: PATHS.tmallPaidDriverSections,
    useSnippet: '<TmallWanxiangtaiVisualBoard report={report} />',
    evidenceDestination: '#tmall-wanxiangtai',
  },
  {
    name: 'PriorityImpactEvidenceMatrix',
    definitionName: 'PriorityDecisionCards',
    renderer: 'dom',
    template: 'quadrant-bubble',
    definitionPath: PATHS.priorityVisuals,
    usePath: PATHS.operatingPrioritySection,
    useSnippet: '<PriorityDecisionCards report={report} />',
    evidenceDestination: '#business-actions',
  },
];

const EXPECTED_EVIDENCE_SUMMARY_FIELDS = [
  'checkQuestion',
  'sortKey',
  'shownCount',
  'totalCount',
  'sourcePeriod',
  'omissionRule',
  'missingEvidence',
  'readerAction',
];

const EXPECTED_CAPPED_ROW_SOURCES = [
  {
    filePath: PATHS.tmallProductEvidence,
    source: 'report.tmallProductHighlights',
    limit: 4,
    limitIdentifier: 'DUAL_EVIDENCE_TABLE_ROW_CAP',
  },
  {
    filePath: PATHS.tmallProductEvidence,
    source: 'report.tmallRefundDragProducts',
    limit: 4,
    limitIdentifier: 'DUAL_EVIDENCE_TABLE_ROW_CAP',
  },
  { filePath: PATHS.tmallTrafficMatrixEvidence, source: 'report.tmallProductTrafficMatrix', limit: 8 },
  {
    filePath: PATHS.tmallTrafficSourceEvidence,
    source: 'report.tmallTrafficSources',
    limit: 8,
    limitIdentifier: 'tmallTrafficSourceRowCap',
    omissionRuleSnippet: '仅展示前 ${tmallTrafficSourceRowCap} 个来源',
  },
  { filePath: PATHS.tmallWanxiangtaiEvidence, source: 'totalRows', limit: 8 },
  { filePath: PATHS.tmallDriverEvidence, source: 'report.tmallDriverMonthly', limit: 8 },
  { filePath: PATHS.douyinEvidence, source: 'report.douyinChannelBreakdown', limit: 8 },
  {
    filePath: PATHS.douyinCommerceEvidence,
    source: 'report.douyinLiveSessions',
    limit: 4,
    limitIdentifier: 'DUAL_EVIDENCE_TABLE_ROW_CAP',
  },
  {
    filePath: PATHS.douyinCommerceEvidence,
    source: 'report.douyinLiveProducts',
    limit: 4,
    limitIdentifier: 'DUAL_EVIDENCE_TABLE_ROW_CAP',
  },
  {
    filePath: PATHS.douyinCommerceEvidence,
    source: 'report.douyinCardSources',
    limit: 4,
    limitIdentifier: 'DUAL_EVIDENCE_TABLE_ROW_CAP',
  },
  {
    filePath: PATHS.douyinCommerceEvidence,
    source: 'report.douyinCardProducts',
    limit: 4,
    limitIdentifier: 'DUAL_EVIDENCE_TABLE_ROW_CAP',
  },
  { filePath: PATHS.douyinQianchuanEvidence, source: 'report.douyinSpendDiagnostics', limit: 8 },
  { filePath: PATHS.douyinEvidence, source: 'report.douyinShortVideoHighlights', limit: 8 },
  { filePath: PATHS.operatingPrioritySection, source: 'report.operatingPriorities', limit: 8 },
];

const { fail, reportOk } = createCheckGuard(GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const files = readCheckFiles(repoRoot);
  const findings = auditSpecialReportSmoke({
    files,
    packageJson,
  });

  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] ${REPORT_ROUTE} smoke drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    fail(`${findings.length} special report smoke check(s) failed.`);
  }

  reportOk([
    `${REPORT_ROUTE}`,
    `${EXPECTED_TOC_ITEMS.length} TOC entries`,
    `${EXPECTED_HIDDEN_MICRO_TOC_IDS.length} hidden micro anchors`,
    `${EXPECTED_RENDERED_SECTION_IDS.length} rendered section anchors`,
    `${EXPECTED_CHART_BUILDERS.length} chart builders`,
    `${EXPECTED_CHART_BUILDERS.length} chart catalog entries`,
    `${EXPECTED_CHART_TEMPLATES.size} chart gallery fixtures`,
    `${EXPECTED_CANDIDATE_VISUALS.length} candidate visuals`,
    `${EXPECTED_ROUTE_WORKSHEET_SECTION_IDS.length} worksheet entries`,
    `${EXPECTED_STATIC_VISUALS.length} static visual catalog entries`,
    `${EXPECTED_CAPPED_ROW_SOURCES.length} capped evidence row sources`,
  ].join('; '));
}

function readCheckFiles(repoRoot) {
  const baseFilePaths = [
    ...Object.values(PATHS),
    ...EXPECTED_CHART_BUILDERS.map((builder) => builder.modulePath),
  ];
  const styleMapSource = readRequiredFile(repoRoot, PATHS.styleMap, fail);
  const styleModulePaths = collectStyleModuleImportPaths(styleMapSource);
  const uniqueFilePaths = [...new Set([...baseFilePaths, ...styleModulePaths])].sort();

  const files = Object.fromEntries(
    uniqueFilePaths.map((filePath) => [
      filePath,
      readRequiredFile(repoRoot, filePath, fail),
    ]),
  );

  files[PATHS.tmallSection] = [PATHS.tmallSection, PATHS.tmallProductAnalysis,
    PATHS.tmallProductMiniVisuals, PATHS.tmallProductTrendVisuals, PATHS.tmallProductVisuals,
    PATHS.tmallTrafficAnalysis, PATHS.tmallTrafficVisuals, PATHS.tmallPaidDriverSections]
    .map((filePath) => files[filePath]).join('\n');

  return files;
}

export function auditSpecialReportSmoke({ files, packageJson }) {
  const findings = [];
  const snapshotData = parseGsvSnapshotData(files[PATHS.contentData], PATHS.contentData, findings);

  auditPackageWiring(packageJson, findings);
  auditBrowserSmokeWiring(files, packageJson, findings);
  auditDesignAuthority(files, findings);
  auditPageCompositionContract(files, findings);
  auditRouteWiring(files, findings);
  auditStaticContent(files, snapshotData, findings);
  auditJuneExpectationSource(files, findings);
  auditRouteWorksheet(files, findings);
  auditPromotionSignalEvidence(files, findings);
  auditTocAndSections(files, snapshotData, findings);
  auditPublishedPlatformDetailSections(files, findings);
  auditTmallTrafficRefinedSections(files, findings);
  auditTmallMonthlyTopProductData(snapshotData, findings);
  auditMobileAndExportStaticDom(files, findings);
  auditProductionChartImportBoundaries(files, findings);
  auditChartBuilders(files, findings);
  auditChartCatalog(files, findings);
  auditStaticVisualCatalog(files, findings);
  auditSpecialReportChartGallery({
    chartCatalogSource: files[PATHS.chartCatalog],
    chartGalleryBoard: files[PATHS.chartGalleryBoard],
    chartGalleryDoc: files[PATHS.chartGalleryDoc],
    chartGalleryFixtures: files[PATHS.chartGalleryFixtures],
    chartGalleryPreviewRenderers: files[PATHS.chartGalleryPreviewRenderers],
    candidateVisualsSource: files[PATHS.candidateVisuals],
    designAuthority: files[PATHS.designAuthority],
    expectedCandidateVisuals: EXPECTED_CANDIDATE_VISUALS,
    expectedChartTemplates: EXPECTED_CHART_TEMPLATES,
    expectedStaticVisuals: EXPECTED_STATIC_VISUALS,
    findings,
    paths: PATHS,
    specialReportIndex: files[PATHS.specialReportIndex],
  });
  auditChartInstanceGalleryHandles(files, findings);
  auditSpecialReportReaderFatigue({
    files,
    findings,
    paths: PATHS,
  });
  auditEvidenceSummaryAndRowCaps(files, findings);
  auditFormatMultipleGuard(files, findings);
  auditStyleMapCollisions(files, findings);
  auditPerformanceShape(files, findings);

  return findings;
}

function auditProductionChartImportBoundaries(files, findings) {
  const chartBarrel = files[PATHS.chartBarrel];

  requireNotIncludes(
    findings,
    PATHS.chartBarrel,
    chartBarrel,
    'SPECIAL_REPORT_CHART_GALLERY_FIXTURES',
    'Production chart barrel must not export development chart gallery fixtures',
  );
  requireNotIncludes(
    findings,
    PATHS.chartBarrel,
    chartBarrel,
    'SPECIAL_REPORT_CANDIDATE_VISUALS',
    'Production chart barrel must not export development candidate visuals',
  );

  const chartBarrelImportPattern = /from\s+['"](?:\.\.?\/)*special-report-chart-options['"]/;
  for (const [filePath, source] of Object.entries(files)) {
    if (filePath === PATHS.chartBarrel || !filePath.startsWith('apps/web-vite/src/app/reports/special/')) {
      continue;
    }

    if (chartBarrelImportPattern.test(source)) {
      findings.push(
        `${filePath} must import production chart modules directly instead of the special-report-chart-options barrel.`,
      );
    }
  }
}

function auditPackageWiring(packageJson, findings) {
  const actual = packageJson.scripts?.[NPM_SCRIPT_NAME];
  if (actual !== NPM_SCRIPT_COMMAND) {
    findings.push(`package.json must expose "${NPM_SCRIPT_NAME}": "${NPM_SCRIPT_COMMAND}".`);
  }
}

function auditBrowserSmokeWiring(files, packageJson, findings) {
  const actual = packageJson.scripts?.[NPM_BROWSER_SCRIPT_NAME];
  if (actual !== NPM_BROWSER_SCRIPT_COMMAND) {
    findings.push(`package.json must expose "${NPM_BROWSER_SCRIPT_NAME}": "${NPM_BROWSER_SCRIPT_COMMAND}".`);
  }
  const behaviorActual = packageJson.scripts?.[NPM_BROWSER_EVIDENCE_BEHAVIOR_SCRIPT_NAME];
  if (behaviorActual !== NPM_BROWSER_EVIDENCE_BEHAVIOR_SCRIPT_COMMAND) {
    findings.push(`package.json must expose "${NPM_BROWSER_EVIDENCE_BEHAVIOR_SCRIPT_NAME}": "${NPM_BROWSER_EVIDENCE_BEHAVIOR_SCRIPT_COMMAND}".`);
  }

  const browserSmoke = `${files[PATHS.browserSnapshotCapture]}\n${files[PATHS.browserVisualContract]}\n${files[PATHS.browserVisualSmoke]}\n${files[PATHS.browserVisualSmokeSummary]}`;
  const browserSmokeCheck = files[PATHS.browserVisualSmokeCheck];
  const browserSmokeEvidence = files[PATHS.browserSmokeEvidence];
  const browserSmokeEvidenceCheck = files[PATHS.browserSmokeEvidenceCheck];
  const browserSmokeEvidenceFixtures = files[PATHS.browserSmokeEvidenceFixtures];
  auditSpecialReportBrowserVisualContract({
    chartBuilders: EXPECTED_CHART_BUILDERS,
    findings,
    renderedSectionIds: EXPECTED_RENDERED_SECTION_IDS,
    staticVisuals: EXPECTED_STATIC_VISUALS,
  });
  requireIncludes(
    findings,
    PATHS.browserVisualSmokeCheck,
    browserSmokeCheck,
    "runSpecialReportBrowserVisualSmoke",
    'Special report browser smoke check must call the shared browser visual smoke runner',
  );
  requireIncludes(
    findings,
    PATHS.browserVisualSmokeCheck,
    browserSmokeCheck,
    "writeSpecialReportBrowserSmokeEvidence",
    'Special report browser smoke check must write runbook-aligned evidence when requested',
  );
  requireIncludes(
    findings,
    PATHS.browserSmokeEvidenceCheck,
    browserSmokeEvidenceCheck,
    "runSpecialReportBrowserSmokeEvidenceBehaviorFixtures",
    'Special report browser smoke evidence behavior check must call the shared fixtures',
  );
  for (const snippet of [
    'SPECIAL_REPORT_BROWSER_SMOKE_REPORT_MD',
    'FRONTEND_SMOKE_REPORT_MD',
    'SENSITIVE_QUERY_KEY_PATTERN',
    'redactSensitiveText',
    'buildSpecialReportBrowserSmokeEvidenceRecord',
    'renderSpecialReportBrowserSmokeMarkdownReport',
    'writeSpecialReportBrowserSmokeEvidence',
    'docs/FRONTEND_BROWSER_SMOKE_RUNBOOK.md',
    'This artifact intentionally stores no cookie headers',
  ]) {
    requireIncludes(
      findings,
      PATHS.browserSmokeEvidence,
      browserSmokeEvidence,
      snippet,
      'Special report browser smoke evidence output drifted',
    );
  }
  for (const snippet of [
    'access_token=secret-value',
    'access_token=%5Bredacted%5D',
    'assertNotIncludes(markdown, \'secret-value\'',
    'writeSpecialReportBrowserSmokeEvidence',
  ]) {
    requireIncludes(
      findings,
      PATHS.browserSmokeEvidenceFixtures,
      browserSmokeEvidenceFixtures,
      snippet,
      'Special report browser smoke evidence behavior coverage drifted',
    );
  }

  for (const snippet of [
    'SPECIAL_REPORT_BROWSER_VIEWPORTS',
    "{ name: '1512', width: 1512",
    "{ name: '390', width: 390",
    'EXPECTED_ECHARTS_CHART_NODE_COUNT = EXPECTED_REPORT_ECHARTS.length',
    'EXPECTED_CHART_GALLERY_CARD_COUNT = 10',
    'EXPECTED_STATIC_DOM_VISUAL_COUNT = EXPECTED_STATIC_DOM_VISUAL_NAMES.length',
    'EXPECTED_EVIDENCE_DRAWER_SECTION_IDS.length',
    'EXPECTED_TOC_MODEL_ENTRY_COUNT = 21',
    'HIDDEN_MICRO_TOC_ENTRY_IDS',
    'MICRO_DEEP_LINK_ENTRY_IDS',
    'DESKTOP_VISIBLE_TOC_ENTRY_IDS',
    'MOBILE_VISIBLE_TOC_ENTRY_IDS',
    'RETIRED_QUESTION_TOC_TITLES',
    'DESKTOP_CHAPTER_TOC_MARKERS',
    'DESKTOP_DISABLED_TOC_STATUSES',
    'MOBILE_COMPACT_ACTIVE_FALLBACKS',
    'MAX_SECTION_EVIDENCE_SHOWN_COUNT = 16',
    "reportMode=export",
    'MAX_MOBILE_STATIC_DOM_VISUAL_HEIGHT = 900',
    'SPECIAL_REPORT_BROWSER_SMOKE_REQUIRE_AUTH',
    'waitForAnonymousRedirectSnapshot',
    'anonymousRedirectMode',
    'scrollThroughLazyReportCharts',
    'window.__specialReportSmokeErrors',
    'window.__specialReportSmokeConsoleErrors',
    'documentElement.scrollWidth > documentElement.clientWidth + 2',
    'td[data-cell-label], td[data-label], th[data-label]',
    "document.querySelectorAll('nav[aria-label=\"专题报告目录\"] details')",
    "document.querySelectorAll('nav[aria-label=\"专题报告目录\"][data-toc-mode]')",
    "document.querySelectorAll('[data-static-report-visual]')",
    "document.querySelector('[data-special-report-chart-gallery-board]')",
    "'data-chart-reference-preview-kind'",
    'buildIndexFailures',
    'gallery_cards=',
    'chartMissingSemanticMetadataCount',
    'chartBuilders',
    'chartSectionIds',
    'chartGraphicFrameOverflowCount',
    'chartInnerScrollOverflowCount',
    'chartMaxDirectChildWidth',
    'chartNonZeroGraphicCount',
    'tocNavSummaries',
    'markerByEntryId',
    'statusByEntryId',
    'textByEntryId',
    'desktop visible TOC',
    'mobile visible TOC',
    'desktop TOC marker',
    'desktop TOC text must not expose decimal section numbers',
    'desktop TOC must use business hierarchy titles',
    'hidden micro anchor',
    'evaluateMobileCompactFallbackSnapshot',
    'mobile compact current for micro target',
    'snapshot.chartNodeCount !== EXPECTED_ECHARTS_CHART_NODE_COUNT',
    'snapshot.chartNonZeroGraphicCount !== snapshot.chartNodeCount',
    'snapshot.staticVisualCount !== EXPECTED_STATIC_DOM_VISUAL_COUNT',
    'snapshot.staticVisualNames ?? []).join',
    'staticVisualMissingSemanticMetadataCount',
    'static_visual_max_h=',
    'snapshot.staticVisualMaxHeight > MAX_MOBILE_STATIC_DOM_VISUAL_HEIGHT',
    'section.evidenceShownCount > MAX_SECTION_EVIDENCE_SHOWN_COUNT',
    'snapshot.evidenceOpenCount > 0',
    'evidenceDrawerSectionIds.join',
    'summary.shownCount > MAX_EVIDENCE_DRAWER_ROW_COUNT',
    'snapshot.publishedPlaceholderCount > 0',
    "snapshot.tmallProductBodyText ?? ''",
  ]) {
    requireIncludes(
      findings,
      PATHS.browserVisualSmoke,
      browserSmoke,
      snippet,
      'Special report browser visual smoke coverage drifted',
    );
  }
  requireNotIncludes(
    findings,
    PATHS.browserVisualSmoke,
    browserSmoke,
    "{ name: 'gallery-index'",
    'Special report browser visual smoke must not treat the development chart gallery as a production route by default',
  );
}

function auditDesignAuthority(files, findings) {
  const designAuthority = files[PATHS.designAuthority];
  for (const snippet of EXPECTED_DESIGN_AUTHORITY_SNIPPETS) {
    requireIncludes(findings, PATHS.designAuthority, designAuthority, snippet, 'Static special report design authority drifted');
  }
}

function auditPageCompositionContract(files, findings) {
  const designAuthority = files[PATHS.designAuthority];
  const pageCompositionDoc = files[PATHS.pageCompositionDoc];

  requireIncludes(
    findings,
    PATHS.designAuthority,
    designAuthority,
    PATHS.pageCompositionDoc,
    'DESIGN.md must point special-report route pacing to the page composition reference',
  );
  for (const snippet of EXPECTED_PAGE_COMPOSITION_SNIPPETS) {
    requireIncludes(
      findings,
      PATHS.pageCompositionDoc,
      pageCompositionDoc,
      snippet,
      'Special report page composition governance drifted',
    );
  }
}

function auditRouteWiring(files, findings) {
  const page = files[PATHS.page];
  const registry = files[PATHS.registry];
  const shell = files[PATHS.shell];

  requireIncludes(findings, PATHS.page, page, "'use client';", 'Report route must remain client-rendered for ProtectedRoute');
  requireIncludes(findings, PATHS.page, page, 'ProtectedRoute', 'Report route must remain protected');
  requireIncludes(findings, PATHS.page, page, 'REPORT_READ_PERMISSIONS', 'Report route must require report read permissions');
  requireIncludes(findings, PATHS.page, page, 'useGsvMonthlyChannelReport', 'Report route must load the static snapshot through its async boundary');
  requireIncludes(findings, PATHS.page, page, '<LoadingState', 'Report route must expose an observable loading state');
  requireIncludes(findings, PATHS.page, page, '<ErrorState', 'Report route must expose an observable error and retry state');
  requireIncludes(findings, PATHS.page, page, '<SpecialReportShell report={reportState.report} />', 'Report route must delegate validated data to SpecialReportShell');
  auditGsvSnapshotBoundary(files, PATHS, findings);
  requireIncludes(findings, PATHS.registry, registry, 'ROUTE_PATHS.reportsSpecialGsvMonthlyChannel', 'Special report registry must keep the route path handle');
  requireNotIncludes(findings, PATHS.registry, registry, 'GSV_MONTHLY_CHANNEL_REPORT', 'Special report index registry must not import the full static snapshot');
  requireIncludes(findings, PATHS.registry, registry, 'summary:', 'Special report registry must expose a lightweight index summary');
  requireIncludes(findings, PATHS.registry, registry, "periodStart: '2026-01-01'", 'Special report registry summary period start drifted');
  requireIncludes(findings, PATHS.registry, registry, "periodEnd: '2026-05-31'", 'Special report registry summary period end drifted');
  requireIncludes(findings, PATHS.registry, registry, "dataAsOf: '2026-05-31'", 'Special report registry summary data-as-of drifted');
  requireIncludes(findings, PATHS.registry, registry, "primaryMetric: '331.5 万'", 'Special report registry summary primary metric drifted');
  requireIncludes(findings, PATHS.shell, shell, '<SpecialReportCover report={report} />', 'Special report shell must keep the cover');
  requireIncludes(findings, PATHS.shell, shell, '<ReportToc', 'Special report shell must render the report TOC');
  requireIncludes(findings, PATHS.shell, shell, '<BrandTotalSection report={report} />', 'Special report shell must render the brand total section');
  requireIncludes(findings, PATHS.shell, shell, '<TmallShelfCommerceSection report={report} />', 'Special report shell must render the Tmall section');
  requireIncludes(findings, PATHS.shell, shell, '<DouyinContentCommerceSection report={report} />', 'Special report shell must render the Douyin section');
  requireIncludes(findings, PATHS.shell, shell, '<OperatingPrioritySection report={report} />', 'Special report shell must render the priority section');
  requireIncludes(findings, PATHS.shell, shell, '<DeferredChapterPlaceholders report={report} />', 'Special report shell must render deferred chapter placeholders');
}

function auditStaticContent(files, snapshotData, findings) {
  const content = files[PATHS.content];
  const contentData = files[PATHS.contentData];
  const contentActions = files[PATHS.contentActions];
  const contentGovernance = files[PATHS.contentGovernance];
  const contentAuditSource = `${content}\n${contentData}\n${contentActions}\n${contentGovernance}`;
  const types = files[PATHS.types];

  if (snapshotData?.meta?.id !== 'gsv-monthly-channel-2026-ytd-05') {
    findings.push(`${PATHS.contentData}: Report snapshot meta id drifted.`);
  }
  if (snapshotData?.meta?.status !== 'static_snapshot') {
    findings.push(`${PATHS.contentData}: Report must remain a static snapshot.`);
  }
  if (snapshotData?.meta?.periodStart !== '2026-01-01') {
    findings.push(`${PATHS.contentData}: Report period start drifted.`);
  }
  if (snapshotData?.meta?.periodEnd !== '2026-05-31') {
    findings.push(`${PATHS.contentData}: Report period end drifted.`);
  }
  requireIncludes(findings, PATHS.contentData, contentData, 'Groland 2026 H1经营复盘报告', 'Report title drifted');
  requireIncludes(findings, PATHS.contentData, contentData, '618大促活动回顾', 'Report subtitle drifted');
  requireIncludes(findings, PATHS.contentData, contentData, '品牌在天猫没有接住 618 前置放量', 'Report business question drifted');
  requireNotIncludes(findings, PATHS.content, content, 'fetch(', 'Static report content must not fetch at open time');
  requireNotIncludes(findings, PATHS.content, content, 'useEffect(', 'Static report content must not contain runtime effects');
  requireIncludes(
    findings,
    PATHS.content,
    content,
    './gsv-monthly-channel-2026-ytd-05-data.json',
    'Report snapshot should keep its large immutable base payload in JSON',
  );
  requireIncludes(
    findings,
    PATHS.content,
    content,
    'parseGsvMonthlyChannelReport',
    'Report snapshot composition must validate the complete serialized contract',
  );
  requireIncludes(
    findings,
    PATHS.content,
    content,
    '...GSV_MONTHLY_CHANNEL_REPORT_GOVERNANCE',
    'Report snapshot should keep evidence/methodology governance in a separate fragment',
  );
  requireIncludes(
    findings,
    PATHS.content,
    content,
    'GSV_MONTHLY_CHANNEL_OPERATING_PRIORITIES',
    'Report snapshot should keep operating priorities in a separate action fragment',
  );

  for (const handle of EXPECTED_CONTENT_HANDLES) {
    requireRegex(
      findings,
      'special report static content fragments',
      contentAuditSource,
      new RegExp(`(?:"${escapeRegex(handle)}"|\\b${escapeRegex(handle)})\\s*:\\s*(?:\\[|\\{|[A-Z_])`),
      `Static snapshot handle "${handle}" is missing`,
    );
    requireIncludes(findings, PATHS.types, types, `${handle}:`, `SpecialReportSnapshot type must keep handle "${handle}"`);
  }

  for (const status of ['exact', 'partial', 'missing']) {
    requireIncludes(findings, 'special report static content fragments', contentAuditSource, `status: '${status}'`, `Evidence status "${status}" must remain represented`);
  }

  const methodologyNoteCount = countStringArrayEntries(contentAuditSource, 'methodologyNotes');
  if (methodologyNoteCount < 6) {
    findings.push(`Report methodologyNotes must keep a meaningful static snapshot note set; got ${methodologyNoteCount}.`);
  }
  requireIncludes(findings, 'special report static content fragments', contentAuditSource, '本页面为 AIOS 中台内静态快照', 'Static snapshot must explain that the page does not fan out to live APIs');
  requireIncludes(findings, 'special report static content fragments', contentAuditSource, '不可互相累加', 'Static snapshot must retain non-additive attribution caveat');
  requireIncludes(findings, 'special report static content fragments', contentAuditSource, '不能单独归因为投入下降', 'Static snapshot must retain cautious attribution wording');
}

function auditJuneExpectationSource(files, findings) {
  const juneEstimates = files[PATHS.juneEstimates];
  const brandTotalSection = files[PATHS.brandTotalSection];
  const monthlyOverviewChart = files[PATHS.monthlyOverviewChart];
  const platformStructureChart = files[PATHS.platformStructureChart];
  const reportSourceSql = files[PATHS.reportSourceSql];
  const overviewSource = [
    brandTotalSection,
    monthlyOverviewChart,
    platformStructureChart,
    juneEstimates,
    reportSourceSql,
  ].join('\n');

  for (const snippet of [
    "observedPeriodStart: '2026-06-01'",
    "dataThrough: '2026-06-21'",
    "generatedAt: '2026-06-23'",
    'completeDays: 21',
    'monthDays: 30',
    'douyin: 170362.64',
    'jd: 36464',
    'taobao: 419378.36',
    'wx: 120586.4',
    'xhs: 61506.77',
  ]) {
    requireIncludes(
      findings,
      PATHS.juneEstimates,
      juneEstimates,
      snippet,
      'June overview and platform-structure expectation source must use the 2026-06-21 observed window',
    );
  }

  for (const snippet of [
    'GSV_MONTHLY_CHANNEL_JUNE_EXPECTATION',
    'getJuneExpectationGsvYuan',
    'JUNE_EXPECTATION_WINDOW_SHORT',
    'formatShortMonthDay',
  ]) {
    requireIncludes(
      findings,
      PATHS.brandTotalSection,
      brandTotalSection,
      snippet,
      'Brand total overview copy must derive June expectation copy from the shared expectation source',
    );
  }

  for (const snippet of [
    'formatJuneExpectationRule()',
    'GSV_MONTHLY_CHANNEL_JUNE_EXPECTATION.generatedAt',
  ]) {
    requireIncludes(
      findings,
      PATHS.monthlyOverviewChart,
      monthlyOverviewChart,
      snippet,
      'Monthly overview chart must keep its June expectation note tied to the shared expectation source',
    );
  }

  requireIncludes(
    findings,
    PATHS.platformStructureChart,
    platformStructureChart,
    'GSV_MONTHLY_CHANNEL_PLATFORM_STRUCTURE_MONTHS',
    'Platform structure chart must keep reading from the shared platform-structure expectation source',
  );
  requireIncludes(
    findings,
    PATHS.reportSourceSql,
    reportSourceSql,
    "WHERE date BETWEEN DATE '2026-01-01' AND DATE '2026-06-21'",
    'Special report source SQL must extract the updated 6/1-6/21 platform observation window',
  );

  for (const retiredSnippet of [
    '6/1-6/7',
    '2026-06-07',
    '2026-06-08',
    'completeDays: 7',
    '117.8万',
    '+21.2%',
    '107.5万',
  ]) {
    requireNotIncludes(
      findings,
      'special report June overview/platform expectation sources',
      overviewSource,
      retiredSnippet,
      'June overview and platform-structure expectation sources must not keep the retired 6/1-6/7 estimate',
    );
  }
}

function auditPromotionSignalEvidence(files, findings) {
  const promotionSignalEvidenceSource = [
    files[PATHS.brandTotalSection],
    files[PATHS.brandTotalPromotionSignal],
    files[PATHS.brandTotalPromotionSignalData],
  ].join('\n');
  const worksheet = files[PATHS.routeWorksheet];

  for (const snippet of [
    'PromotionSignalEvidenceTable',
    'PROMOTION_SIGNAL_ROWS',
    'PROMOTION_SIGNAL_DIGEST_ROWS',
    'getPromotionSignalDigestDecision',
    '参照对象',
    '关键公开信号',
    '对 Groland 的判断',
    'promotionSignalBoundaryNote',
    '仅作行业机会与承接机制参照',
    '老板关注',
    '管理层持续关注',
    '重点待补',
    '美妆大盘',
    '洗护清洁',
    '抖音商城',
    '抖音电商',
    '天猫新品牌',
    '卡诗',
    '馥绿德雅',
    'Off&Relax',
    '半亩花田',
    '赫系',
    'Spes 诗裴丝',
    'KOSHINE 科欣826',
    'newpage 一页',
    '2024 618 大盘',
  ]) {
    requireIncludes(
      findings,
      'brand total promotion signal files',
      promotionSignalEvidenceSource,
      snippet,
      'Industry promotion appendix must keep the researched industry, competitor, and new-brand evidence table',
    );
  }

  for (const retiredSnippet of [
    'SelectedPromotionSignalStrip',
    'SELECTED_PROMOTION_SIGNAL_GROUPS',
    'selectedPromotionSignalStrip',
    'promotionSignalSummary',
    '附录证据覆盖摘要',
    '外部参照',
    '完整口径与来源复核',
    '主视图只展示 6 条主文引用',
    '2026 第一阶段最新信号',
    '2025 全周期行业 / 平台 / 竞品',
    '2024 低基线与历史参考',
    '缺口样本 / 待补证据',
    '经营判断',
    '怎么用于 Groland',
    '不可外推边界',
    '管理层关注 / 待补',
  ]) {
    if (promotionSignalEvidenceSource.includes(retiredSnippet)) {
      findings.push(`Industry promotion appendix must not reintroduce the retired external-reference strip snippet "${retiredSnippet}".`);
    }
  }

  requireIncludes(
    findings,
    PATHS.brandTotalPromotionSignal,
    files[PATHS.brandTotalPromotionSignal],
    "getStaticReportDomVisualAttributes('PromotionSignalEvidenceTable'",
    'Promotion signal appendix table must be wrapped as a named ReportFigure visual',
  );
  requireIncludes(
    findings,
    PATHS.routeWorksheet,
    worksheet,
    "name: 'promotion-signal-evidence-table'",
    'Route worksheet must mark industry-promotion-appendix as a compact evidence digest visual',
  );
  requireIncludes(
    findings,
    PATHS.routeWorksheet,
    worksheet,
    '不再设置默认折叠层',
    'Route worksheet must protect the industry promotion appendix from reintroducing folded audit layers',
  );
}

function auditRouteWorksheet(files, findings) {
  const pageCompositionDoc = files[PATHS.pageCompositionDoc];
  const types = files[PATHS.types];
  const worksheet = files[PATHS.routeWorksheet];

  requireIncludes(
    findings,
    PATHS.pageCompositionDoc,
    pageCompositionDoc,
    'SpecialReportRouteWorksheetItem',
    'Page composition docs must point to the typed route worksheet contract',
  );
  requireIncludes(
    findings,
    PATHS.pageCompositionDoc,
    pageCompositionDoc,
    PATHS.routeWorksheet,
    'Page composition docs must point to the GSV monthly-channel worksheet',
  );
  requireIncludes(
    findings,
    PATHS.types,
    types,
    'interface SpecialReportRouteWorksheetItem',
    'Special report types must expose the route worksheet contract',
  );
  for (const fieldName of [
    'businessQuestion',
    'answerClaim',
    'dominantVisual',
    'whyThisVisual',
    'secondaryEvidence',
    'tableDemotionDecision',
    'caveatLayer',
    'mobilePolicy',
    'gateExpectation',
  ]) {
    requireIncludes(
      findings,
      PATHS.types,
      types,
      `${fieldName}:`,
      `Route worksheet type must include field "${fieldName}"`,
    );
    requireIncludes(
      findings,
      PATHS.routeWorksheet,
      worksheet,
      `${fieldName}:`,
      `GSV monthly-channel worksheet must include field "${fieldName}"`,
    );
  }

  requireIncludes(
    findings,
    PATHS.routeWorksheet,
    worksheet,
    'GSV_MONTHLY_CHANNEL_ROUTE_WORKSHEET',
    'GSV monthly-channel worksheet must expose a stable export',
  );
  requireIncludes(
    findings,
    PATHS.routeWorksheet,
    worksheet,
    'satisfies readonly SpecialReportRouteWorksheetItem[]',
    'GSV monthly-channel worksheet must stay type-checked against the worksheet contract',
  );
  const worksheetEntryCount = countOccurrences(worksheet, 'sectionId:');
  if (worksheetEntryCount !== EXPECTED_ROUTE_WORKSHEET_SECTION_IDS.length) {
    findings.push(
      `GSV monthly-channel worksheet expected ${EXPECTED_ROUTE_WORKSHEET_SECTION_IDS.length} entries but found ${worksheetEntryCount}.`,
    );
  }
  for (const sectionId of EXPECTED_ROUTE_WORKSHEET_SECTION_IDS) {
    requireIncludes(
      findings,
      PATHS.routeWorksheet,
      worksheet,
      `sectionId: '${sectionId}'`,
      `GSV monthly-channel worksheet must cover section "${sectionId}"`,
    );
  }
  for (const fieldName of [
    'businessQuestion',
    'answerClaim',
    'dominantVisual',
    'whyThisVisual',
    'secondaryEvidence',
    'tableDemotionDecision',
    'caveatLayer',
    'mobilePolicy',
    'gateExpectation',
  ]) {
    const count = countOccurrences(worksheet, `${fieldName}:`);
    if (count !== worksheetEntryCount) {
      findings.push(
        `GSV monthly-channel worksheet field "${fieldName}" appears ${count} time(s), expected ${worksheetEntryCount}.`,
      );
    }
  }
  for (const snippet of [
    'drawer/export',
    'footnote',
    '390px',
    'approved-chart',
    'approved-static-visual',
    'not-visual',
  ]) {
    requireIncludes(
      findings,
      PATHS.routeWorksheet,
      worksheet,
      snippet,
      'GSV monthly-channel worksheet must encode table demotion, caveat, mobile, and visual-status policies',
    );
  }
}

function auditTocAndSections(files, snapshotData, findings) {
  const tocModel = files[PATHS.tocModel];
  const deferredChapters = files[PATHS.deferredChapters];
  const tocItems = readGsvSnapshotTocItems(snapshotData, PATHS.contentData, findings);
  const tocById = new Map(tocItems.map((item) => [item.id, item]));
  const duplicateTocIds = findDuplicates(tocItems.map((item) => item.id).filter(Boolean));

  if (tocItems.length !== EXPECTED_TOC_ITEMS.length) {
    findings.push(`TOC model entry count drifted; expected ${EXPECTED_TOC_ITEMS.length}, got ${tocItems.length}.`);
  }

  for (const duplicateId of duplicateTocIds) {
    findings.push(`TOC id "${duplicateId}" is duplicated in ${PATHS.contentData}.`);
  }

  const tocTitles = new Set(tocItems.map((item) => item.title).filter(Boolean));
  for (const retiredTitle of RETIRED_QUESTION_TOC_TITLES) {
    if (tocTitles.has(retiredTitle)) {
      findings.push(`Retired question-style TOC title "${retiredTitle}" must not appear in the visible business hierarchy.`);
    }
  }

  for (const expected of EXPECTED_TOC_ITEMS) {
    const actual = tocById.get(expected.id);
    if (!actual) {
      findings.push(`TOC entry "${expected.id}" is missing.`);
      continue;
    }

    for (const field of ['title', 'level']) {
      if (actual[field] !== expected[field]) {
        findings.push(`TOC entry "${expected.id}" ${field} drifted; expected "${expected[field]}", got "${actual[field]}".`);
      }
    }
    if (expected.index && actual.index !== expected.index) {
      findings.push(`TOC entry "${expected.id}" index drifted; expected "${expected.index}", got "${actual.index ?? '(none)'}".`);
    }

    if ((actual.targetId ?? null) !== (expected.targetId ?? null)) {
      findings.push(`TOC entry "${expected.id}" targetId drifted; expected "${expected.targetId ?? '(none)'}", got "${actual.targetId ?? '(none)'}".`);
    }
    if (Boolean(actual.disabled) !== Boolean(expected.disabled)) {
      findings.push(`TOC entry "${expected.id}" disabled flag drifted; expected ${Boolean(expected.disabled)}, got ${Boolean(actual.disabled)}.`);
    }
    if (Boolean(expected.groupLabel) !== isGroupLabel(actual)) {
      findings.push(`TOC entry "${expected.id}" group label behavior drifted.`);
    }
  }

  const visibleTmallTrafficTocEntries = tocItems.filter((item) => (
    !isHiddenTocAnchorItem(item)
    && (item.id === 'tmall-traffic' || item.targetId === 'tmall-traffic')
  ));
  if (
    visibleTmallTrafficTocEntries.length !== 1
    || visibleTmallTrafficTocEntries[0].id !== 'tmall-traffic'
    || visibleTmallTrafficTocEntries[0].targetId !== 'tmall-traffic'
    || visibleTmallTrafficTocEntries[0].title !== '流量'
  ) {
    findings.push(
      'Tmall traffic TOC must expose exactly one visible entry: id "tmall-traffic", targetId "tmall-traffic", title "流量".',
    );
  }
  for (const sectionId of EXPECTED_TMALL_TRAFFIC_BODY_ONLY_SECTION_IDS) {
    if (tocById.has(sectionId)) {
      findings.push(`Tmall traffic body section "${sectionId}" must not be added as a TOC entry.`);
    }
  }

  const hiddenTocIds = tocItems.filter(isHiddenTocAnchorItem).map((item) => item.id);
  for (const hiddenId of EXPECTED_HIDDEN_MICRO_TOC_IDS) {
    const item = tocById.get(hiddenId);
    if (!item) {
      findings.push(`Hidden micro TOC anchor "${hiddenId}" is missing.`);
      continue;
    }
    if (item.level !== 'micro') {
      findings.push(`Hidden micro TOC anchor "${hiddenId}" must keep level "micro"; got "${item.level}".`);
    }
    if (item.navVisibility !== 'hidden-anchor') {
      findings.push(`Hidden micro TOC anchor "${hiddenId}" must keep navVisibility="hidden-anchor"; got "${item.navVisibility ?? '(none)'}".`);
    }
  }
  for (const hiddenId of hiddenTocIds) {
    if (!EXPECTED_HIDDEN_MICRO_TOC_IDS.includes(hiddenId)) {
      findings.push(`Unexpected hidden/deep-link TOC anchor "${hiddenId}" is present.`);
    }
  }

  const compactVisibleTocIds = tocItems.filter(shouldShowCompactTocItem).map((item) => item.id);
  if (compactVisibleTocIds.join('|') !== EXPECTED_COMPACT_VISIBLE_TOC_IDS.join('|')) {
    findings.push(`Compact visible TOC ids drifted; expected ${EXPECTED_COMPACT_VISIBLE_TOC_IDS.join(', ')}, got ${compactVisibleTocIds.join(', ') || '<none>'}.`);
  }
  const desktopVisibleTocIds = tocItems.filter(shouldShowDesktopTocItem).map((item) => item.id);
  if (desktopVisibleTocIds.join('|') !== EXPECTED_DESKTOP_VISIBLE_TOC_IDS.join('|')) {
    findings.push(`Desktop visible TOC ids drifted; expected ${EXPECTED_DESKTOP_VISIBLE_TOC_IDS.join(', ')}, got ${desktopVisibleTocIds.join(', ') || '<none>'}.`);
  }
  const parentIdsByItemId = resolveTocParentIds(tocItems);
  for (const { microId, parentId } of EXPECTED_COMPACT_ACTIVE_FALLBACKS) {
    if (compactVisibleTocIds.includes(microId)) {
      findings.push(`Micro anchor "${microId}" must not appear in compact visible TOC ids.`);
    }
    const fallbackParentId = [...(parentIdsByItemId.get(microId) ?? [])]
      .reverse()
      .find((candidateId) => {
        const candidate = tocById.get(candidateId);
        return candidate ? shouldShowCompactTocItem(candidate) : false;
      });
    if (fallbackParentId !== parentId) {
      findings.push(`Compact active fallback for micro anchor "${microId}" drifted; expected "${parentId}", got "${fallbackParentId ?? '(none)'}".`);
    }
  }

  const sectionIds = collectRenderedSectionIds(files, RENDERED_SECTION_SOURCE_PATHS);
  for (const sectionId of EXPECTED_RENDERED_SECTION_IDS) {
    if (!sectionIds.has(sectionId)) {
      findings.push(`Rendered section id "${sectionId}" is missing from special report components.`);
    }
  }

  for (const item of tocItems) {
    if (item.disabled || isGroupLabel(item)) {
      continue;
    }
    const targetId = resolveTocTargetId(item);
    if (!sectionIds.has(targetId)) {
      findings.push(`Active TOC entry "${item.id}" points to missing rendered section id "${targetId}".`);
    }
  }

  requireIncludes(findings, PATHS.tocModel, tocModel, 'targetId: item.targetId ?? item.id', 'TOC model must keep targetId fallback');
  requireIncludes(findings, PATHS.tocModel, tocModel, "isGroupLabel: level === 'section' && !item.targetId", 'TOC model must keep non-link group labels');
  requireIncludes(findings, PATHS.tocModel, tocModel, "level === 'micro'", 'TOC model must keep micro entry nesting');
  requireIncludes(findings, PATHS.tocModel, tocModel, 'isHiddenTocAnchor', 'TOC model must expose hidden-anchor filtering for DOM/smoke contracts');
  requireIncludes(findings, PATHS.tocModel, tocModel, 'if (isHiddenTocAnchor(entry))', 'Desktop TOC must hide only explicit hidden anchors so semantic group rows can remain visible');
  requireIncludes(findings, PATHS.types, files[PATHS.types], "navVisibility?: 'visible' | 'hidden-anchor'", 'TOC type must keep explicit hidden-anchor semantics');
  if (tocItems.some((item) => item.navVisibility === 'hidden-anchor')) {
    findings.push(`${PATHS.contentData}: GSV channel platform-detail anchors must stay visible in the TOC hierarchy.`);
  }
  requireIncludes(findings, PATHS.tocModel, tocModel, "entry.item.navVisibility === 'hidden-anchor'", 'TOC model must hide explicit hidden-anchor entries from visible nav');
  requireIncludes(findings, PATHS.deferredChapters, deferredChapters, "report.toc.filter((item) => item.level === 'chapter' && item.disabled)", 'Deferred placeholders must derive from disabled chapter TOC entries');
  requireIncludes(findings, PATHS.deferredChapters, deferredChapters, "id={item.id}", 'Deferred placeholder article must expose the disabled chapter id');
  requireIncludes(findings, PATHS.deferredChapters, deferredChapters, "'industry-insight'", 'Industry insight placeholder copy must remain present');
  requireIncludes(findings, PATHS.deferredChapters, deferredChapters, "'competitor-analysis'", 'Competitor analysis placeholder copy must remain present');
}

function auditPublishedPlatformDetailSections(files, findings) {
  auditPublishedPlatformDetailOwners({ files, findings, paths: PATHS });

  const tmallShelfSource = extractSectionSource(files[PATHS.tmallSection], 'tmall-shelf-commerce');
  if (!tmallShelfSource) {
    findings.push(`Platform detail anchor section "tmall-shelf-commerce" is missing from ${PATHS.tmallSection}.`);
  } else {
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      tmallShelfSource,
      '<DraftPagePlaceholder />',
      'Tmall shelf-commerce anchor must not render the old draft placeholder above the product page',
    );
    requireIncludes(
      findings,
      PATHS.tmallSection,
      tmallShelfSource,
      'tmallShelfCommerceAnchor',
      'Tmall shelf-commerce anchor must stay invisible so the product page starts as a white report page',
    );
  }

  const tmallProductsSource = extractSectionSource(files[PATHS.tmallSection], 'tmall-products');
  if (!tmallProductsSource) {
    findings.push(`Platform detail refined section "tmall-products" is missing from ${PATHS.tmallSection}.`);
    return;
  }
  requireNotIncludes(
    findings,
    PATHS.tmallSection,
    tmallProductsSource,
    '<DraftPagePlaceholder />',
    'Tmall products page must no longer render the draft placeholder',
  );
  for (const snippet of [
    '品牌经营',
    '平台详情',
    '天猫',
    'pageLabel="商品"',
    'hideHeader',
    'Top商品月度贡献结构',
    '天猫商品关键判断：贡献结构',
    'businessOverviewArguments',
    'monthlyTopProducts',
    'TmallProductContributionVisual',
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      tmallProductsSource,
      snippet,
      'Tmall products refined section must expose its path, metrics, source, and trend table handles',
    );
  }
  requireIncludes(
    findings,
    PATHS.tmallSection,
    files[PATHS.tmallSection],
    'report.tmallMonthlyTopProducts',
    'Tmall products page must still derive its display rows from the static tmallMonthlyTopProducts snapshot',
  );
  for (const snippet of [
    "TMALL_PRODUCT_SCALP_90ML_LABEL = '头皮精华90ml'",
    "TMALL_PRODUCT_HAIRLINE_20ML_LABEL = '发际线精华20ml'",
    "TMALL_PRODUCT_PLATINUM_SHAMPOO_LABEL = '白金防脱洗发水'",
    '退为基本盘',
    '从独占转为底座',
    '6月较4月看双主力承接',
    '6月预估接近4月，但要看链路质量',
    'TMALL_PRODUCT_CONTRIBUTION_LABEL_MIN_SHARE = 0.2',
    '榜内净额',
    'Top3占比',
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      snippet,
      'Tmall products refined section must keep the answer-first product conclusions in the component file',
    );
  }
  requireIncludes(
    findings,
    PATHS.tmallSection,
    tmallProductsSource,
    "documentPath={['品牌经营', '平台详情', '天猫', pageLabel]}",
    'Tmall products page header must expose the exact report path as the header breadcrumb',
  );
  requireIncludes(
    findings,
    PATHS.tmallSection,
    tmallProductsSource,
    'title="头皮精华90ml退为基本盘，6月较4月看双主力承接"',
    'Tmall products page title must be a concise conclusion and not become the breadcrumb path',
  );
  const tmallProductTrendSource = extractSectionSource(files[PATHS.tmallSection], 'tmall-product-trend');
  if (!tmallProductTrendSource) {
    findings.push(`Platform detail refined section "tmall-product-trend" is missing from ${PATHS.tmallSection}.`);
  } else {
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      tmallProductTrendSource,
      '<DraftPagePlaceholder />',
      'Tmall product trend page must render its evidence instead of the draft placeholder',
    );
    for (const snippet of [
      'pageLabel="商品"',
      '6月预估较4月看双主力链路承接',
      "documentPath={['品牌经营', '平台详情', '天猫', pageLabel]}",
      '天猫商品关键判断：链路趋势',
      '核心商品链路趋势矩阵',
      'hideHeader',
      'TmallProductTrendVisualTable',
      'GSV趋势',
      '访客人数',
      '加购人数',
      '支付人数',
      '加购率',
      '支付转化率',
      '未入榜不等于真实 0',
    ]) {
      requireIncludes(
        findings,
        PATHS.tmallSection,
        tmallProductTrendSource,
        snippet,
        'Tmall product trend page must expose metric evidence, title, path, and visual handle',
      );
    }
    for (const snippet of [
      'getTmallProductTrendRole',
      '较4月承接',
      'buildTrendPointInspectTitle',
      'TmallProductMiniHitAreas',
      'data-product-trend-hit-area',
      "data-missing-top-product-cell={point.state === 'missing' ? 'true' : undefined}",
      'aria-label={title}',
      'focusable="false"',
      'tabIndex={0}',
      'data-product-estimate',
      'tmallProductMiniMissingMark',
      '6月深色标记为${TMALL_PRODUCT_JUNE_ESTIMATE_METHOD}',
      '—=未入榜不补0',
    ]) {
      requireIncludes(
        findings,
        PATHS.tmallSection,
        files[PATHS.tmallSection],
        snippet,
        'Tmall product trend visual must keep row role labels, estimate markers, and missing-value marks',
      );
    }
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      "return '6月接棒';",
      'Tmall product trend row role label must stay aligned to the double-primary conclusion wording',
    );
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      "return '双主力接棒';",
      'Tmall product trend row role label must not hide the June-vs-April baseline framing',
    );
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      tmallProductTrendSource,
      '图：核心商品1-6月',
      'Tmall product trend figure must not render a duplicated large reading-note caption under the matrix',
    );
  }
  const tmallProductDeltaSource = extractSectionSource(files[PATHS.tmallSection], 'tmall-product-delta');
  if (!tmallProductDeltaSource) {
    findings.push(`Platform detail refined section "tmall-product-delta" is missing from ${PATHS.tmallSection}.`);
  } else {
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      tmallProductDeltaSource,
      '<DraftPagePlaceholder />',
      'Tmall product delta page must render its evidence instead of the draft placeholder',
    );
    for (const snippet of [
      'pageLabel="商品"',
      '5月较4月、6月预估较4月都拆商品差额',
      "documentPath={['品牌经营', '平台详情', '天猫', pageLabel]}",
      '天猫商品关键判断：变化贡献',
      '5月较4月与6月预估较4月商品变化',
      'TmallProductDeltaContributionTable',
    ]) {
      requireIncludes(
        findings,
        PATHS.tmallSection,
        tmallProductDeltaSource,
        snippet,
        'Tmall product delta page must expose delta evidence, title, path, and visual handle',
      );
    }
  }
  const tmallProductAttributionSource = extractSectionSource(files[PATHS.tmallSection], 'tmall-product-attribution');
  if (!tmallProductAttributionSource) {
    findings.push(`Platform detail refined section "tmall-product-attribution" is missing from ${PATHS.tmallSection}.`);
  } else {
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      tmallProductAttributionSource,
      '<DraftPagePlaceholder />',
      'Tmall product attribution page must render its attribution evidence instead of the draft placeholder',
    );
    for (const snippet of [
      'pageLabel="商品"',
      '5月拖累在加购，6月承接看链路质量',
      "documentPath={['品牌经营', '平台详情', '天猫', pageLabel]}",
      '天猫商品关键判断：链路归因',
      '5月较4月与6月预估较4月商品链路归因',
      'TmallProductAttributionMatrix',
    ]) {
      requireIncludes(
        findings,
        PATHS.tmallSection,
        tmallProductAttributionSource,
        snippet,
        'Tmall product attribution page must expose the answer-first page header, conclusions, and visual handle',
      );
    }
  }
  for (const snippet of [
    '5月拖累集中在发际线精华',
    '白金仍拉动，问题不是全线失速',
    '6月承接仍要验证加购支付',
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      snippet,
      'Tmall product attribution page must keep the answer-first conclusion copy in its argument builder',
    );
  }
  for (const snippet of [
    'TMALL_PRODUCT_ATTRIBUTION_FACTORS',
    '访客',
    '加购率',
    '加购后支付率',
    '支付人均金额',
    '退款后保留率',
    '净GSV = 访客人数 × 加购率 × 加购后支付率 × 支付人均金额 × 退款后保留率',
    'LMDI 对数分解',
    '归因强度占比',
    'getAttributionStrengthShare',
    'data-attribution-share',
    '5月大促预热较4月：问题归因',
    '6月预估较4月：大促归因',
    "getStaticReportDomVisualAttributes('TmallProductAttributionMatrix'",
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      snippet,
      'Tmall product attribution visual must keep its formula, factor labels, comparison periods, and semantic static visual handle',
    );
  }
  requireIncludes(
    findings,
    PATHS.tmallSection,
    files[PATHS.tmallSection],
    'ads.taobao_trade_sale_goods_daily',
    'Tmall products refined section must keep the ADS source footnote in the component file',
  );
  for (const snippet of [
    'const TMALL_PRODUCT_TOP_LIMIT = 10;',
    'const TMALL_PRODUCT_TREND_ROW_LIMIT = 7;',
    'const TMALL_PRODUCT_CONTRIBUTION_SEGMENT_LIMIT = 4;',
    "const TMALL_PRODUCT_BASELINE_PERIOD = '2026-04';",
    'TMALL_PRODUCT_TREND_METRICS',
    "variant: 'bar-mom'",
    "variant: 'line'",
    'function isPositiveNetTmallProduct',
    'item.netAmount > 0',
    'item.rank <= TMALL_PRODUCT_TOP_LIMIT',
    'TMALL_PRODUCT_PERIODS.map((period)',
    'TmallProductMiniTrendCell',
    'getTmallProductContributionRows',
    'getTmallProductDeltaDataset',
    'getMomentumTrendPoints',
    'tmallProductMiniMomLine',
    'data-product-scale-bars="true"',
    'data-product-momentum-line="true"',
    'data-product-rate-line="true"',
    '6月预估',
    'pay_amount-refund_amount',
    '2026-06-21',
    '日均值线性预估整月',
    '空白为未入当月正净额 Top 榜，不代表真实 0',
    "data-trend-state={point.state}",
    "data-missing-top-product-cell={point.state === 'missing' ? 'true' : undefined}",
    'tmallProductFigureOnePage',
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      snippet,
      'Tmall products refined section must keep the one-page positive-net Top10 source and trend table handles',
    );
  }
  for (const snippet of [
    'getTmallProductDisplayRows',
    'TMALL_PRODUCT_JUNE_ESTIMATE_FACTOR',
    'TMALL_PRODUCT_JUNE_ESTIMATE_MONTH_DAYS',
    'TMALL_PRODUCT_JUNE_ESTIMATE_OBSERVED_DAYS',
  ]) {
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      snippet,
      'Tmall products page must consume the materialized 6月预估 static data without render-time rescaling',
    );
  }
  for (const snippet of [
    '"periodLabel": "6月预估"',
    '"payAmount": 194003.74',
    '"netAmount": 166050.47',
    '"orderCount": 800',
    '"visitorCount": 147494',
    '"monthNetAmount": 573927.29',
  ]) {
    requireIncludes(
      findings,
      PATHS.contentData,
      files[PATHS.contentData],
      snippet,
      'Tmall product static content must materialize June rows as full-month 6月预估 values',
    );
  }
  for (const snippet of [
    '商品结构',
    '变化摘要',
    '复核附录',
    '6月MTD',
    '6月为 MTD',
    '6月为MTD',
    '截至2026-06-13不能直接当月结论',
    '截至2026-06-13',
    '2026-06-13',
    '6月13',
    '6/13',
    '6/1-6/13',
    '2026-06-18',
    '6月18',
    '6/18',
    '6/1-6/18',
    '6月MTD TOP复核',
    '同页复核核心商品',
    '20ml发际线精华升至主力，90ml延续基本盘角色',
    '略高于5月',
    '6月回补',
    '大促修复',
    '修复质量',
    'EvidenceAppendix',
    'TmallMonthlyProductEvidenceAppendix',
    'TmallMonthlyTopProductMatrix',
    'TmallProductCoreTrend',
    '核心商品趋势带',
    'MetricStrip',
    'InsightRail',
  ]) {
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      snippet,
      'Tmall products page must not keep the retired matrix, core trend band, or appendix drawer',
    );
  }
  for (const snippet of [
    '2026-06-13',
    '6月13',
    '6/13',
    '6/1-6/13',
    '2026-06-18',
    '6月18',
    '6/18',
    '6/1-6/18',
  ]) {
    requireNotIncludes(
      findings,
      PATHS.contentData,
      files[PATHS.contentData],
      snippet,
      'Tmall product static content must not keep retired June observed-window dates',
    );
  }
  for (const period of EXPECTED_TMALL_PRODUCT_PERIODS) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      files[PATHS.tmallSection],
      `'${period}'`,
      'Tmall products refined section must keep a fixed 2026-01 through 2026-06 monthly matrix',
    );
  }
  findings.push(...auditSpecialReportTmallCss({
    styleMapPath: PATHS.styleMap,
    styleMapSource: files[PATHS.styleMap],
    productCssPath: PATHS.tmallProductsCss,
    productCssSource: files[PATHS.tmallProductsCss],
    trafficCssPath: PATHS.tmallTrafficCss,
    trafficCssSource: files[PATHS.tmallTrafficCss],
  }));
}

function auditTmallTrafficRefinedSections(files, findings) {
  const tmallSection = files[PATHS.tmallSection];
  const trafficAuditSource = [
    files[PATHS.contentData],
    files[PATHS.tmallSection],
    files[PATHS.routeWorksheet],
    files[PATHS.reportSourceSql],
  ].join('\n');
  const sectionExpectations = [
    {
      sectionId: 'tmall-traffic',
      visualName: 'TmallTrafficFlowVisual',
    },
    {
      sectionId: 'tmall-traffic-structure',
      visualName: 'TmallTrafficSourceRoleVisual',
    },
    {
      sectionId: 'tmall-traffic-goods-source',
      visualName: 'TmallTrafficProductSourceMatrix',
    },
    {
      sectionId: 'tmall-traffic-delta',
      visualName: 'TmallTrafficSourceDeltaVisual',
    },
    {
      sectionId: 'tmall-traffic-actions',
      visualName: 'TmallTrafficActionBoard',
    },
  ];

  for (const expected of sectionExpectations) {
    const sectionSource = extractSectionSource(tmallSection, expected.sectionId);
    if (!sectionSource) {
      findings.push(`Tmall traffic refined body section "${expected.sectionId}" is missing from ${PATHS.tmallSection}.`);
      continue;
    }
    requireNotIncludes(
      findings,
      PATHS.tmallSection,
      sectionSource,
      '<DraftPagePlaceholder />',
      `Tmall traffic refined body section "${expected.sectionId}" must render report evidence instead of the draft placeholder`,
    );
    for (const snippet of [
      'pageLabel="流量"',
      "documentPath={['品牌经营', '平台详情', '天猫', pageLabel]}",
      expected.visualName,
    ].filter(Boolean)) {
      requireIncludes(
        findings,
        PATHS.tmallSection,
        sectionSource,
        snippet,
        `Tmall traffic refined body section "${expected.sectionId}" must expose its report path, data handle, and static visual`,
      );
    }
  }

  for (const handle of [
    'tmallTrafficMonthlyFlow',
    'tmallTrafficSourceMonthlyRoles',
    'tmallTrafficProductSourceMatrix',
    'tmallTrafficSourceDeltas',
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      tmallSection,
      handle,
      'Tmall traffic refined body must consume the static traffic content handles',
    );
  }

  for (const snippet of [
    '2026-06-21',
    '6月预估',
    'ads.taobao_traffic_shop_daily',
    'ods.taobao_traffic_shop_raw',
    'source_level=1',
  ]) {
    requireIncludes(
      findings,
      'special report tmall traffic content/source',
      trafficAuditSource,
      snippet,
      'Tmall traffic refined content must retain the June estimate date and traffic source lineage',
    );
  }
  for (const snippet of [
    '加购率',
    '支付转化（基于加购）',
    'UV价值',
    'cartToPayRate',
    'data-traffic-metric-kind',
  ]) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      tmallSection,
      snippet,
      'Tmall traffic flow matrix must carry the expanded funnel metrics inside the 1-6 month matrix',
    );
  }
  requireRegex(
    findings,
    PATHS.tmallSection,
    tmallSection,
    /key: 'visitor'[\s\S]*key: 'cartRate'[\s\S]*key: 'cart'[\s\S]*key: 'cartToPayRate'[\s\S]*key: 'buyer'[\s\S]*key: 'amount'[\s\S]*key: 'uvValue'/,
    'Tmall traffic flow matrix metric order must be visitor -> cart rate -> cart -> cart-to-pay -> buyer -> amount -> UV value',
  );
  requireNotIncludes(
    findings,
    PATHS.tmallSection,
    tmallSection,
    'tmallTrafficFlowEfficiency',
    'Tmall traffic flow matrix must not keep a separate weak efficiency strip after efficiency metrics move into the matrix',
  );
  requireNotIncludes(
    findings,
    PATHS.tmallSection,
    tmallSection,
    'aria-label="品牌经营·平台详情·天猫·流量：流量页内容待补充"',
    'Tmall traffic chapter must not stay on the draft placeholder copy',
  );
  for (const sectionId of EXPECTED_TMALL_TRAFFIC_BODY_SECTION_IDS) {
    requireIncludes(
      findings,
      PATHS.tmallSection,
      tmallSection,
      `id="${sectionId}"`,
      `Tmall traffic refined body must include section id "${sectionId}"`,
    );
  }
}

function auditTmallMonthlyTopProductData(snapshotData, findings) {
  const rows = readGsvSnapshotTmallMonthlyTopProductRows(snapshotData, PATHS.contentData, findings);
  if (!rows.length) {
    return;
  }

  const rowsByPeriod = new Map();
  for (const row of rows) {
    if (!row.period) {
      findings.push(`${PATHS.contentData} has a tmallMonthlyTopProducts row without a period.`);
      continue;
    }
    if (!rowsByPeriod.has(row.period)) {
      rowsByPeriod.set(row.period, []);
    }
    rowsByPeriod.get(row.period).push(row);
  }

  for (const period of EXPECTED_TMALL_PRODUCT_PERIODS) {
    const periodRows = rowsByPeriod.get(period) ?? [];
    if (!periodRows.length) {
      findings.push(`${PATHS.contentData} must include positive-net tmallMonthlyTopProducts rows for ${period}.`);
      continue;
    }
    if (periodRows.length > 10) {
      findings.push(`${PATHS.contentData} must cap ${period} tmallMonthlyTopProducts at Top10; found ${periodRows.length}.`);
    }
    const ranks = periodRows.map((row) => row.rank).filter((rank) => rank !== null);
    const duplicateRanks = findDuplicates(ranks);
    if (duplicateRanks.length) {
      findings.push(`${PATHS.contentData} has duplicate tmallMonthlyTopProducts ranks for ${period}: ${duplicateRanks.join(', ')}.`);
    }
  }

  for (const row of rows) {
    const rowLabel = `${row.period ?? 'unknown'} #${row.rank ?? '?'}`;
    if (row.rank === null || row.rank < 1 || row.rank > 10) {
      findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must keep rank within Top10.`);
    }
    if (row.netAmount === null || row.netAmount <= 0) {
      findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must be positive netAmount; zero-net gifts are not real TOP products.`);
    }
    if (row.payAmount === null || row.refundAmount === null || row.netAmount === null) {
      findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must include payAmount/refundAmount/netAmount.`);
      continue;
    }
    for (const fieldName of ['orderCount', 'buyerCount', 'visitorCount', 'cartUserCount']) {
      if (row[fieldName] === null || row[fieldName] < 0) {
        findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must include non-negative ${fieldName}.`);
      }
    }
    if (row.period === '2026-06') {
      if (row.periodLabel !== '6月预估') {
        findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must label the materialized June rows as 6月预估.`);
      }
      if (Math.abs((row.monthNetAmount ?? 0) - 573927.29) > 0.05) {
        findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must use full-month June estimated monthNetAmount 573927.29.`);
      }
    }
    for (const fieldName of ['cartRate', 'conversionRate']) {
      const hasField = row[`has${fieldName[0].toUpperCase()}${fieldName.slice(1)}Field`];
      if (!hasField) {
        findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} must include ${fieldName} field; use null only when the rate is not comparable.`);
      } else if (row[fieldName] !== null && (row[fieldName] < 0 || row[fieldName] > 1)) {
        findings.push(`${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} ${fieldName} must be a 0-1 ratio or null.`);
      }
    }
    const expectedNet = row.payAmount - row.refundAmount;
    if (Math.abs(expectedNet - row.netAmount) > 0.05) {
      findings.push(
        `${PATHS.contentData} tmallMonthlyTopProducts ${rowLabel} netAmount must equal payAmount - refundAmount; expected ${expectedNet.toFixed(2)}, got ${row.netAmount.toFixed(2)}.`,
      );
    }
  }
}

function auditMobileAndExportStaticDom(files, findings) {
  const shell = files[PATHS.shell];
  const toc = files[PATHS.toc];
  const tocModel = files[PATHS.tocModel];
  const platformMatrix = files[PATHS.platformMatrix];
  const layoutCss = files[PATHS.layoutCss];
  const tocCss = files[PATHS.tocCss];
  const evidenceCss = files[PATHS.evidenceCss];
  const staticReportChart = files[PATHS.staticReportChart];

  requireIncludes(
    findings,
    PATHS.shell,
    shell,
    'renderToc({ ...tocProps, className: styles.tocSidebar })',
    'Desktop TOC must remain rendered in the report shell',
  );
  requireIncludes(
    findings,
    PATHS.shell,
    shell,
    'renderToc({ ...tocProps, className: styles.mobileToc, isMobile: true })',
    'Mobile TOC must remain rendered in the report shell',
  );
  requireIncludes(
    findings,
    PATHS.shell,
    shell,
    'useSpecialReportDocumentMode(location.search)',
    'Special report shell must expose export/print reportMode on documentElement for screenshots and chart force-mount',
  );
  requireIncludes(
    findings,
    PATHS.shell,
    shell,
    "document.documentElement.dataset.reportMode = mode",
    'Special report shell must set documentElement.dataset.reportMode from export/print query modes',
  );
  requireIncludes(findings, PATHS.toc, toc, 'isMobile?: boolean', 'ReportToc must keep an explicit mobile mode');
  requireIncludes(findings, PATHS.toc, toc, 'shouldShowCompactTocEntry(entry)', 'Mobile TOC must keep compact entry filtering');
  requireIncludes(findings, PATHS.toc, toc, 'resolveCompactActiveEntryId(entries, activeEntry)', 'Mobile TOC must keep compact active-entry resolution');
  requireIncludes(findings, PATHS.toc, toc, 'data-toc-entry-id={item.id}', 'TOC rows must expose stable entry ids for static/browser visible-item contracts');
  requireIncludes(findings, PATHS.toc, toc, 'data-toc-level={level}', 'TOC rows must expose levels for hidden-anchor smoke diagnostics');
  requireIncludes(findings, PATHS.toc, toc, "data-toc-hidden-anchor={isHiddenAnchor ? 'true' : 'false'}", 'TOC rows must expose hidden-anchor state when a hidden anchor accidentally renders');
  requireIncludes(findings, PATHS.toc, toc, "data-toc-marker={visibleMarker ?? ''}", 'TOC rows must expose the visible marker separately from stable decimal metadata');
  requireIncludes(findings, PATHS.toc, toc, "data-toc-status={statusLabel ?? ''}", 'TOC rows must expose disabled chapter status as a badge, not as the primary marker');
  requireIncludes(findings, PATHS.toc, toc, "data-toc-proof-index={item.level === 'micro' ? item.index : undefined}", 'TOC proof indexes must stay internal metadata for micro deep links');
  requireIncludes(findings, PATHS.toc, toc, 'data-toc-mode={tocMode}', 'TOC nav and rows must expose desktop/mobile mode handles');
  requireIncludes(findings, PATHS.toc, toc, 'data-toc-entry-count={entries.length}', 'TOC nav must expose full model entry count');
  requireIncludes(findings, PATHS.toc, toc, 'data-toc-visible-entry-count={visibleEntries.length}', 'TOC nav must expose visible entry count');
  requireIncludes(findings, PATHS.toc, toc, "data-toc-current-entry-id={mobileCurrentEntry?.item.id ?? ''}", 'Mobile compact current row must expose the visible fallback entry id');
  requireIncludes(findings, PATHS.toc, toc, 'data-toc-active-target-id={activeTargetId}', 'Mobile compact current row must expose active target id for micro-anchor fallback smoke');
  requireIncludes(findings, PATHS.toc, toc, '<details className={styles.mobileTocDetails}>', 'Mobile TOC must use collapsible details so it does not steal the first reading screen');
  requireIncludes(findings, PATHS.toc, toc, 'className={styles.mobileTocSummary}', 'Mobile TOC must expose the current reading position before the full link list');
  requireIncludes(findings, PATHS.toc, toc, 'className={styles.mobileTocLinks}', 'Mobile TOC must keep jump links inside the expanded details body');
  requireIncludes(findings, PATHS.toc, toc, 'function getTocVisibleMarker', 'TOC visible marker policy must stay explicit instead of deriving from the internal index everywhere');
  requireIncludes(findings, PATHS.toc, toc, "item.level === 'chapter'", 'TOC visible marker policy must allow Roman markers for top-level chapters only');
  requireIncludes(findings, PATHS.toc, toc, "return item.index;", 'TOC visible marker policy must render the chapter Roman marker from content');
  requireIncludes(findings, PATHS.toc, toc, 'return null;', 'TOC visible marker policy must keep all descendants title-only without decimal or micro Roman markers');
  requireIncludes(findings, PATHS.toc, toc, "return '经营总览';", 'Mobile TOC fallback label must be title-only, not a level/decimal prefix');
  requireIncludes(findings, PATHS.toc, toc, 'return entry.item.title;', 'Mobile TOC current label must be title-only');
  requireNotIncludes(findings, PATHS.toc, toc, 'function getTocLevelLabel', 'TOC must not return to generic 章/节/页 marker labels');
  requireNotIncludes(findings, PATHS.toc, toc, "页 /", 'Mobile TOC summary must not prefix current labels with generic level text');
  requireIncludes(
    findings,
    PATHS.tocModel,
    tocModel,
    '&& !entry.isGroupLabel',
    'Compact TOC must hide group labels',
  );
  requireIncludes(
    findings,
    PATHS.tocModel,
    tocModel,
    'level === \'sub\' || level === \'micro\' || (level === \'section\' && Boolean(entry.item.targetId))',
    'Compact TOC must keep report-reading jump points, including visible platform detail anchors',
  );

  const coverIndex = shell.indexOf('<SpecialReportCover report={report} />');
  const mobileTocIndex = shell.indexOf('renderToc({ ...tocProps, className: styles.mobileToc, isMobile: true })');
  if (!(coverIndex >= 0 && mobileTocIndex > coverIndex)) {
    findings.push('Mobile TOC must render after the cover so the report answer reaches the first mobile screen before navigation.');
  }

  requireRegex(
    findings,
    PATHS.layoutCss,
    layoutCss,
    /@media \(max-width: 1320px\)[\s\S]*?\.reportPage\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    'Report layout must collapse to one column before mobile TOC takes over',
  );
  requireRegex(
    findings,
    PATHS.layoutCss,
    layoutCss,
    /@media \(max-width: 640px\)[\s\S]*?\.reportPage\s*\{[\s\S]*?padding:\s*var\(--spacing-4\);/,
    'Report layout must keep compact mobile page padding',
  );
  requireRegex(
    findings,
    PATHS.tocCss,
    tocCss,
    /@media \(max-width: 1320px\)[\s\S]*?\.tocSidebar\s*\{[\s\S]*?display:\s*none;/,
    'Desktop TOC must hide at the compact breakpoint',
  );
  requireRegex(
    findings,
    PATHS.tocCss,
    tocCss,
    /@media \(max-width: 1320px\)[\s\S]*?\.mobileToc\s*\{[\s\S]*?display:\s*grid;/,
    'Mobile TOC must become visible at the compact breakpoint',
  );
  requireRegex(
    findings,
    PATHS.tocCss,
    tocCss,
    /@media \(max-width: 1320px\)[\s\S]*?\.mobileTocDetails\s*\{[\s\S]*?display:\s*grid;/,
    'Mobile TOC details must become the compact navigation container',
  );
  requireRegex(
    findings,
    PATHS.tocCss,
    tocCss,
    /@media \(max-width: 1320px\)[\s\S]*?\.mobileTocLinks\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(172px,\s*1fr\)\);/,
    'Mobile TOC expanded link body must use compact adaptive jump links',
  );
  requireRegex(
    findings,
    PATHS.tocCss,
    tocCss,
    /@media \(max-width: 640px\)[\s\S]*?\.mobileTocLinks\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    'Phone TOC expanded links must collapse to one column instead of a heavy two-column grid',
  );
  requireNotIncludes(
    findings,
    PATHS.tocCss,
    tocCss,
    'repeat(2, minmax(0, 1fr))',
    'Phone TOC must not return to the old heavy two-column grid',
  );
  requireIncludes(
    findings,
    PATHS.tocCss,
    tocCss,
    '.tocHint',
    'Mobile TOC must include a low-noise reading-order hint',
  );
  requireIncludes(
    findings,
    PATHS.platformMatrix,
    platformMatrix,
    'function MatrixMobileCard',
    'Platform matrix must provide a mobile card reading path',
  );
  requireIncludes(
    findings,
    PATHS.platformMatrix,
    platformMatrix,
    'className={matrixStyles.matrixCards}',
    'Platform matrix must render mobile summary cards beside the desktop matrix',
  );
  requireRegex(
    findings,
    PATHS.evidenceCss,
    evidenceCss,
    /@media \(max-width: 760px\)[\s\S]*?\.matrixScroller\s*\{[\s\S]*?display:\s*none;/,
    'Mobile platform matrix must hide the desktop scroller',
  );
  requireRegex(
    findings,
    PATHS.evidenceCss,
    evidenceCss,
    /@media \(max-width: 760px\)[\s\S]*?\.matrixCards\s*\{[\s\S]*?display:\s*grid;/,
    'Mobile platform matrix must show platform cards',
  );

  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "params.get('reportMode') === 'export'", 'Export mode must force static report charts to mount');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "params.get('reportMode') === 'print'", 'Print mode must force static report charts to mount');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "document.documentElement.dataset.reportMode === 'export'", 'Static report charts must keep dataset-driven export force-mount support');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "document.documentElement.dataset.reportMode === 'print'", 'Static report charts must keep dataset-driven print force-mount support');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "data-chart-mounted={shouldMountChart ? 'true' : 'false'}", 'Static report chart DOM must expose mounted state for export/browser checks');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "data-chart-rendered={isChartRendered ? 'true' : 'false'}", 'Static report chart DOM must expose rendered state for export/browser checks');
}

function auditChartBuilders(files, findings) {
  const chartBarrel = files[PATHS.chartBarrel];
  const reportChartPanel = files[PATHS.reportChartPanel];
  const reportFigure = files[PATHS.reportFigure];
  const detailCss = files[PATHS.detailCss];

  requireIncludes(findings, PATHS.chartBarrel, chartBarrel, "from './chart-options/base';", 'Special report chart barrel must expose shared chart constants');
  requireIncludes(findings, PATHS.reportChartPanel, reportChartPanel, 'ChartEvidencePanel', 'Chart evidence panel component is missing');
  requireIncludes(findings, PATHS.reportChartPanel, reportChartPanel, '<StaticReportChart', 'Chart evidence panel must render StaticReportChart');
  requireIncludes(findings, PATHS.reportFigure, reportFigure, '<span className={styles.captionLabel}>备注：</span>', 'Report figures must keep reading notes as inline remarks');
  requireIncludes(findings, PATHS.reportFigure, reportFigure, 'data-report-figure-header={hideHeader ? \'hidden\' : \'visible\'}', 'Report figures must expose hidden-header state for duplicate divider checks');
  requireIncludes(findings, PATHS.reportFigure, reportFigure, 'data-report-chart-frame=""', 'Report figure chart frames must expose a stable divider hook');
  requireNotIncludes(
    findings,
    PATHS.monthlyOverviewChart,
    files[PATHS.monthlyOverviewChart],
    "text: '月度经营规模与 MOM'",
    'Monthly overview must not reintroduce a duplicated in-canvas chart title when the page header and note already carry the context',
  );
  requireNotIncludes(
    findings,
    PATHS.platformStructureChart,
    files[PATHS.platformStructureChart],
    "text: '平台 GSV 占比结构变化'",
    'Platform share chart must not reintroduce a duplicated in-canvas chart title when the page header and note already carry the context',
  );
  requireIncludes(
    findings,
    PATHS.platformStructureChart,
    files[PATHS.platformStructureChart],
    "left: 'center'",
    'Platform share ECharts legend must remain centered after removing the duplicated chart title',
  );
  requireIncludes(
    findings,
    PATHS.reportChartTheme,
    files[PATHS.reportChartTheme],
    "position: 'left' | 'right' = 'left'",
    'Report chart corner graphics must default to the lower-left note position',
  );
  for (const templatePath of [
    PATHS.horizontalCompositionTemplate,
    PATHS.lollipopTemplate,
    PATHS.quadrantBubbleTemplate,
    PATHS.rankedBarTemplate,
  ]) {
    requireIncludes(
      findings,
      templatePath,
      files[templatePath],
      "buildReportCornerGraphic(",
      'Report chart template notes must use the shared lower-left corner graphic helper',
    );
  }
  requireRegex(
    findings,
    PATHS.detailCss,
    detailCss,
    /\.reportPageHeader\s*\+\s*\[data-report-figure\]\[data-report-figure-header='hidden'\]\s*\[data-report-chart-frame\][\s\S]*?border-top:\s*0;/,
    'First hidden-header report figure after a page header must not add a second chart-frame top divider',
  );
  requireIncludes(findings, PATHS.rankedBarTemplate, files[PATHS.rankedBarTemplate], 'buildReportRankedBarOption', 'Ranked-bar template must keep its reusable option builder');

  for (const builder of EXPECTED_CHART_BUILDERS) {
    requireIncludes(findings, PATHS.chartBarrel, chartBarrel, builder.name, `Special report chart barrel must export ${builder.name}`);
    requireRegex(
      findings,
      builder.modulePath,
      files[builder.modulePath],
      new RegExp(`export function ${escapeRegex(builder.name)}\\b`),
      `Chart builder definition is missing for ${builder.name}`,
    );
    if (!builder.optionalRouteUse) {
      requireIncludes(
        findings,
        builder.usePath,
        files[builder.usePath],
        `${builder.name}(report)`,
        `Chart builder ${builder.name} is no longer referenced by its report visual board`,
      );
    }
  }
}

function auditChartCatalog(files, findings) {
  const chartBarrel = files[PATHS.chartBarrel];
  const chartCatalog = files[PATHS.chartCatalog];
  const sectionIds = collectRenderedSectionIds(files, RENDERED_SECTION_SOURCE_PATHS);
  const catalogEntries = parseChartCatalogEntries(chartCatalog, findings);
  const catalogByBuilder = new Map(catalogEntries.map((entry) => [entry.builder, entry]));
  const duplicateBuilders = findDuplicates(catalogEntries.map((entry) => entry.builder).filter(Boolean));

  requireIncludes(findings, PATHS.chartBarrel, chartBarrel, 'SPECIAL_REPORT_CHART_CATALOG', 'Chart barrel must export the chart semantic catalog');
  requireIncludes(findings, PATHS.chartCatalog, chartCatalog, 'satisfies readonly SpecialReportChartCatalogEntry[]', 'Chart catalog must stay type-checked against its semantic entry contract');

  for (const duplicateBuilder of duplicateBuilders) {
    findings.push(`Chart catalog builder "${duplicateBuilder}" is duplicated.`);
  }

  for (const builder of EXPECTED_CHART_BUILDERS) {
    const entry = catalogByBuilder.get(builder.name);
    if (!entry) {
      findings.push(`Chart catalog entry for "${builder.name}" is missing.`);
      continue;
    }

    for (const field of ['template', 'question', 'sortRule', 'primaryValueLabel', 'evidenceDestination']) {
      const value = entry[field];
      if (!value || value.length < 4) {
        findings.push(`Chart catalog entry "${builder.name}" must keep non-empty "${field}".`);
      }
    }

    if (!EXPECTED_CHART_TEMPLATES.has(entry.template)) {
      findings.push(`Chart catalog entry "${builder.name}" uses unsupported template "${entry.template}".`);
    }

    if (!entry.evidenceDestination.startsWith('#')) {
      findings.push(`Chart catalog entry "${builder.name}" evidenceDestination must be a section hash.`);
      continue;
    }

    const destinationId = entry.evidenceDestination.slice(1);
    if (!sectionIds.has(destinationId)) {
      findings.push(`Chart catalog entry "${builder.name}" points to missing evidence destination "${entry.evidenceDestination}".`);
    }
  }

  const expectedBuilderNames = new Set(EXPECTED_CHART_BUILDERS.map((builder) => builder.name));
  for (const entry of catalogEntries) {
    if (!expectedBuilderNames.has(entry.builder)) {
      findings.push(`Chart catalog entry "${entry.builder}" is not in EXPECTED_CHART_BUILDERS.`);
    }
  }
}

function auditStaticVisualCatalog(files, findings) {
  const chartBarrel = files[PATHS.chartBarrel];
  const chartCatalog = files[PATHS.chartCatalog];
  const sectionIds = collectRenderedSectionIds(files, RENDERED_SECTION_SOURCE_PATHS);
  const catalogEntries = parseStaticVisualCatalogEntries(chartCatalog, findings);
  const catalogByVisual = new Map(catalogEntries.map((entry) => [entry.visual, entry]));

  requireIncludes(findings, PATHS.chartBarrel, chartBarrel, 'SPECIAL_REPORT_STATIC_VISUAL_CATALOG', 'Chart barrel must export the static visual catalog');
  requireIncludes(findings, PATHS.chartCatalog, chartCatalog, 'satisfies readonly SpecialReportStaticVisualCatalogEntry[]', 'Static visual catalog must stay type-checked against its semantic entry contract');

  for (const expected of EXPECTED_STATIC_VISUALS) {
    const definitionName = expected.definitionName ?? expected.name;
    const useSnippet = expected.useSnippet ?? `<${expected.name} report={report} />`;
    const entry = catalogByVisual.get(expected.name);
    if (!entry) {
      findings.push(`Static visual catalog entry for "${expected.name}" is missing.`);
      continue;
    }

    if (entry.renderer !== expected.renderer) {
      findings.push(`Static visual catalog entry "${expected.name}" renderer drifted; expected "${expected.renderer}", got "${entry.renderer}".`);
    }
    if (entry.template !== expected.template) {
      findings.push(`Static visual catalog entry "${expected.name}" template drifted; expected "${expected.template}", got "${entry.template}".`);
    }
    if (!EXPECTED_CHART_TEMPLATES.has(entry.template)) {
      findings.push(`Static visual catalog entry "${expected.name}" uses unsupported template "${entry.template}".`);
    }
    for (const field of ['question', 'sortRule', 'primaryValueLabel', 'evidenceDestination']) {
      const value = entry[field];
      if (!value || value.length < 4) {
        findings.push(`Static visual catalog entry "${expected.name}" must keep non-empty "${field}".`);
      }
    }
    if (entry.evidenceDestination !== expected.evidenceDestination) {
      findings.push(`Static visual catalog entry "${expected.name}" evidenceDestination drifted; expected "${expected.evidenceDestination}", got "${entry.evidenceDestination}".`);
    }
    if (!sectionIds.has(entry.evidenceDestination.slice(1))) {
      findings.push(`Static visual catalog entry "${expected.name}" points to missing evidence destination "${entry.evidenceDestination}".`);
    }

    requireRegex(
      findings,
      expected.definitionPath,
      files[expected.definitionPath],
      new RegExp(`export function ${escapeRegex(definitionName)}\\b`),
      `Static visual definition is missing for ${expected.name}`,
    );
    requireIncludes(
      findings,
      expected.usePath,
      files[expected.usePath],
      useSnippet,
      `Static visual ${expected.name} is no longer referenced by its report section`,
    );
    requireIncludes(
      findings,
      expected.definitionPath,
      files[expected.definitionPath],
      `getStaticReportDomVisualAttributes('${expected.name}'`,
      `Static visual ${expected.name} must use the shared semantic browser-smoke handle helper`,
    );
  }

  for (const snippet of [
    'SPECIAL_REPORT_STATIC_VISUAL_CATALOG',
    "'data-static-report-visual'",
    "'data-chart-question'",
    "'data-chart-claim'",
    "'data-chart-sort-rule'",
    "'data-chart-primary-value-label'",
    "'data-chart-evidence-destination'",
    "'data-chart-renderer'",
    "'data-chart-template'",
    "'data-gallery-fixture-id'",
  ]) {
    requireIncludes(
      findings,
      PATHS.staticDomVisual,
      files[PATHS.staticDomVisual],
      snippet,
      'Static DOM visuals must expose the same semantic browser-smoke handles as ECharts figures',
    );
  }

  const tmallVisuals = files[PATHS.tmallVisuals];
  requireIncludes(findings, PATHS.tmallVisuals, tmallVisuals, 'getSourceAmount(row.cells, column)', 'Tile heatmap must read missing source cells as missing, not zero');
  requireIncludes(findings, PATHS.tmallVisuals, tmallVisuals, 'amount === null ? styles.trafficHeatmapCellMissing', 'Tile heatmap must keep an explicit missing-cell state');
  requireIncludes(findings, PATHS.tmallVisuals, tmallVisuals, '缺失来源保持空白，不把空白补成 0', 'Matrix visual definition must state missing sources are not zero-filled');

  const priorityVisuals = files[PATHS.priorityVisuals];
  const operatingPrioritySection = files[PATHS.operatingPrioritySection];
  for (const [filePath, source] of [
    [PATHS.chartCatalog, chartCatalog],
    [PATHS.priorityVisuals, priorityVisuals],
    [PATHS.operatingPrioritySection, operatingPrioritySection],
  ]) {
    requireNotIncludes(
      findings,
      filePath,
      source,
      'PriorityActionOwnershipList',
      'Action ownership must not return as a production static visual when PriorityImpactEvidenceMatrix already answers action priority',
    );
  }
  requireIncludes(
    findings,
    PATHS.priorityVisuals,
    priorityVisuals,
    'priorityDecisionSummaryList',
    'Priority actions must keep a lightweight decision summary instead of a repeated ranked action table',
  );
}

function auditChartInstanceGalleryHandles(files, findings) {
  const catalogEntries = parseChartCatalogEntries(files[PATHS.chartCatalog], findings);
  const catalogByBuilder = new Map(catalogEntries.map((entry) => [entry.builder, entry]));
  const fixtureTemplates = new Set(
    [...files[PATHS.chartGalleryFixtures].matchAll(/\btemplate:\s*'([^']+)'/g)]
      .map((match) => match[1])
  );
  const chartInstancePaths = [
    PATHS.brandTotalSection,
    PATHS.tmallVisuals,
    PATHS.douyinVisuals,
  ];
  const seenBuilders = new Set();

  requireIncludes(
    findings,
    PATHS.reportChartPanel,
    files[PATHS.reportChartPanel],
    'data-chart-builder={chartBuilder}',
    'ChartEvidencePanel must expose builder handles on the rendered figure',
  );
  for (const snippet of [
    'data-chart-claim={takeaway}',
    'data-chart-question={chartReference.question}',
    'data-chart-sort-rule={chartReference.sortRule}',
    'data-chart-primary-value-label={chartReference.primaryValueLabel}',
    'data-chart-evidence-destination={chartReference.evidenceDestination}',
  ]) {
    requireIncludes(
      findings,
      PATHS.reportChartPanel,
      files[PATHS.reportChartPanel],
      snippet,
      'ChartEvidencePanel must expose semantic question, claim, sorting, value, and evidence-destination handles on the rendered figure',
    );
  }
  requireIncludes(
    findings,
    PATHS.reportChartPanel,
    files[PATHS.reportChartPanel],
    'data-chart-template={chartReference.template}',
    'ChartEvidencePanel must expose gallery template handles on the rendered figure',
  );
  requireIncludes(
    findings,
    PATHS.reportChartPanel,
    files[PATHS.reportChartPanel],
    'data-gallery-fixture-id={chartReference.fixtureId}',
    'ChartEvidencePanel must expose fixture handles on the rendered figure',
  );

  for (const filePath of chartInstancePaths) {
    const source = files[filePath];
    const chartPanelCount = countOccurrences(source, '<ChartEvidencePanel');
    const chartBuilderMatches = [...source.matchAll(/\bchartBuilder="([^"]+)"/g)];
    if (chartBuilderMatches.length !== chartPanelCount) {
      findings.push(`ChartEvidencePanel usage in ${filePath} must include chartBuilder= on every production figure; found ${chartBuilderMatches.length} builder props for ${chartPanelCount} panels.`);
    }

    for (const match of chartBuilderMatches) {
      const builder = match[1];
      seenBuilders.add(builder);
      const catalogEntry = catalogByBuilder.get(builder);
      if (!catalogEntry) {
        findings.push(`ChartEvidencePanel usage in ${filePath} references unknown chartBuilder "${builder}".`);
        continue;
      }
      if (!fixtureTemplates.has(catalogEntry.template)) {
        findings.push(`ChartEvidencePanel builder "${builder}" uses template "${catalogEntry.template}" without a gallery fixture.`);
      }
    }
  }

  for (const builder of EXPECTED_CHART_BUILDERS) {
    if (builder.optionalRouteUse) {
      continue;
    }
    if (!seenBuilders.has(builder.name)) {
      findings.push(`Expected chart builder "${builder.name}" to appear in a ChartEvidencePanel chartBuilder prop.`);
    }
  }
}

function auditEvidenceSummaryAndRowCaps(files, findings) {
  const reportEvidence = files[PATHS.reportEvidence];
  const reportEvidenceModel = files[PATHS.reportEvidenceModel];
  const evidenceRowCap = files[PATHS.evidenceRowCap];
  const evidenceDrawer = files[PATHS.evidenceDrawer];
  const evidenceSummary = files[PATHS.evidenceSummary];
  const evidenceTable = files[PATHS.evidenceTable];
  const evidenceTableMobileLabels = files[PATHS.evidenceTableMobileLabels];
  const evidenceTypes = files[PATHS.evidenceTypes];
  const evidenceUsageFiles = [
    PATHS.brandTotalSection,
    PATHS.tmallSection,
    PATHS.tmallEvidence,
    PATHS.tmallProductEvidence,
    PATHS.tmallTrafficMatrixEvidence,
    PATHS.tmallTrafficSourceEvidence,
    PATHS.tmallWanxiangtaiEvidence,
    PATHS.tmallDriverEvidence,
    PATHS.tmallVisuals,
    PATHS.douyinEvidence,
    PATHS.douyinVisuals,
    PATHS.douyinCommerceEvidence,
    PATHS.douyinQianchuanEvidence,
    PATHS.operatingPrioritySection,
  ];
  const evidenceUsageText = evidenceUsageFiles.map((filePath) => files[filePath]).join('\n');

  for (const snippet of [
    'EvidenceAppendix',
    'EvidenceDrawer',
    'SnapshotTable',
    'EvidenceTable',
    'EvidenceSummary',
  ]) {
    requireIncludes(
      findings,
      PATHS.reportEvidence,
      reportEvidence,
      snippet,
      'Report evidence barrel must keep the public evidence API export surface',
    );
  }
  for (const snippet of ['DEFAULT_EVIDENCE_ROW_CAP', 'getInitialEvidenceRows']) {
    requireIncludes(
      findings,
      PATHS.reportEvidenceModel,
      reportEvidenceModel,
      snippet,
      'Report evidence model barrel must keep the non-visual evidence API export surface',
    );
  }
  requireIncludes(findings, PATHS.evidenceRowCap, evidenceRowCap, 'export const DEFAULT_EVIDENCE_ROW_CAP = 8;', 'Default evidence row cap must remain 8');
  requireIncludes(findings, PATHS.evidenceRowCap, evidenceRowCap, 'rows.slice(0, limit)', 'getInitialEvidenceRows must cap rows with slice');
  requireIncludes(findings, PATHS.evidenceDrawer, evidenceDrawer, 'data-evidence-shown-count', 'Evidence drawer must expose shown count data handle');
  requireIncludes(findings, PATHS.evidenceDrawer, evidenceDrawer, 'data-evidence-total-count', 'Evidence drawer must expose total count data handle');
  requireIncludes(findings, PATHS.evidenceDrawer, evidenceDrawer, 'data-evidence-source-period', 'Evidence drawer must expose source period data handle');
  requireIncludes(findings, PATHS.evidenceTable, evidenceTable, 'enhanceEvidenceTableChildren', 'Evidence tables must derive mobile row-card labels from table headers');
  requireIncludes(findings, PATHS.evidenceTableMobileLabels, evidenceTableMobileLabels, 'collectEvidenceHeaderLabels', 'Evidence tables must derive mobile row-card labels from table headers');
  requireIncludes(findings, PATHS.evidenceTableMobileLabels, evidenceTableMobileLabels, "'data-cell-label'", 'Evidence table cells must expose mobile row-card field labels');
  requireRegex(findings, PATHS.evidenceTypes, evidenceTypes, /\bmissingEvidence\??:\s*string/, 'EvidenceSummary interface must allow missing-evidence notes');
  requireIncludes(
    findings,
    PATHS.evidenceDrawerCss,
    files[PATHS.evidenceDrawerCss],
    'content: attr(data-cell-label)',
    'Mobile evidence row cards must display field labels without horizontal table scrolling',
  );
  requireIncludes(
    findings,
    PATHS.evidenceDrawerCss,
    files[PATHS.evidenceDrawerCss],
    '.snapshotTable thead',
    'Mobile evidence row cards must visually suppress the table header while retaining table semantics',
  );
  requireRegex(findings, PATHS.evidenceSummary, evidenceSummary, /\bfunction EvidenceCoverSummary\b/, 'Evidence drawers must render a top evidence-cover summary before rows');
  requireIncludes(findings, PATHS.evidenceSummary, evidenceSummary, '排序：${sortKey}', 'Evidence drawer collapsed opener must expose compact sort-key governance');
  requireIncludes(findings, PATHS.evidenceSummary, evidenceSummary, '截取：${summary.omissionRule}', 'Evidence drawer collapsed opener must expose compact omission-rule governance');
  requireIncludes(findings, PATHS.evidenceSummary, evidenceSummary, '复核边界', 'Evidence drawer opener must read like report guidance, not machine metadata');
  requireIncludes(findings, PATHS.evidenceSummary, evidenceSummary, '逐行数值、截取规则和未覆盖缺口', 'Evidence drawer opener must explain why exact rows are secondary');
  requireIncludes(findings, PATHS.evidenceDrawer, evidenceDrawer, "summaryPlacement === 'hiddenWhenCollapsed'", 'Evidence drawer placement must explicitly support hiddenWhenCollapsed appendix summaries');
  requireNotIncludes(findings, PATHS.evidenceDrawer, evidenceDrawer, '<details open', 'Evidence drawers must stay closed by default so long tables remain secondary evidence');
  requireIncludes(findings, 'special report evidence usage', evidenceUsageText, '不把空白补成 0', 'Report evidence must state that missing values are not rendered as zero');
  requireIncludes(findings, 'special report evidence usage', evidenceUsageText, '缺失保持为空', 'Report evidence must keep missing-rate fields empty rather than drawing false zeros');
  requireIncludes(findings, 'special report evidence usage', evidenceUsageText, '不可比字段', 'Report evidence must expose not-comparable fields in top summaries');

  for (const field of EXPECTED_EVIDENCE_SUMMARY_FIELDS) {
    requireRegex(
      findings,
      PATHS.evidenceTypes,
      evidenceTypes,
      new RegExp(`\\b${escapeRegex(field)}\\??:\\s*(?:string|number)`),
      `EvidenceSummary interface must keep "${field}"`,
    );
    requireIncludes(
      findings,
      'special report evidence usage',
      evidenceUsageText,
      `${field}:`,
      `Evidence summaries must populate "${field}"`,
    );
  }

  const operatingPrioritySection = files[PATHS.operatingPrioritySection];
  requireIncludes(
    findings,
    PATHS.operatingPrioritySection,
    operatingPrioritySection,
    '<EvidenceDrawer',
    'Operating priority audit proof must stay in a collapsed evidence drawer instead of a repeated action table',
  );
  requireIncludes(
    findings,
    PATHS.operatingPrioritySection,
    operatingPrioritySection,
    'priorityEvidenceAudit',
    'Operating priority drawer must keep a lightweight evidence-index reading path',
  );
  requireNotIncludes(
    findings,
    PATHS.operatingPrioritySection,
    operatingPrioritySection,
    '<SnapshotTable',
    'Operating priority section must not reintroduce a repeated visible action table after PriorityDecisionCards',
  );

  const evidenceSummaryCount = countOccurrences(evidenceUsageText, 'evidenceSummary={{');
  if (evidenceSummaryCount < 10) {
    findings.push(`Expected at least 10 evidenceSummary blocks across special report evidence components; got ${evidenceSummaryCount}.`);
  }

  for (const { filePath, source, limit, limitIdentifier, omissionRuleSnippet } of EXPECTED_CAPPED_ROW_SOURCES) {
    const expectedLimit = limitIdentifier ?? String(limit);
    const expectedCall = `getInitialEvidenceRows(${source}, ${expectedLimit})`;
    requireIncludes(
      findings,
      filePath,
      files[filePath],
      expectedCall,
      `Evidence rows from "${source}" must remain capped with ${expectedCall}`,
    );
    if (limitIdentifier) {
      requireIncludes(
        findings,
        filePath,
        files[filePath],
        `const ${limitIdentifier} = ${limit};`,
        `Evidence row cap variable "${limitIdentifier}" must stay synchronized with the ${limit}-row report evidence contract`,
      );
    }
    if (omissionRuleSnippet) {
      requireIncludes(
        findings,
        filePath,
        files[filePath],
        omissionRuleSnippet,
        `Evidence omission copy for "${source}" must be generated from "${limitIdentifier}"`,
      );
    }
  }

  requireNotIncludes(
    findings,
    PATHS.tmallTrafficSourceEvidence,
    files[PATHS.tmallTrafficSourceEvidence],
    '仅展示前 12 个来源',
    'Tmall traffic source evidence copy must not drift from the 8-row visible cap',
  );

  auditEvidenceTableInventory(files, findings);
  auditCappedRowSourceInventory(files, findings);
}

function auditEvidenceTableInventory(files, findings) {
  const tableSourcePaths = [
    PATHS.tmallProductEvidence,
    PATHS.tmallTrafficMatrixEvidence,
    PATHS.tmallTrafficSourceEvidence,
    PATHS.tmallWanxiangtaiEvidence,
    PATHS.tmallDriverEvidence,
    PATHS.douyinEvidence,
    PATHS.douyinCommerceEvidence,
    PATHS.douyinQianchuanEvidence,
  ];

  for (const filePath of tableSourcePaths) {
    const source = files[filePath];
    for (const block of collectPairedComponentBlocks(source, 'SnapshotTable')) {
      for (const snippet of [
        'evidenceSummary={{',
        'readerAction:',
        'tableCaption="复核：',
      ]) {
        requireIncludes(
          findings,
          filePath,
          block,
          snippet,
          'Every SnapshotTable must stay a collapsed, named, reader-action evidence object',
        );
      }
    }

    for (const block of collectPairedComponentBlocks(source, 'EvidenceAppendix')) {
      for (const snippet of [
        'evidenceSummary={{',
        'readerAction:',
        'summaryLabel="复核',
      ]) {
        requireIncludes(
          findings,
          filePath,
          block,
          snippet,
          'Every EvidenceAppendix must keep its summary contract before dense rows',
        );
      }
    }
  }
}

function auditCappedRowSourceInventory(files, findings) {
  const expectedKeys = new Set(
    EXPECTED_CAPPED_ROW_SOURCES.map(({ filePath, source, limit, limitIdentifier }) => (
      `${filePath}::${source}::${limitIdentifier ?? String(limit)}`
    )),
  );
  const sourcePaths = [...new Set(EXPECTED_CAPPED_ROW_SOURCES.map((entry) => entry.filePath))];

  for (const filePath of sourcePaths) {
    const source = files[filePath];
    for (const match of source.matchAll(/getInitialEvidenceRows\(\s*([^,\n]+)\s*,\s*([^)]+?)\s*\)/g)) {
      const rowSource = match[1].trim();
      const limit = match[2].trim();
      const key = `${filePath}::${rowSource}::${limit}`;
      if (!expectedKeys.has(key)) {
        findings.push(`Capped evidence source "${rowSource}" with limit "${limit}" in ${filePath} must be registered in EXPECTED_CAPPED_ROW_SOURCES.`);
      }
    }
  }
}

function auditFormatMultipleGuard(files, findings) {
  const brandSharedModel = files[PATHS.brandSharedModel];

  requireNotIncludes(
    findings,
    PATHS.brandSharedModel,
    brandSharedModel,
    '!current',
    'formatMultiple must not treat current=0 as missing',
  );
  requireRegex(
    findings,
    PATHS.brandSharedModel,
    brandSharedModel,
    /\bcurrent\s*===\s*null\s*\|\|\s*current\s*===\s*undefined\b/,
    'formatMultiple must treat only null/undefined current values as missing',
  );
  requireRegex(
    findings,
    PATHS.brandSharedModel,
    brandSharedModel,
    /\bprevious\s*===\s*null\s*\|\|\s*previous\s*===\s*undefined\s*\|\|\s*previous\s*<=\s*0\b/,
    'formatMultiple must keep previous<=0 as the not-comparable guard',
  );
}

function auditStyleMapCollisions(files, findings) {
  const styleMap = files[PATHS.styleMap];
  const styleModulePaths = collectStyleModuleImportPaths(styleMap);
  const explicitCompositions = parseExplicitStyleMapCompositions(styleMap);
  const classModules = new Map();

  if (styleModulePaths.length === 0) {
    findings.push(`${PATHS.styleMap} must import at least one CSS Module.`);
    return;
  }

  for (const modulePath of styleModulePaths) {
    const cssModuleSource = files[modulePath];
    if (!cssModuleSource) {
      findings.push(`${PATHS.styleMap} imports ${modulePath}, but the CSS Module was not loaded by the smoke guard.`);
      continue;
    }
    for (const className of extractCssModuleClassNames(cssModuleSource)) {
      if (!classModules.has(className)) {
        classModules.set(className, new Set());
      }
      classModules.get(className).add(modulePath);
    }
  }

  for (const [className, modulePaths] of [...classModules.entries()].sort(([first], [second]) => first.localeCompare(second))) {
    if (modulePaths.size <= 1) {
      continue;
    }
    const compositionSource = explicitCompositions.get(className);
    if (!compositionSource) {
      findings.push(
        `CSS Module class key "${className}" collides across ${[...modulePaths].join(', ')}; rename it or compose it explicitly in ${PATHS.styleMap}.`
      );
      continue;
    }
    if (!new RegExp(`\\.${escapeRegex(className)}\\}`).test(compositionSource)) {
      findings.push(`Explicit style-map composition "${className}" must compose the same "${className}" key from colliding modules.`);
    }
  }
}

function auditPerformanceShape(files, findings) {
  const staticReportChart = files[PATHS.staticReportChart];
  const staticReportEchartsRuntime = files[PATHS.staticReportEchartsRuntime];
  const reportChartPanel = files[PATHS.reportChartPanel];
  const tocActive = files[PATHS.tocActive];

  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "import('echarts/core')", 'Static report chart must keep lazy ECharts runtime loading');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "import('./static-report-echarts-runtime')", 'Static report chart must keep report-only ECharts registration behind a lazy helper');
  for (const snippet of [
    "import { BarChart, LineChart, ScatterChart } from 'echarts/charts'",
    'GridSimpleComponent',
    'LegendComponent',
    'MarkLineComponent',
    "import { CanvasRenderer } from 'echarts/renderers'",
    'registerStaticReportEChartsModules',
  ]) {
    requireIncludes(findings, PATHS.staticReportEchartsRuntime, staticReportEchartsRuntime, snippet, 'Static report ECharts helper must use typed named imports for tree-shaking');
  }
  requireNotIncludes(findings, PATHS.staticReportEchartsRuntime, staticReportEchartsRuntime, 'HeatmapChart', 'Static report ECharts helper must not register heatmap for DOM-rendered matrix visuals');
  requireNotIncludes(findings, PATHS.staticReportEchartsRuntime, staticReportEchartsRuntime, 'VisualMapComponent', 'Static report ECharts helper must not register visualMap for DOM-rendered matrix visuals');
  requireNotIncludes(findings, PATHS.staticReportEchartsRuntime, staticReportEchartsRuntime, 'TooltipComponent', 'Static report ECharts helper must keep tooltips behind the lean DOM adapter');
  requireNotIncludes(findings, PATHS.staticReportEchartsRuntime, staticReportEchartsRuntime, 'GridComponent', 'Static report ECharts helper must keep the lean GridSimpleComponent registration');
  requireNotIncludes(findings, PATHS.staticReportEchartsRuntime, staticReportEchartsRuntime, "from 'echarts'", 'Static report ECharts helper must not import the full ECharts bundle');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, "@/lib/echarts/lean-tooltip", 'Static report charts must use the lean DOM tooltip adapter');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, 'IntersectionObserver', 'Static report charts must keep near-viewport lazy mounting');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, 'shouldForceMountReportCharts', 'Static report charts must keep export/print force-mount path');
  requireIncludes(findings, PATHS.staticReportChart, staticReportChart, 'requestAnimationFrame', 'Static report charts must schedule visible chart work with animation frame');
  requireIncludes(findings, PATHS.reportChartPanel, reportChartPanel, "size?: 'large' | 'medium'", 'Chart evidence panel must keep stable size variants');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'const INITIAL_RECONCILE_DELAYS_MS = [120, 360, 900, 1600] as const', 'Report TOC initial reconciliation must stay bounded');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'const passiveListenerOptions = { passive: true } as const', 'Report TOC active listeners must stay passive');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'getScrollObservedTargets', 'Report TOC scroll observer must keep a visible-only target set');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'getDeepLinkTargets', 'Report TOC hash/deep-link sync must keep a target set that includes hidden proof anchors');
  requireIncludes(findings, PATHS.tocActive, tocActive, '!isHiddenTocAnchor(entry)', 'Report TOC scroll observed targets must exclude hidden proof anchors');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'deepLinkTargetIdSet.has(hashTargetId)', 'Report TOC hash sync must allow hidden micro deep-link anchors to become raw active targets');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'frameId !== null || timeoutId !== null', 'Report TOC active logic must coalesce scroll/resize work');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'window.requestAnimationFrame', 'Report TOC active logic must defer layout measurement to rAF');
  requireIncludes(findings, PATHS.tocActive, tocActive, "document.visibilityState === 'hidden'", 'Report TOC active logic must keep hidden-tab scheduling fallback');
  requireIncludes(
    findings,
    PATHS.tocActive,
    tocActive,
    ["window.addEventListener('sc", "roll', scheduleResolve, passiveListenerOptions)"].join(''),
    'Report TOC scroll listener must use the passive rAF scheduler',
  );
  requireIncludes(findings, PATHS.tocActive, tocActive, 'observer?.disconnect();', 'Report TOC observer must be disconnected on cleanup');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'window.cancelAnimationFrame(frameId)', 'Report TOC scheduled rAF must be canceled on cleanup');
  requireIncludes(findings, PATHS.tocActive, tocActive, 'scroll/resize events never run layout measurement directly', 'Report TOC performance comment must explain the intentional listener shape');
}

function collectStyleModuleImportPaths(styleMapSource) {
  return [...styleMapSource.matchAll(/^import\s+\w+\s+from\s+'([^']+\.module\.css)';/gm)]
    .map((match) => path.posix.normalize(path.posix.join('apps/web-vite/src/app/reports/special/_components', match[1])))
    .sort();
}

function parseExplicitStyleMapCompositions(styleMapSource) {
  const compositions = new Map();

  for (const match of styleMapSource.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*`([^`]+)`/gm)) {
    const [, className, compositionSource] = match;
    const referenceCount = (compositionSource.match(/\$\{[^}]+\}/g) ?? []).length;
    if (referenceCount >= 2) {
      compositions.set(className, compositionSource);
    }
  }

  return compositions;
}

function extractCssModuleClassNames(cssModuleSource) {
  return new Set(
    [...cssModuleSource.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)]
      .map((match) => match[1])
  );
}

function parseChartCatalogEntries(chartCatalogSource, findings) {
  const catalogBlockMatch = chartCatalogSource.match(/SPECIAL_REPORT_CHART_CATALOG\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!catalogBlockMatch) {
    findings.push(`Could not parse SPECIAL_REPORT_CHART_CATALOG from ${PATHS.chartCatalog}.`);
    return [];
  }

  return [...catalogBlockMatch[1].matchAll(/\{([\s\S]*?)\}/g)].map((match) => {
    const raw = match[1];
    return {
      raw,
      builder: readStringField(raw, 'builder'),
      template: readStringField(raw, 'template'),
      question: readStringField(raw, 'question'),
      sortRule: readStringField(raw, 'sortRule'),
      primaryValueLabel: readStringField(raw, 'primaryValueLabel'),
      evidenceDestination: readStringField(raw, 'evidenceDestination'),
    };
  });
}

function parseStaticVisualCatalogEntries(chartCatalogSource, findings) {
  const catalogBlockMatch = chartCatalogSource.match(/SPECIAL_REPORT_STATIC_VISUAL_CATALOG\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!catalogBlockMatch) {
    findings.push(`Could not parse SPECIAL_REPORT_STATIC_VISUAL_CATALOG from ${PATHS.chartCatalog}.`);
    return [];
  }

  return [...catalogBlockMatch[1].matchAll(/\{([\s\S]*?)\}/g)].map((match) => {
    const raw = match[1];
    return {
      raw,
      visual: readStringField(raw, 'visual'),
      renderer: readStringField(raw, 'renderer'),
      template: readStringField(raw, 'template'),
      question: readStringField(raw, 'question'),
      sortRule: readStringField(raw, 'sortRule'),
      primaryValueLabel: readStringField(raw, 'primaryValueLabel'),
      evidenceDestination: readStringField(raw, 'evidenceDestination'),
    };
  });
}

function resolveTocParentIds(tocItems) {
  const parentIdsByItemId = new Map();
  let currentChapter = null;
  let currentSection = null;
  let currentSub = null;

  for (const item of tocItems) {
    const level = item.level ?? 'sub';
    const parents = [];

    if (level === 'chapter') {
      currentChapter = item.id;
      currentSection = null;
      currentSub = null;
    } else if (level === 'section') {
      if (currentChapter) {
        parents.push(currentChapter);
      }
      currentSection = item.id;
      currentSub = null;
    } else if (level === 'sub') {
      if (currentChapter) {
        parents.push(currentChapter);
      }
      if (currentSection) {
        parents.push(currentSection);
      }
      currentSub = item.id;
    } else if (level === 'micro') {
      if (currentChapter) {
        parents.push(currentChapter);
      }
      if (currentSection) {
        parents.push(currentSection);
      }
      if (currentSub) {
        parents.push(currentSub);
      }
    }

    parentIdsByItemId.set(item.id, parents);
  }

  return parentIdsByItemId;
}

function isGroupLabel(item) {
  return item.level === 'section' && !item.targetId;
}

function isHiddenTocAnchorItem(item) {
  return item.navVisibility === 'hidden-anchor';
}

function shouldShowCompactTocItem(item) {
  const level = item.level ?? 'sub';
  return (
    !isHiddenTocAnchorItem(item)
    && !isGroupLabel(item)
    && !item.disabled
    && (level === 'sub' || level === 'micro' || (level === 'section' && Boolean(item.targetId)))
  );
}

function shouldShowDesktopTocItem(item) {
  return !isHiddenTocAnchorItem(item);
}

function resolveTocTargetId(item) {
  return item.targetId ?? item.id;
}

function countStringArrayEntries(source, fieldName) {
  const blockMatch = source.match(new RegExp(`\\b${escapeRegex(fieldName)}:\\s*\\[([\\s\\S]*?)\\],`));
  if (!blockMatch) {
    return 0;
  }
  return [...blockMatch[1].matchAll(/'[^']+'/g)].length;
}

function readStringField(rawObjectText, fieldName) {
  const match = rawObjectText.match(new RegExp(`\\b${escapeRegex(fieldName)}:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

function collectPairedComponentBlocks(source, componentName) {
  return [...source.matchAll(new RegExp(`<${escapeRegex(componentName)}\\b[\\s\\S]*?<\\/${escapeRegex(componentName)}>`, 'g'))]
    .map((match) => match[0]);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...duplicates].sort();
}

function requireIncludes(findings, filePath, source, needle, message) {
  if (!source.includes(needle)) {
    findings.push(`${message}: ${filePath} must include ${JSON.stringify(needle)}.`);
  }
}

function requireNotIncludes(findings, filePath, source, needle, message) {
  if (source.includes(needle)) {
    findings.push(`${message}: ${filePath} must not include ${JSON.stringify(needle)}.`);
  }
}

function requireRegex(findings, filePath, source, pattern, message) {
  if (!pattern.test(source)) {
    findings.push(`${message}: ${filePath} must match ${pattern}.`);
  }
}

function countOccurrences(source, needle) {
  if (!needle) {
    return 0;
  }
  return source.split(needle).length - 1;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
