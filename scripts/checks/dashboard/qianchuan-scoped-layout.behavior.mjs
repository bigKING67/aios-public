#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

const sources = {
  content: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-content.tsx',
  contentStyles: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-content.module.css',
  columns: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-columns.tsx',
  tableState: 'apps/web-vite/src/app/dashboard/_components/dashboard-table-state.tsx',
  filterHeader: 'apps/web-vite/src/app/dashboard/_components/dashboard-filter-header.tsx',
  platformThumbMotion: 'apps/web-vite/src/app/dashboard/_components/dashboard-platform-thumb-motion.ts',
  topBarStyles: 'apps/web-vite/src/app/dashboard/_components/dashboard-filter-header.module.css',
  filterControlStyles: 'apps/web-vite/src/app/dashboard/_components/dashboard-filter-header-controls.module.css',
  filterTabStyles: 'apps/web-vite/src/app/dashboard/_components/dashboard-filter-header-tabs.module.css',
  filterTabButtonStyles: 'apps/web-vite/src/app/dashboard/_components/dashboard-filter-header-tab-button.module.css',
  dimensionNavStyles: 'apps/web-vite/src/app/dashboard/_components/dashboard-dimension-nav.module.css',
  dashboardTokens: 'apps/web-vite/src/app/dashboard/_components/dashboard-token-aliases.css',
  detailExport: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-detail-export.ts',
  detailExportActions: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-detail-export-actions.ts',
  exportShared: 'apps/web-vite/src/app/dashboard/_components/dashboard-export.ts',
  pageContentController: 'apps/web-vite/src/app/dashboard/_components/dashboard-page-content-controller.ts',
  types: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-types.ts',
  metricCardSection: 'apps/web-vite/src/app/dashboard/_components/dashboard-metric-card-section.tsx',
  metricCardGrid: 'apps/web-vite/src/app/dashboard/_components/dashboard-metric-card-grid.module.css',
  trendOption: 'apps/web-vite/src/app/dashboard/_components/dashboard-qianchuan-trend-option.ts',
  backend: 'backend-rust/src/dashboard/qianchuan/mod.rs',
  backendMaterialScopes: 'backend-rust/src/dashboard/qianchuan/material_scopes.rs',
};

function readSource(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludes(sourceText, expected, message) {
  assert.match(sourceText, new RegExp(escapeRegExp(expected), 'u'), message);
}

function assertNotIncludes(sourceText, unexpected, message) {
  assert.doesNotMatch(sourceText, new RegExp(escapeRegExp(unexpected), 'u'), message);
}

function assertMatches(sourceText, pattern, message) {
  assert.match(sourceText, pattern, message);
}

function assertDoesNotMatch(sourceText, pattern, message) {
  assert.doesNotMatch(sourceText, pattern, message);
}

function assertParsesAsTsx(sourceText, relativePath) {
  const scriptKind = relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  assert.equal(parsed.parseDiagnostics.length, 0, `${relativePath} should parse as TypeScript/TSX`);
}

const content = readSource(sources.content);
const contentStyles = readSource(sources.contentStyles);
const columns = readSource(sources.columns);
const tableState = readSource(sources.tableState);
const filterHeader = readSource(sources.filterHeader);
const platformThumbMotion = readSource(sources.platformThumbMotion);
const topBarStyles = readSource(sources.topBarStyles);
const filterControlStyles = readSource(sources.filterControlStyles);
const filterTabStyles = readSource(sources.filterTabStyles);
const filterTabButtonStyles = readSource(sources.filterTabButtonStyles);
const dimensionNavStyles = readSource(sources.dimensionNavStyles);
const dashboardTokens = readSource(sources.dashboardTokens);
const detailExport = readSource(sources.detailExport);
const detailExportActions = readSource(sources.detailExportActions);
const exportShared = readSource(sources.exportShared);
const pageContentController = readSource(sources.pageContentController);
const types = readSource(sources.types);
const metricCardSection = readSource(sources.metricCardSection);
const metricCardGrid = readSource(sources.metricCardGrid);
const trendOption = readSource(sources.trendOption);
const backend = readSource(sources.backend);
const backendMaterialScopes = readSource(sources.backendMaterialScopes);
const LEGACY_LIVE_VIDEO_LABEL = '视频' + '素材';

for (const [name, sourceText] of Object.entries({
  content,
  columns,
  backend,
  backendMaterialScopes,
})) {
  assertDoesNotMatch(
    sourceText,
    new RegExp(escapeRegExp(LEGACY_LIVE_VIDEO_LABEL), 'u'),
    `${name} should not expose the legacy live_video label`
  );
}

for (const relativePath of [
  sources.content,
  sources.columns,
  sources.tableState,
  sources.filterHeader,
  sources.platformThumbMotion,
  sources.detailExport,
  sources.detailExportActions,
  sources.exportShared,
  sources.pageContentController,
  sources.types,
  sources.metricCardSection,
  sources.trendOption,
]) {
  assertParsesAsTsx(readSource(relativePath), relativePath);
}

assertIncludes(content, 'Segmented<DashboardQianchuanMaterialScopeKey>', 'qianchuan page should keep Segmented scope control');
assertIncludes(content, 'DashboardMetricCardSection', 'qianchuan page should keep compact KPI card section');
assertIncludes(content, 'DashboardChart', 'qianchuan page should keep scoped trend chart');
assertIncludes(
  content,
  'name="dashboard-qianchuan-material-scope"',
  'scope control should keep a stable qianchuan form name'
);
assertIncludes(content, 'options={QIANCHUAN_SCOPE_OPTIONS}', 'scope control should use the qianchuan scope options');
assertNotIncludes(
  content,
  'QIANCHUAN_SCOPE_DESCRIPTIONS',
  'qianchuan KPI header should not render redundant scope description copy'
);
assertNotIncludes(
  content,
  'scopeDescription',
  'qianchuan KPI header should not reserve layout for redundant explanatory copy'
);
assertNotIncludes(
  content,
  'aria-label="千川看板数据范围"',
  'qianchuan KPI header should not duplicate the global date filter with data-range pills'
);
assertNotIncludes(content, 'formatDateBounds', 'qianchuan KPI header should not format visible date-range pills');
assertNotIncludes(content, 'formatDate(responseData?.asOfDate)', 'qianchuan KPI header should not format visible as-of pills');
assertNotIncludes(content, "styles.metaLabel}>明细", 'qianchuan KPI header should not show redundant detail-count pills');
assertNotIncludes(
  content,
  'getTrendSubtitle(activeScope)',
  'qianchuan trend should not render redundant explanatory subtitle'
);
assertNotIncludes(
  content,
  'function getTrendSubtitle',
  'qianchuan trend should remove the redundant explanatory subtitle helper'
);
for (const className of ['.scopeDescription', '.metaList', '.metaItem', '.metaLabel']) {
  assertNotIncludes(contentStyles, className, `qianchuan styles should remove redundant KPI header class ${className}`);
}
assertMatches(
  content,
  /QIANCHUAN_TOP_METRICS[\s\S]*key:\s*'overall_cost'[\s\S]*label:\s*'整体消耗'[\s\S]*key:\s*'overall_gmv'[\s\S]*label:\s*'整体成交金额'[\s\S]*key:\s*'overall_pay_roi'[\s\S]*label:\s*'整体支付 ROI'[\s\S]*key:\s*'net_gmv_roi'[\s\S]*label:\s*'净成交 ROI'/u,
  'all-scope top metric cards should be 整体消耗 / 整体成交金额 / 整体支付 ROI / 净成交 ROI'
);
assertMatches(
  content,
  /QIANCHUAN_ALL_BOTTOM_METRIC_ROWS[\s\S]*key:\s*'net_gmv'[\s\S]*label:\s*'净成交金额'[\s\S]*key:\s*'net_order_cost'[\s\S]*label:\s*'净成交订单成本'[\s\S]*key:\s*'refund_rate_1h'[\s\S]*label:\s*'1小时内退款率'[\s\S]*key:\s*'settlement_roi_7d'[\s\S]*label:\s*'7日结算 ROI'[\s\S]*key:\s*'settlement_roi_14d'[\s\S]*label:\s*'14日结算 ROI'[\s\S]*key:\s*'settlement_roi_30d'[\s\S]*label:\s*'30日结算 ROI'/u,
  'all-scope bottom metric cards should be 净成交 + 退款/结算 ROI in the requested order'
);
assertMatches(
  content,
  /QIANCHUAN_SCOPED_TOP_METRICS[\s\S]*key:\s*'overall_cost'[\s\S]*label:\s*'整体消耗'[\s\S]*key:\s*'overall_gmv'[\s\S]*label:\s*'整体成交'[\s\S]*key:\s*'overall_pay_roi'[\s\S]*label:\s*'支付 ROI'[\s\S]*key:\s*'overall_cost_share'[\s\S]*label:\s*'消耗占比'/u,
  'video and live-room-screen scopes should render top 4 cards: 整体消耗 / 整体成交 / 支付 ROI / 消耗占比'
);
assertMatches(
  content,
  /QIANCHUAN_SCOPED_BOTTOM_METRIC_ROWS[\s\S]*key:\s*'overall_impression_count'[\s\S]*label:\s*'展示次数'[\s\S]*key:\s*'overall_click_count'[\s\S]*label:\s*'点击次数'[\s\S]*key:\s*'overall_click_rate'[\s\S]*label:\s*'点击率'[\s\S]*key:\s*'overall_conversion_rate'[\s\S]*label:\s*'转化率'[\s\S]*key:\s*'overall_order_count'[\s\S]*label:\s*'成交订单数'[\s\S]*key:\s*'overall_cpm'[\s\S]*label:\s*'CPM'/u,
  'video and live-room-screen scopes should render bottom 6 cards: 展示次数 / 点击次数 / 点击率 / 转化率 / 成交订单数 / CPM'
);
assertIncludes(
  content,
  'withDerivedCostShare(activeScope, activeCurrentTotals, legacyCurrentTotals)',
  'scoped metric cards should derive current 消耗占比 from scope cost over all cost'
);
assertIncludes(
  content,
  'withDerivedCostShare(activeScope, activePreviousTotals, legacyPreviousTotals)',
  'scoped metric cards should derive previous 消耗占比 for period-over-period comparison'
);
assertIncludes(content, 'bottomGridColumnCounts: [6]', 'all-scope metric cards should render as 4 + 6 rows');
assertIncludes(
  content,
  'bottomCardRows={metricCardGroups.bottomCardRows}',
  'qianchuan page should pass explicit all-scope metric rows'
);
assertIncludes(metricCardSection, 'bottomCardRows?: LiveMetricCard[][]', 'metric card section should support explicit rows');
assertIncludes(metricCardSection, 'bottomGridColumnCounts?: number[]', 'metric card section should support row column counts');
assertIncludes(metricCardGrid, '.metricGridThree', 'metric grid should provide a 3-column row class');
assertIncludes(metricCardGrid, '.metricGridFour', 'metric grid should provide a 4-column row class');

assertMatches(
  content,
  /QIANCHUAN_SCOPE_OPTIONS[\s\S]*label:\s*'全部'[\s\S]*value:\s*'all'[\s\S]*label:\s*'视频'[\s\S]*value:\s*'video'[\s\S]*label:\s*'直播间画面'[\s\S]*value:\s*'liveRoomScreen'/u,
  'qianchuan scope labels should be 全部 / 视频 / 直播间画面'
);
assertMatches(
  types,
  /DashboardQianchuanMaterialScopeKey\s*=\s*'all'\s*\|\s*'video'\s*\|\s*'liveRoomScreen'/u,
  'qianchuan scope type should preserve the three supported scopes'
);

assertIncludes(
  content,
  "const showMaterialTypeMix = activeScope === 'all';",
  'all scope should show material type comparison'
);
assertIncludes(
  content,
  "const showLiveRoomScreen = activeScope !== 'video';",
  'video scope should hide live-room-screen detail'
);
assertIncludes(
  content,
  "const showLiveVideo = activeScope !== 'liveRoomScreen';",
  'live-room-screen scope should hide video detail'
);
assertIncludes(content, "title: '视频 / 直播间画面对比'", 'all scope should show the comparison table');
assertIncludes(content, "title: '视频'", 'video detail section title should be 视频');
assertIncludes(content, "title: '直播间画面'", 'live-room detail section title should be 直播间画面');
assertIncludes(
  filterHeader,
  '<header className={styles.topBarDock}>',
  'dashboard filter header should use a top-level sticky dock as the viewport mask'
);
assertIncludes(
  filterHeader,
  '<div className={styles.topBar}>',
  'dashboard filter visual card should sit inside the sticky dock'
);
assertIncludes(
  filterHeader,
  'className={tabStyles.tabRailThumb}',
  'dashboard platform switcher should render a shared sliding active pill like the date segmented control'
);
assertIncludes(
  filterHeader,
  'tabButtonStyles.tabButtonActiveWithThumb',
  'dashboard platform switcher should keep button text active while delegating the fill to the sliding thumb'
);
assertIncludes(
  filterHeader,
  'useDashboardPlatformThumb({ activeTab, visibleTabs })',
  'dashboard platform switcher should consume the route-owned thumb motion hook'
);
assertIncludes(
  filterHeader,
  'isPlatformThumbReady ? tabStyles.tabRailMotionReady : undefined',
  'dashboard platform switcher should only reveal the shared thumb after measurement'
);
assertIncludes(
  filterHeader,
  'registerPlatformButton(item.key)',
  'dashboard platform switcher should register platform button nodes for thumb measurement'
);
assertDoesNotMatch(
  filterHeader,
  /thumbElement\.animate|ResizeObserver|formatPlatformThumbTransform|parseTransitionDurationMs|useLayoutEffect/u,
  'dashboard filter header should keep platform thumb motion implementation in the route-owned hook'
);
assertIncludes(
  platformThumbMotion,
  'animatePlatformThumb(nextThumb)',
  'dashboard platform switcher should use a runtime thumb animation so route rerenders do not suppress visible motion'
);
assertIncludes(
  platformThumbMotion,
  "document.visibilityState !== 'visible'",
  'dashboard platform switcher should avoid paused WAAPI thumb animations in background validation tabs'
);
assertIncludes(
  platformThumbMotion,
  "window.matchMedia('(prefers-reduced-motion: reduce)').matches",
  'dashboard platform switcher should skip runtime thumb motion for reduced-motion users'
);
assertIncludes(
  platformThumbMotion,
  "typeof thumbElement.animate === 'function'",
  'dashboard platform switcher should tolerate browsers without WAAPI animate support'
);
assertIncludes(
  platformThumbMotion,
  'runningAnimations.forEach((animation) => animation.cancel())',
  'dashboard platform switcher should cancel stale thumb animations during quick switching'
);
assertMatches(
  platformThumbMotion,
  /runningAnimations\.forEach\(\(animation\) => animation\.cancel\(\)\);[\s\S]*?return;[\s\S]*?const computedStyle/u,
  'dashboard platform switcher should cancel stale WAAPI animations before hidden/reduced-motion early returns'
);
assertIncludes(
  platformThumbMotion,
  'activeButton.offsetLeft + activeWidth / 2 - baseWidth / 2',
  'dashboard platform thumb should anchor width morphs from the active button center'
);
assertIncludes(
  platformThumbMotion,
  "'--dashboard-platform-thumb-origin-left': `${platformThumb.originLeft}px`",
  'dashboard platform thumb should expose the centered origin-left CSS variable'
);
assertIncludes(
  platformThumbMotion,
  "'--dashboard-platform-thumb-radius-x': `${platformThumb.radiusX.toFixed(2)}px`",
  'dashboard platform thumb should compensate horizontal radius while using scaleX width morphs'
);
assertIncludes(
  platformThumbMotion,
  "window.visualViewport?.addEventListener('resize', schedulePlatformThumbUpdate)",
  'dashboard platform thumb should remeasure on viewport/media-query resizes even when ResizeObserver misses a transition'
);
assertIncludes(
  platformThumbMotion,
  'if (animationFrame !== null)',
  'dashboard platform thumb should coalesce repeated resize signals into one pending animation frame'
);
assertMatches(
  platformThumbMotion,
  /animationFrame = window\.requestAnimationFrame\(\(\) => \{[\s\S]*?animationFrame = null;[\s\S]*?runPlatformThumbUpdate\(\);[\s\S]*?\}\);/u,
  'dashboard platform thumb should measure geometry only inside the scheduled animation frame'
);
assertDoesNotMatch(
  platformThumbMotion,
  /const schedulePlatformThumbUpdate = \(\) => \{[\s\S]*?runPlatformThumbUpdate\(\);[\s\S]*?window\.requestAnimationFrame/u,
  'dashboard platform thumb resize scheduler should not measure geometry synchronously before its animation frame'
);
assertIncludes(
  platformThumbMotion,
  'PLATFORM_THUMB_VIEWPORT_POLL_INTERVAL_MS',
  'dashboard platform thumb should keep a bounded viewport signature fallback for resize signals missed by CDP/mobile emulation'
);
assertIncludes(
  platformThumbMotion,
  'schedulePlatformThumbUpdateIfViewportChanged',
  'dashboard platform thumb should self-heal when the viewport changes without a resize event'
);
assertIncludes(
  platformThumbMotion,
  'window.clearInterval(viewportRemeasureInterval)',
  'dashboard platform thumb viewport fallback should be cleaned up with the hook'
);
assertMatches(
  filterTabStyles,
  /\.tabRail\s*\{[\s\S]*?position:\s*relative;[\s\S]*?isolation:\s*isolate;/u,
  'dashboard platform rail should own the absolute sliding thumb layer'
);
assertMatches(
  filterTabStyles,
  /\.tabRailThumb\s*\{[\s\S]*?width:\s*var\(--dashboard-platform-thumb-base-width,\s*1px\);[\s\S]*?border-radius:[\s\S]*?var\(--dashboard-platform-thumb-radius-x,\s*var\(--border-radius-full\)\)[\s\S]*?var\(--dashboard-platform-thumb-radius-y,\s*var\(--border-radius-full\)\);[\s\S]*?background-color:\s*var\(--brand-primary\);[\s\S]*?transform:\s*translate3d\(var\(--dashboard-platform-thumb-origin-left,\s*0\),\s*0,\s*0\)[\s\S]*?scaleX\(var\(--dashboard-platform-thumb-scale-x,\s*1\)\);[\s\S]*?transform-origin:\s*center center;/u,
  'dashboard platform thumb should use centered transform morphs with radius compensation like a stable pill'
);
assertMatches(
  platformThumbMotion,
  /thumbElement\.animate\([\s\S]*?borderRadius:\s*formatPlatformThumbBorderRadius\(previousThumb\)[\s\S]*?duration:\s*transitionDurationMs[\s\S]*?easing:\s*transitionEasing/u,
  'dashboard platform thumb should move with a restrained tokenized runtime transform animation'
);
assertIncludes(
  platformThumbMotion,
  "computedStyle.getPropertyValue('--transition-easing-out').trim()",
  'dashboard platform thumb should prefer the tokenized out easing for calmer switches'
);
assertDoesNotMatch(
  filterTabStyles,
  /\.tabRailThumb\s*\{[\s\S]*?transition:[\s\S]*?transform\s+var/u,
  'dashboard platform thumb should avoid paused CSS transform transitions in hidden tabs'
);
assertDoesNotMatch(
  filterTabStyles,
  /\.tabRailThumb\s*\{[\s\S]*?transition:[\s\S]*?width\s+var/u,
  'dashboard platform thumb should not animate width when smoothing long/short tab switches'
);
assertMatches(
  filterTabStyles,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.tabRailThumb\s*\{[\s\S]*?transition:\s*none;/u,
  'dashboard platform thumb should disable transform-heavy motion for reduced-motion users'
);
assertMatches(
  filterTabButtonStyles,
  /\.tabButtonActiveWithThumb,[\s\S]*?\.tabButtonActiveWithThumb:hover\s*\{[\s\S]*?background-color:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/u,
  'dashboard platform active button should not paint a second fill over the shared thumb'
);
assertMatches(
  filterTabButtonStyles,
  /\.tabButton\s*\{[\s\S]*?border-radius:\s*var\(--border-radius-full\);/u,
  'dashboard platform hover/focus pills should share the same full-radius capsule grammar as the active thumb'
);
assertMatches(
  dashboardTokens,
  /--dashboard-selection-compact-height:\s*var\(--spacing-8\);[\s\S]*?--dashboard-selection-compact-min-width:\s*calc\(var\(--spacing-8\)\s*\+\s*var\(--spacing-6\)\);[\s\S]*?--dashboard-selection-tile-radius:\s*calc\(var\(--border-radius-2xl\)\s*\+\s*var\(--spacing-1\)\);/u,
  'dashboard selected controls should use token-derived compact pill and large tile geometry'
);
assertMatches(
  filterTabButtonStyles,
  /\.tabButton\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?min-height:\s*var\(--dashboard-selection-compact-height\);[\s\S]*?min-width:\s*var\(--dashboard-selection-compact-min-width\);[\s\S]*?border-radius:\s*var\(--border-radius-full\);/u,
  'dashboard platform buttons should use the shared compact full-pill geometry'
);
assertDoesNotMatch(
  filterTabButtonStyles,
  /\.tabButton\s*\{[\s\S]*?transition:\s*all/u,
  'dashboard platform buttons should avoid broad transition: all motion'
);
assertMatches(
  filterControlStyles,
  /\.dateModeSegmented :global\(\.ant-segmented-thumb\)\s*\{[\s\S]*?border-radius:\s*var\(--border-radius-full\)\s*!important;[\s\S]*?background-color:\s*var\(--brand-primary\)[\s\S]*?box-shadow:\s*var\(--dashboard-brand-tab-shadow\)/u,
  'date mode segmented control should remain the active-pill motion baseline'
);
assertMatches(
  filterControlStyles,
  /\.dateModeSegmented :global\(\.ant-segmented-item\)\s*\{[\s\S]*?min-width:\s*var\(--dashboard-selection-compact-min-width\);[\s\S]*?border-radius:\s*var\(--border-radius-full\)\s*!important;/u,
  'date mode segmented items should share compact full-pill geometry and avoid near-circular one-character pills'
);
assertMatches(
  filterControlStyles,
  /\.dateModeSegmented :global\(\.ant-segmented-item-label\)\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*var\(--dashboard-selection-compact-height\);[\s\S]*?border-radius:\s*var\(--border-radius-full\)\s*!important;/u,
  'date mode segmented labels should center text inside the compact full-pill geometry'
);
assertMatches(
  dimensionNavStyles,
  /\.dimensionButton\s*\{[\s\S]*?border-radius:\s*var\(--dashboard-selection-tile-radius\);[\s\S]*?transition:\s*[\s\S]*?background-color\s+var\(--transition-duration-fast\)[\s\S]*?transform\s+var\(--transition-duration-fast\)[\s\S]*?\}/u,
  'dashboard dimension nav desktop tiles should use the shared large selected-tile radius and explicit transitions'
);
assertMatches(
  dimensionNavStyles,
  /\.dimensionButtonActive\s*\{[\s\S]*?border-radius:\s*var\(--dashboard-selection-tile-radius\);[\s\S]*?background:\s*var\(--brand-primary\);[\s\S]*?box-shadow:\s*var\(--dashboard-brand-selected-shadow\);/u,
  'dashboard dimension active tile should share the brand selected-state family without becoming a full pill'
);
assertDoesNotMatch(
  dimensionNavStyles,
  /\.dimensionButton(?:Active)?\s*\{[\s\S]*?border-radius:\s*(?:9999px|var\(--border-radius-full\))/u,
  'dashboard dimension desktop active tile should stay a large rounded tile, not a full capsule'
);
assertDoesNotMatch(
  dimensionNavStyles,
  /\.dimensionButton\s*\{[\s\S]*?transition:\s*all/u,
  'dashboard dimension desktop buttons should avoid broad transition: all motion'
);
assertIncludes(
  content,
  'const QIANCHUAN_DETAIL_DESKTOP_PAGE_SIZE = 20;',
  'qianchuan detail tables should default desktop detail pagination to 20 rows'
);
assertIncludes(
  content,
  'scroll={{ x: scrollX }}',
  'qianchuan detail tables should let the selected page size control visible row count through page flow'
);
assertIncludes(
  content,
  'QIANCHUAN_DETAIL_MOBILE_PAGE_SIZE = 8',
  'qianchuan detail tables should keep a smaller mobile page size'
);
assertDoesNotMatch(
  content,
  /scroll=\{\{[^}]*\by\s*:/u,
  'qianchuan detail tables should not reintroduce vertical table-body scroll.y'
);
assertDoesNotMatch(
  content,
  /\bsticky=/u,
  'qianchuan detail tables should not add a second sticky layer under the dashboard topbar dock'
);
assertNotIncludes(
  content,
  'QIANCHUAN_DETAIL_STICKY_HEADER_OFFSET',
  'qianchuan detail tables should not keep a hard-coded sticky header offset'
);
assertNotIncludes(
  content,
  'QIANCHUAN_DETAIL_MAX_SCROLL_Y',
  'qianchuan detail tables should not cap desktop page-size rows behind a fixed scroll height'
);
assertIncludes(
  tableState,
  'new Set([desktopPageSize, 20, 50, 100])',
  'dashboard detail pagination should keep 20 / 50 / 100 page-size options'
);
assertIncludes(
  tableState,
  'showSizeChanger: isMobile ? false : { showSearch: false }',
  'desktop detail page-size selector should be a non-searching select'
);
assertIncludes(
  tableState,
  'onShowSizeChange: onChange',
  'page-size changes should be wired to the controlled pagination handler'
);
assertMatches(
  contentStyles,
  /\.sectionPanel\s*\{[\s\S]*?overflow:\s*hidden;/u,
  'qianchuan section panels should clip table content inside the panel boundary'
);
assertMatches(
  contentStyles,
  /\.table :global\(\.ant-table-container\)\s*\{[\s\S]*?overflow:\s*hidden;/u,
  'qianchuan table containers should clip content inside the rounded table boundary'
);
assertNotIncludes(
  contentStyles,
  '.ant-table-sticky-holder',
  'qianchuan detail tables should not rely on AntD sticky header holders'
);
assertMatches(
  topBarStyles,
  /\.topBarDock\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?z-index:\s*40;/u,
  'dashboard filter topbar dock should stick at viewport top above dashboard content'
);
assertMatches(
  topBarStyles,
  /\.topBarDock\s*\{[\s\S]*?linear-gradient\(180deg,\s*var\(--dashboard-canvas-bg-start\)/u,
  'dashboard filter topbar dock should use a canvas-colored glass mask instead of a white card'
);
assertMatches(
  topBarStyles,
  /\.topBarDock::before\s*\{[\s\S]*?width:\s*100vw;[\s\S]*?background:\s*inherit;/u,
  'dashboard filter topbar dock should extend the canvas glass mask across the viewport'
);
assertMatches(
  topBarStyles,
  /\.topBar\s*\{[\s\S]*?position:\s*relative;/u,
  'dashboard filter layout row should not own sticky positioning'
);
assertDoesNotMatch(
  topBarStyles,
  /\.topBar\s*\{[\s\S]*?position:\s*sticky;/u,
  'dashboard filter layout row should not leave a sticky top gap'
);
assertMatches(
  topBarStyles,
  /\.topBar\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/u,
  'dashboard filter layout row should not paint a full-width white rectangle behind controls'
);
assertMatches(
  topBarStyles,
  /\.topBar::before\s*\{[\s\S]*?display:\s*none;/u,
  'dashboard filter layout row should keep the old white card underlay disabled'
);
assertMatches(
  contentStyles,
  /\.table :global\(\.ant-table-thead > tr > th\.ant-table-cell-fix-left\),[\s\S]*?z-index:\s*7\s*!important;/u,
  'qianchuan fixed header cells should stay below the dashboard filter topbar dock'
);
assertMatches(
  contentStyles,
  /\.table :global\(\.ant-table-tbody > tr > td\.ant-table-cell-fix-left\),[\s\S]*?z-index:\s*6\s*!important;/u,
  'qianchuan fixed body cells should stay below the dashboard filter topbar dock'
);
assertIncludes(
  contentStyles,
  'width: 0 !important;',
  'qianchuan page-size select should hide the readonly AntD input caret/black line'
);
assertIncludes(
  contentStyles,
  'opacity: 0 !important;',
  'qianchuan page-size select readonly AntD input should be visually hidden'
);
assertIncludes(
  contentStyles,
  'caret-color: transparent !important;',
  'qianchuan page-size select readonly AntD input caret should be transparent'
);
assertMatches(
  content,
  /title:\s*'视频 \/ 直播间画面对比'[\s\S]*?onClick=\{handleExportMaterialTypeMixDetails\}[\s\S]*?导出明细[\s\S]*?renderDataTable<DashboardQianchuanMaterialTypeMixRow>/u,
  'material type comparison detail section should expose its own export detail action'
);
assertMatches(
  content,
  /title:\s*'视频'[\s\S]*?onClick=\{handleExportLiveVideoDetails\}[\s\S]*?导出明细[\s\S]*?renderDataTable<DashboardQianchuanLiveVideoRow>/u,
  'video detail section should expose its own export detail action'
);
assertMatches(
  content,
  /title:\s*'直播间画面'[\s\S]*?onClick=\{handleExportLiveRoomScreenDetails\}[\s\S]*?导出明细[\s\S]*?renderDataTable<DashboardQianchuanLiveRoomScreenRow>/u,
  'live-room-screen detail section should expose its own export detail action'
);
assertIncludes(content, "return '视频趋势';", 'video scope should drive the trend title');
assertIncludes(content, "return '直播间画面趋势';", 'live-room-screen scope should drive the trend title');

assertIncludes(trendOption, "name: '支付 ROI'", 'qianchuan trend should keep the pay ROI line');
assertIncludes(trendOption, "name: '净成交 ROI'", 'qianchuan trend should include the net GMV ROI line');
assertIncludes(
  trendOption,
  'item.net_gmv_roi ?? item.netGmvRoi',
  'net GMV ROI line should read trend net_gmv_roi'
);
assertMatches(
  trendOption,
  /name:\s*'支付 ROI'[\s\S]*yAxisIndex:\s*1/u,
  'pay ROI line should use the ROI y-axis'
);
assertMatches(
  trendOption,
  /name:\s*'净成交 ROI'[\s\S]*yAxisIndex:\s*1/u,
  'net GMV ROI line should use the ROI y-axis'
);
assertIncludes(trendOption, "type: 'dashed'", 'net GMV ROI line should be visually differentiated');

assertIncludes(columns, "live_video: '视频'", 'live_video material label should be 视频');
assertIncludes(
  columns,
  'normalizeLiveVideoDisplayText',
  'live video detail names should normalize legacy visible copy'
);
assertIncludes(
  columns,
  'LEGACY_LIVE_VIDEO_LABEL_PATTERN',
  'live video detail names should use a scoped legacy-label pattern'
);
assertIncludes(columns, "title: '内容类型'", 'material type comparison should use 内容类型');
assertIncludes(columns, "title: '内容数'", 'material count should use 内容数');
assertIncludes(columns, "title: '视频'", 'live video detail primary column should be 视频');
assertIncludes(columns, 'width: isMobile ? 240 : 300', 'live video detail primary column should be compact, not oversized');
assertIncludes(columns, 'ellipsis: true', 'live video detail primary column should ellipsize long file names');
assertIncludes(columns, "title: '素材ID'", 'live video detail material column should be labeled 素材ID');
assertNotIncludes(columns, "title: '视频ID'", 'live video detail material column should not be labeled 视频ID');
assertIncludes(columns, "title: '视频类型'", 'video detail type column should be 视频类型');
assertIncludes(columns, "title: '直播间抖音号'", 'video detail should show the live-room Douyin display id');
assertIncludes(
  columns,
  "keys: ['douyinAccountDisplayId', 'douyin_account_display_id']",
  'video detail live-room Douyin display id should read the raw source field'
);
assertIncludes(columns, "title: '视频创建时间'", 'video detail created-at column should be 视频创建时间');
assertNotIncludes(
  columns,
  "classNames.tableIdentityMeta}>{materialId || '--'}</span>",
  'video primary column should not repeat material id under the video name'
);
assertIncludes(
  columns,
  'classNames.tableTextBodyCellLeft',
  'video body cells should use a left-aligned text body class'
);
assertIncludes(
  columns,
  'classNames.tableIdentityCellLeft',
  'video identity content should align left for long names'
);
assertIncludes(
  columns,
  'classNames.tableVideoName',
  'video names should use the lighter video-name typography class'
);
assertIncludes(columns, "import { Link } from 'react-router-dom';", 'video title links should use React Router links');
assertIncludes(
  columns,
  "import { ROUTE_PATHS } from '@/lib/route-policy-registry';",
  'video title links should use the route policy registry'
);
assertIncludes(
  columns,
  'function buildContentAssetDetailPath(assetId: string): string',
  'video title links should build a content asset detail path'
);
assertIncludes(
  columns,
  'ROUTE_PATHS.marketingContentAssets',
  'video title links should target the content assets route'
);
assertIncludes(
  columns,
  "'assetId',\n          'asset_id',\n          'contentAssetId',\n          'content_asset_id'",
  'video title links should read both backend asset_id and frontend contentAssetId aliases'
);
assertIncludes(columns, 'classNames.tableVideoLink', 'linked video names should use a dedicated link class');
assertIncludes(columns, 'target="_blank"', 'video title links should open content assets in a new tab');
assertIncludes(
  columns,
  'rel="noopener noreferrer"',
  'video title links should protect the opener when opening a new tab'
);
assertIncludes(
  content,
  'tableVideoLink: styles.tableVideoLink',
  'qianchuan table class mapping should expose the video link class'
);
assertIncludes(types, 'asset_id?: string | null;', 'live video rows should accept backend asset_id');
assertIncludes(types, 'contentAssetId?: string | null;', 'live video rows should accept content asset ID aliases');
assertIncludes(contentStyles, '.tableTextBodyCellLeft', 'qianchuan styles should define left-aligned video body cells');
assertIncludes(contentStyles, '.tableIdentityCellLeft', 'qianchuan styles should define left-aligned video identity content');
assertIncludes(contentStyles, '.tableVideoName', 'qianchuan styles should define lighter video-name typography');
assertMatches(
  contentStyles,
  /\.tableVideoLink\s*\{[\s\S]*color:\s*var\(--brand-text\);[\s\S]*cursor:\s*pointer;[\s\S]*text-decoration:\s*none;/u,
  'linked video names should use AIOS brand text tokens and a pointer cursor'
);
assertMatches(
  contentStyles,
  /\.tableVideoLink:hover,[\s\S]*\.tableVideoLink:focus-visible\s*\{[\s\S]*color:\s*var\(--brand-active\);[\s\S]*text-decoration:\s*underline;/u,
  'linked video names should expose hover and keyboard-focus affordance'
);
assertIncludes(contentStyles, 'max-width: 280px', 'video names should have a width cap so the column can stay compact');
assertMatches(
  contentStyles,
  /\.tableIdentityName\s*\{[\s\S]*color:\s*var\(--dashboard-detail-text\)[\s\S]*font-size:\s*var\(--font-size-xs\)[\s\S]*font-weight:\s*430/u,
  'detail table identity text should match live-detail muted, smaller, non-bold typography'
);
assertMatches(
  contentStyles,
  /\.tableBodyCell\s*\{[\s\S]*color:\s*var\(--dashboard-detail-text\)[\s\S]*font-size:\s*var\(--font-size-xs\)[\s\S]*font-weight:\s*430/u,
  'detail table body cells should use muted, smaller, non-bold typography'
);
assertMatches(
  contentStyles,
  /\.table\s*:global\(\.ant-table-tbody\s*>\s*tr\s*>\s*td\)\s*\{[\s\S]*font-size:\s*var\(--font-size-xs\)\s*!important[\s\S]*font-weight:\s*430\s*!important/u,
  'all qianchuan detail table body cells should be smaller than headers, including live-detail class overrides'
);

assertIncludes(content, 'DownloadOutlined', 'video detail should expose a download icon for exporting details');
assertIncludes(content, '导出明细', 'video detail should expose an export detail action');
assertIncludes(
  content,
  'handleExportMaterialTypeMixDetails',
  'material type mix detail should expose an export detail action'
);
assertIncludes(
  content,
  'isExportingMaterialTypeMixDetails',
  'material type mix detail section should track its own export loading state'
);
assertIncludes(
  content,
  'disableMaterialTypeMixDetailExport',
  'material type mix detail export should disable when auth/loading/empty state blocks export'
);
assertIncludes(
  detailExportActions,
  'buildDashboardQianchuanMaterialTypeMixDetailCsvExport',
  'material type mix detail export should build a CSV payload'
);
assertIncludes(
  detailExportActions,
  'buildDashboardQianchuanLiveVideoDetailCsvExport',
  'video detail export should build a CSV payload'
);
assertIncludes(
  detailExportActions,
  'buildDashboardQianchuanLiveRoomScreenDetailCsvExport',
  'live-room-screen detail export should build a CSV payload'
);
assertIncludes(
  detailExportActions,
  'downloadDashboardCsvFile(csvText, fileName)',
  'qianchuan detail export should reuse the shared CSV downloader'
);
assertIncludes(
  detailExportActions,
  'isExportingLiveRoomScreenDetails',
  'live-room-screen detail section should track its own export loading state'
);
assertIncludes(
  detailExportActions,
  'disableLiveRoomScreenDetailExport',
  'live-room-screen detail export should disable when auth/loading/empty state blocks export'
);
assertIncludes(
  detailExportActions,
  'DASHBOARD_EXPORT_EMPTY_QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_MESSAGE',
  'material type mix detail export should use an explicit empty-state message'
);
assertIncludes(
  detailExportActions,
  'DASHBOARD_EXPORT_EMPTY_QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_MESSAGE',
  'live-room-screen detail export should use an explicit empty-state message'
);
assertIncludes(
  detailExportActions,
  "'千川内容类型对比明细'",
  'material type mix detail export should report a specific success label'
);
assertIncludes(
  detailExportActions,
  "'千川直播间画面明细'",
  'live-room-screen detail export should report a specific success label'
);
assertIncludes(
  content,
  '按素材 ID、视频类型、直播间与创建时间下钻播放、互动和成交指标。',
  'video detail description should refer to 素材 ID, not 视频 ID'
);
assertIncludes(
  pageContentController,
  'messageApi: messageState.messageApi',
  'qianchuan content should receive the dashboard message API for export feedback'
);
assertIncludes(
  pageContentController,
  'isAuthenticated: auth.isAuthenticated',
  'qianchuan content should receive auth state for export behavior'
);
assertIncludes(
  exportShared,
  'DASHBOARD_EXPORT_EMPTY_QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_MESSAGE',
  'qianchuan material type mix export should have an explicit empty-state message'
);
assertIncludes(
  exportShared,
  'DASHBOARD_EXPORT_EMPTY_QIANCHUAN_VIDEO_DETAIL_MESSAGE',
  'qianchuan video export should have an explicit empty-state message'
);
assertIncludes(
  exportShared,
  'DASHBOARD_EXPORT_EMPTY_QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_MESSAGE',
  'qianchuan live-room-screen export should have an explicit empty-state message'
);
assertIncludes(
  detailExport,
  'QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_EXPORT_COLUMNS',
  'qianchuan material type mix export should define its own detail columns'
);
assertIncludes(detailExport, "header: '内容类型'", 'qianchuan material type mix export should include material type');
assertIncludes(detailExport, "header: '内容数'", 'qianchuan material type mix export should include material count');
assertIncludes(detailExport, "header: '素材ID'", 'qianchuan video export should label material id as 素材ID');
assertIncludes(detailExport, "header: '直播间抖音号'", 'qianchuan video export should include live-room Douyin display id');
assertIncludes(
  detailExport,
  "keys: ['douyinAccountDisplayId', 'douyin_account_display_id']",
  'qianchuan video export should read douyin_account_display_id'
);
assertIncludes(
  detailExport,
  'QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_EXPORT_COLUMNS',
  'qianchuan live-room-screen export should define its own detail columns'
);
assertIncludes(detailExport, "header: '抖音账号'", 'qianchuan live-room-screen export should include account name');
assertIncludes(detailExport, "header: '抖音号'", 'qianchuan live-room-screen export should include Douyin display id');
assertIncludes(detailExport, "header: '画面Key'", 'qianchuan live-room-screen export should include screen key');

assertIncludes(backend, '"materialScopes": data.material_scopes', 'backend should add materialScopes without removing legacy fields');
assertIncludes(backend, 'Some("live_video")', 'backend should fetch scoped live_video totals/trend/count');
assertIncludes(backend, 'Some("live_room_screen")', 'backend should fetch scoped live-room-screen totals/trend/count');
assertIncludes(backend, "WHEN 'live_video' THEN '视频'", 'backend material type mix label should be 视频');
assertIncludes(
  backend,
  'material_asset_resolution AS',
  'backend should resolve material IDs to content asset IDs before building detail rows'
);
assertIncludes(
  backend,
  'COUNT(DISTINCT asset_id) = 1',
  'backend should link only uniquely resolved material IDs'
);
assertIncludes(
  backend,
  "material.ad_platform = 'qianchuan'",
  'backend should resolve Qianchuan ad-material identities'
);
assertIncludes(
  backend,
  "video.platform = 'douyin'",
  'backend should resolve Douyin platform-video external item identities'
);
assertMatches(
  backend,
  /JOIN ads\.marketing_content_assets asset[\s\S]*?asset\.asset_id = material\.asset_id[\s\S]*?asset\.is_deleted = FALSE/u,
  'backend should not link Qianchuan ad-material identities to soft-deleted content assets'
);
assertMatches(
  backend,
  /JOIN ads\.marketing_content_assets asset[\s\S]*?asset\.asset_id = video\.asset_id[\s\S]*?asset\.is_deleted = FALSE/u,
  'backend should not link Douyin platform-video identities to soft-deleted content assets'
);
assertIncludes(
  backend,
  "mar.material_id = NULLIF(BTRIM(p.material_id), '')",
  'backend should trim material IDs before joining resolved asset links'
);
assertIncludes(backend, "'asset_id', asset_id", 'backend detail row payload should include asset_id');
assertIncludes(
  backend,
  'COALESCE(SUM(d.settlement_amount_7d), 0)::NUMERIC AS settlement_amount_7d',
  'totals should aggregate 7-day settlement amount before ROI division'
);
assertIncludes(
  backend,
  "'settlement_roi_7d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_7d / overall_cost, 6) END",
  '7-day settlement ROI should be sum(settlement amount) / sum(overall cost)'
);
assertIncludes(
  backend,
  "'settlement_roi_14d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_14d / overall_cost, 6) END",
  '14-day settlement ROI should be sum(settlement amount) / sum(overall cost)'
);
assertIncludes(
  backend,
  "'settlement_roi_30d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_30d / overall_cost, 6) END",
  '30-day settlement ROI should be sum(settlement amount) / sum(overall cost)'
);

assertIncludes(backendMaterialScopes, '"all": build_material_scope_summary', 'materialScopes should expose all scope');
assertIncludes(backendMaterialScopes, '"video": build_material_scope_summary', 'materialScopes should expose video scope');
assertIncludes(
  backendMaterialScopes,
  '"liveRoomScreen": build_material_scope_summary',
  'materialScopes should expose liveRoomScreen scope'
);
assertIncludes(backendMaterialScopes, '"视频"', 'materialScopes video label should be 视频');
assertIncludes(backendMaterialScopes, 'Some("live_video")', 'materialScopes video should map to live_video');
assertIncludes(
  backendMaterialScopes,
  'Some("live_room_screen")',
  'materialScopes liveRoomScreen should map to live_room_screen'
);

console.log('[dashboard-qianchuan-scoped-layout-behavior] OK');
