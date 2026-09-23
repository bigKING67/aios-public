import { CdpClient, ensureCdpWebSocketRuntime } from '../frontend/smoke/chrome-cdp-client.mjs';
import { launchChrome } from '../frontend/smoke/chrome-cdp-launcher.mjs';
import {
  DEFAULT_ROUTE_SETTLE_POLL_MS,
  DEFAULT_TIMEOUT_MS,
} from '../frontend/smoke/constants.mjs';
import {
  buildRouteUrl,
  normalizeBaseUrl,
  parseIntegerEnv,
  readSmokeCookiesFromEnv,
} from '../frontend/smoke/config.mjs';
import { fetchWithTimeout, sleep } from '../frontend/smoke/http.mjs';
import { waitForAnonymousRedirectSnapshot } from './special-report-browser-auth-redirect-smoke.mjs';
import {
  EXPECTED_ECHARTS_CHART_NODE_COUNT,
  EXPECTED_EVIDENCE_DRAWER_SECTION_IDS,
  EXPECTED_REPORT_ECHARTS,
  EXPECTED_STATIC_DOM_VISUAL_COUNT,
  EXPECTED_STATIC_DOM_VISUAL_NAMES,
} from './special-report-browser-visual-contract.mjs';
import {
  captureMobileCompactFallbackSnapshot,
  captureSpecialReportIndexSnapshot,
  captureSpecialReportVisualSnapshot,
} from './special-report-browser-snapshot-capture.mjs';

export const SPECIAL_REPORT_BROWSER_VIEWPORTS = Object.freeze([
  { name: '1512', width: 1512, height: 980, mobile: false },
  { name: '1180', width: 1180, height: 900, mobile: false },
  { name: '640', width: 640, height: 860, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
]);

export const SPECIAL_REPORT_BROWSER_ROUTES = Object.freeze([
  { name: 'read', path: '/reports/special/gsv-monthly-channel', exportMode: false, kind: 'report' },
  { name: 'export', path: '/reports/special/gsv-monthly-channel?reportMode=export', exportMode: true, kind: 'report' },
]);

export const EXPECTED_CHART_GALLERY_CARD_COUNT = 10;
export const EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT = 7;
export const EXPECTED_TOC_MODEL_ENTRY_COUNT = 21;
export const MAX_SECTION_EVIDENCE_SHOWN_COUNT = 16;
export const MAX_EVIDENCE_DRAWER_ROW_COUNT = 8;
export const MAX_MOBILE_STATIC_DOM_VISUAL_HEIGHT = 900;
export const DEFAULT_SPECIAL_REPORT_ROUTE_SETTLE_TIMEOUT_MS = 20_000;
export const HIDDEN_MICRO_TOC_ENTRY_IDS = Object.freeze([]);

export const MICRO_DEEP_LINK_ENTRY_IDS = Object.freeze([
  'tmall-products',
  'tmall-product-trend',
  'tmall-product-delta',
  'tmall-product-attribution',
  'tmall-traffic',
  'tmall-wanxiangtai',
  'tmall-driver',
  'douyin-channel',
  'douyin-live',
  'douyin-card',
  'douyin-qianchuan',
  'douyin-short-video',
]);

export const DESKTOP_VISIBLE_TOC_ENTRY_IDS = Object.freeze([
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
]);

export const MOBILE_VISIBLE_TOC_ENTRY_IDS = Object.freeze([
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
]);

export const RETIRED_QUESTION_TOC_TITLES = Object.freeze([
  '总盘是否健康',
  '5 月是否接住大促',
  '增长来自哪类平台',
  '平台诊断路径',
  '天猫为什么没接住',
  '抖音放量质量风险',
  '先做哪几个动作',
]);

export const DESKTOP_CHAPTER_TOC_MARKERS = Object.freeze({
  'brand-management': 'I',
  'industry-insight': 'II',
  'competitor-analysis': 'III',
});

export const DESKTOP_DISABLED_TOC_STATUSES = Object.freeze({
  'industry-insight': '待补',
  'competitor-analysis': '待补',
});

export const MOBILE_COMPACT_ACTIVE_FALLBACKS = Object.freeze([]);

function formatSnapshotSample(snapshot) {
  return JSON.stringify(snapshot.bodyTextSample || '').slice(0, 520);
}

function buildVisualFailures({ documentStatus, route, snapshot, viewport }) {
  const prefix = `${viewport.name}px ${route.name} ${route.path}`;
  const failures = [];

  if (documentStatus < 200 || documentStatus >= 400) {
    failures.push(`${prefix}: document request returned HTTP ${documentStatus}.`);
  }
  if (!snapshot?.hasRoot) {
    failures.push(`${prefix}: #root element is missing.`);
  }
  if (snapshot.bodyTextLength < 800) {
    failures.push(`${prefix}: body text is too short (${snapshot.bodyTextLength}); sample=${formatSnapshotSample(snapshot)}.`);
  }
  for (const expectedText of ['专题报告', '品牌经营', '经营动作', '行业洞察', '竞品分析', '6月预估', '6月预估较4月', '6/1-6/21']) {
    if (!snapshot.bodyText.includes(expectedText)) {
      failures.push(`${prefix}: expected report text ${JSON.stringify(expectedText)} is missing; sample=${formatSnapshotSample(snapshot)}.`);
    }
  }
  if (snapshot.finalPath !== '/reports/special/gsv-monthly-channel') {
    failures.push(`${prefix}: expected final path /reports/special/gsv-monthly-channel, got ${snapshot.finalPath}.`);
  }
  if (route.exportMode && !snapshot.finalSearch.includes('reportMode=export')) {
    failures.push(`${prefix}: export route lost reportMode=export; final search=${snapshot.finalSearch || '<empty>'}.`);
  }
  if (route.exportMode && snapshot.reportModeDataset !== 'export') {
    failures.push(`${prefix}: export route must set documentElement.dataset.reportMode=export.`);
  }
  if (snapshot.horizontalOverflow) {
    failures.push(`${prefix}: document has page-level horizontal overflow.`);
  }
  if (snapshot.viteErrorOverlay) {
    failures.push(`${prefix}: Vite error overlay is visible.`);
  }
  if (Array.isArray(snapshot.pageErrors) && snapshot.pageErrors.length > 0) {
    failures.push(`${prefix}: page error(s): ${snapshot.pageErrors.join(' | ')}`);
  }
  if (Array.isArray(snapshot.consoleErrors) && snapshot.consoleErrors.length > 0) {
    failures.push(`${prefix}: console error(s): ${snapshot.consoleErrors.join(' | ')}`);
  }
  if (snapshot.chartNodeCount !== EXPECTED_ECHARTS_CHART_NODE_COUNT) {
    failures.push(`${prefix}: expected ${EXPECTED_ECHARTS_CHART_NODE_COUNT} static ECharts containers, got ${snapshot.chartNodeCount}.`);
  }
  const actualReportEcharts = (snapshot.chartSectionIds ?? []).map((sectionId, index) => ({
    sectionId,
    builder: snapshot.chartBuilders?.[index] ?? '',
  }));
  if (JSON.stringify(actualReportEcharts) !== JSON.stringify(EXPECTED_REPORT_ECHARTS)) {
    failures.push(`${prefix}: report ECharts owners drifted; expected ${JSON.stringify(EXPECTED_REPORT_ECHARTS)}, got ${JSON.stringify(actualReportEcharts)}.`);
  }
  if (snapshot.chartNonZeroBoxCount < snapshot.chartNodeCount) {
    failures.push(`${prefix}: one or more static chart containers have zero-size boxes (${snapshot.chartNonZeroBoxCount}/${snapshot.chartNodeCount}).`);
  }
  if (snapshot.chartMissingAccessibleNameCount > 0) {
    failures.push(`${prefix}: ${snapshot.chartMissingAccessibleNameCount} static chart container(s) are missing aria-label text.`);
  }
  if (snapshot.chartMissingSemanticMetadataCount > 0) {
    failures.push(`${prefix}: ${snapshot.chartMissingSemanticMetadataCount} static chart figure(s) are missing semantic question/claim/sort/value/evidence metadata handles.`);
  }
  if (snapshot.chartFrameOverflowCount > 0) {
    failures.push(`${prefix}: ${snapshot.chartFrameOverflowCount} chart container(s) overflow their report figure frame.`);
  }
  if (snapshot.chartInnerScrollOverflowCount > 0) {
    failures.push(`${prefix}: ${snapshot.chartInnerScrollOverflowCount} chart container(s) have stale inner scroll size; max_child_w=${snapshot.chartMaxDirectChildWidth}, max_graphic_w=${snapshot.chartMaxGraphicWidth}.`);
  }
  if (snapshot.chartGraphicFrameOverflowCount > 0) {
    failures.push(`${prefix}: ${snapshot.chartGraphicFrameOverflowCount} chart graphic(s) remain larger than their container after resize; max_child_w=${snapshot.chartMaxDirectChildWidth}, max_graphic_w=${snapshot.chartMaxGraphicWidth}.`);
  }
  if (snapshot.chartViewportOverflowCount > 0) {
    failures.push(`${prefix}: ${snapshot.chartViewportOverflowCount} chart graphic(s) overflow the viewport.`);
  }
  if (snapshot.staticVisualCount !== EXPECTED_STATIC_DOM_VISUAL_COUNT) {
    failures.push(`${prefix}: expected ${EXPECTED_STATIC_DOM_VISUAL_COUNT} DOM static visuals, got ${snapshot.staticVisualCount}; names=${(snapshot.staticVisualNames ?? []).join(', ') || '<none>'}.`);
  }
  if ((snapshot.staticVisualNames ?? []).join('|') !== EXPECTED_STATIC_DOM_VISUAL_NAMES.join('|')) {
    failures.push(`${prefix}: DOM static visual owners drifted; expected ${EXPECTED_STATIC_DOM_VISUAL_NAMES.join(', ')}, got ${(snapshot.staticVisualNames ?? []).join(', ') || '<none>'}.`);
  }
  if (snapshot.staticVisualNonZeroBoxCount < snapshot.staticVisualCount) {
    failures.push(`${prefix}: one or more DOM static visuals have zero-size boxes (${snapshot.staticVisualNonZeroBoxCount}/${snapshot.staticVisualCount}).`);
  }
  if (snapshot.staticVisualMissingSemanticMetadataCount > 0) {
    failures.push(`${prefix}: ${snapshot.staticVisualMissingSemanticMetadataCount} DOM static visual(s) are missing semantic question/claim/sort/value/evidence metadata handles.`);
  }
  if (snapshot.staticVisualViewportOverflowCount > 0) {
    failures.push(`${prefix}: ${snapshot.staticVisualViewportOverflowCount} DOM static visual(s) overflow the viewport.`);
  }
  if (!snapshot.tmallProductTrendTablePresent) {
    failures.push(`${prefix}: tmall products section must render the compact trend table.`);
  }
  if (snapshot.tmallProductTrendRowCount !== EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT) {
    failures.push(`${prefix}: tmall product trend table should keep ${EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT} core product rows after contribution prefilter; got ${snapshot.tmallProductTrendRowCount}.`);
  }
  for (const expectedHeader of ['商品', 'GSV趋势', '访客人数', '加购人数', '支付人数', '加购率', '支付转化率']) {
    if (!(snapshot.tmallProductTrendHeaders ?? []).includes(expectedHeader)) {
      failures.push(`${prefix}: tmall product trend table header ${JSON.stringify(expectedHeader)} is missing; headers=${(snapshot.tmallProductTrendHeaders ?? []).join(', ') || '<none>'}.`);
    }
  }
  if (snapshot.tmallProductAppendixDrawerCount > 0) {
    failures.push(`${prefix}: tmall products section must not render a product evidence appendix drawer.`);
  }
  if (snapshot.tmallProductMissingCellCount < 1) {
    failures.push(`${prefix}: tmall product trend table must expose missing-month cells so missing is not treated as zero.`);
  }
  if (snapshot.tmallProductMissingFillCount > 0) {
    failures.push(`${prefix}: tmall product missing-month cells must not render a mini bar fill.`);
  }
  const expectedScaleBarMomCells = EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT * 4;
  const expectedRateLineCells = EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT * 2;
  if (snapshot.tmallProductScaleBarMomCellCount !== expectedScaleBarMomCells) {
    failures.push(`${prefix}: tmall product scale metrics must render 4 bar+MoM columns x ${EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT} rows; got ${snapshot.tmallProductScaleBarMomCellCount}.`);
  }
  if (snapshot.tmallProductScaleBarVisualCount !== snapshot.tmallProductScaleBarMomCellCount) {
    failures.push(`${prefix}: every tmall product scale cell must include the absolute-size mini bars.`);
  }
  if (snapshot.tmallProductScaleMomLineVisualCount !== snapshot.tmallProductScaleBarMomCellCount) {
    failures.push(`${prefix}: every tmall product scale cell must include the month-over-month line overlay.`);
  }
  if (snapshot.tmallProductRateCellCount !== expectedRateLineCells || snapshot.tmallProductRateLineVisualCount !== expectedRateLineCells) {
    failures.push(`${prefix}: tmall product rate metrics must render 2 line columns x ${EXPECTED_TMALL_PRODUCT_TREND_ROW_COUNT} rows; cells=${snapshot.tmallProductRateCellCount}, lines=${snapshot.tmallProductRateLineVisualCount}.`);
  }
  for (const retiredHeaderText of ['同页复核核心商品', '规模列柱', '率列折线']) {
    if ((snapshot.tmallProductPageHeaderText ?? '').includes(retiredHeaderText)) {
      failures.push(`${prefix}: tmall products page header still renders retired explanatory text ${JSON.stringify(retiredHeaderText)}.`);
    }
  }
  if ((snapshot.tmallProductTrendVisibleMonthLabels ?? []).length > 0) {
    failures.push(`${prefix}: tmall product mini trend cells must not render visible month labels; got ${(snapshot.tmallProductTrendVisibleMonthLabels ?? []).join(', ')}.`);
  }
  if (
    snapshot.tmallProductTrendColumnWidths?.product > 0
    && (snapshot.tmallProductTrendColumnWidths?.metrics ?? []).some((width) => width <= snapshot.tmallProductTrendColumnWidths.product)
  ) {
    failures.push(`${prefix}: tmall product metric columns should be wider than the product column; product=${snapshot.tmallProductTrendColumnWidths.product}, metrics=${(snapshot.tmallProductTrendColumnWidths.metrics ?? []).join(',')}.`);
  }
  for (const retiredText of ['商品结构', '核心商品趋势带', '复核附录', '6月MTD TOP复核', '柱为规模', '率列为折线', '规模列柱', '率列折线', '6/1-6/7', '6/1-6/13', '6/1-6/18', '2026-06-07', '2026-06-08', '2026-06-13', '2026-06-18', '截至2026-06-13', '6月13', '6月18', '6/13', '6/18', '117.8万', '+21.2%', '107.5万']) {
    if ((snapshot.tmallProductBodyText ?? '').includes(retiredText)) {
      failures.push(`${prefix}: retired tmall product text ${JSON.stringify(retiredText)} is still rendered.`);
    }
  }
  if (snapshot.publishedPlaceholderCount > 0) {
    failures.push(`${prefix}: published report still renders ${snapshot.publishedPlaceholderCount} platform-detail placeholder(s).`);
  }
  const tocNavByMode = new Map((snapshot.tocNavSummaries ?? []).map((summary) => [summary.mode, summary]));
  for (const mode of ['desktop', 'mobile']) {
    const tocSummary = tocNavByMode.get(mode);
    if (!tocSummary) {
      failures.push(`${prefix}: ${mode} TOC data handle is missing.`);
      continue;
    }
    if (tocSummary.entryCount !== EXPECTED_TOC_MODEL_ENTRY_COUNT) {
      failures.push(`${prefix}: ${mode} TOC model entry count drifted; expected ${EXPECTED_TOC_MODEL_ENTRY_COUNT}, got ${tocSummary.entryCount ?? '<missing>'}.`);
    }
    const visibleMicroIds = (tocSummary.entryIds ?? []).filter((entryId) => HIDDEN_MICRO_TOC_ENTRY_IDS.includes(entryId));
    if (visibleMicroIds.length > 0) {
      failures.push(`${prefix}: ${mode} visible TOC includes hidden micro anchor(s): ${visibleMicroIds.join(', ')}.`);
    }
    if ((tocSummary.hiddenAnchorEntryIds ?? []).length > 0) {
      failures.push(`${prefix}: ${mode} visible TOC rendered hidden-anchor row(s): ${tocSummary.hiddenAnchorEntryIds.join(', ')}.`);
    }
  }
  const desktopTocSummary = tocNavByMode.get('desktop');
  if (desktopTocSummary) {
    const actualDesktopIds = desktopTocSummary.entryIds ?? [];
    if (actualDesktopIds.join('|') !== DESKTOP_VISIBLE_TOC_ENTRY_IDS.join('|')) {
      failures.push(`${prefix}: desktop visible TOC drifted; expected ${DESKTOP_VISIBLE_TOC_ENTRY_IDS.join(', ')}, got ${actualDesktopIds.join(', ') || '<none>'}.`);
    }
    for (const [entryId, expectedMarker] of Object.entries(DESKTOP_CHAPTER_TOC_MARKERS)) {
      const actualMarker = desktopTocSummary.markerByEntryId?.[entryId] ?? '';
      if (actualMarker !== expectedMarker) {
        failures.push(`${prefix}: desktop TOC marker for "${entryId}" drifted; expected "${expectedMarker}", got "${actualMarker || '<empty>'}".`);
      }
    }
    for (const [entryId, expectedStatus] of Object.entries(DESKTOP_DISABLED_TOC_STATUSES)) {
      const actualStatus = desktopTocSummary.statusByEntryId?.[entryId] ?? '';
      if (actualStatus !== expectedStatus) {
        failures.push(`${prefix}: desktop TOC status for "${entryId}" drifted; expected "${expectedStatus}", got "${actualStatus || '<empty>'}".`);
      }
    }
    const decimalTextEntries = Object.entries(desktopTocSummary.textByEntryId ?? {})
      .filter(([entryId, text]) => !HIDDEN_MICRO_TOC_ENTRY_IDS.includes(entryId) && /\b\d+(?:\.\d+)+\b/.test(text));
    if (decimalTextEntries.length > 0) {
      failures.push(`${prefix}: desktop TOC text must not expose decimal section numbers: ${decimalTextEntries.map(([entryId, text]) => `${entryId}=${text}`).join('; ')}.`);
    }
    const retiredQuestionTitleEntries = Object.entries(desktopTocSummary.textByEntryId ?? {})
      .filter(([, text]) => RETIRED_QUESTION_TOC_TITLES.some((title) => text.includes(title)));
    if (retiredQuestionTitleEntries.length > 0) {
      failures.push(`${prefix}: desktop TOC must use business hierarchy titles, not retired question titles: ${retiredQuestionTitleEntries.map(([entryId, text]) => `${entryId}=${text}`).join('; ')}.`);
    }
    const genericMarkerEntries = Object.entries(desktopTocSummary.markerByEntryId ?? {})
      .filter(([, marker]) => ['章', '节', '页', '待补'].includes(marker));
    if (genericMarkerEntries.length > 0) {
      failures.push(`${prefix}: desktop TOC marker must stay Roman/title-only, not generic labels: ${genericMarkerEntries.map(([entryId, marker]) => `${entryId}=${marker}`).join(', ')}.`);
    }
  }
  const mobileTocSummary = tocNavByMode.get('mobile');
  if (mobileTocSummary?.currentText?.includes('页 /')) {
    failures.push(`${prefix}: mobile TOC current label must be title-only, got "${mobileTocSummary.currentText}".`);
  }
  if (mobileTocSummary) {
    const actualMobileIds = mobileTocSummary.entryIds ?? [];
    if (actualMobileIds.join('|') !== MOBILE_VISIBLE_TOC_ENTRY_IDS.join('|')) {
      failures.push(`${prefix}: mobile visible TOC drifted; expected ${MOBILE_VISIBLE_TOC_ENTRY_IDS.join(', ')}, got ${actualMobileIds.join(', ') || '<none>'}.`);
    }
  }
  const deepLinkTargetIds = new Set(snapshot.tocDeepLinkTargetIds ?? []);
  const missingDeepLinkTargetIds = MICRO_DEEP_LINK_ENTRY_IDS.filter((entryId) => !deepLinkTargetIds.has(entryId));
  if (missingDeepLinkTargetIds.length > 0) {
    failures.push(`${prefix}: micro TOC target(s) missing from report body: ${missingDeepLinkTargetIds.join(', ')}.`);
  }
  if (viewport.width <= 390 && snapshot.staticVisualMaxHeight > MAX_MOBILE_STATIC_DOM_VISUAL_HEIGHT) {
    const visualHeights = (snapshot.staticVisualSummaries ?? [])
      .map((visual) => `${visual.name || '<unnamed>'}:${visual.width}x${visual.height}`)
      .join(', ');
    failures.push(`${prefix}: DOM static visual height is too tall for mobile evidence review (${snapshot.staticVisualMaxHeight}px > ${MAX_MOBILE_STATIC_DOM_VISUAL_HEIGHT}px); visuals=${visualHeights}.`);
  }
  if (route.exportMode) {
    if (snapshot.chartMountedCount !== snapshot.chartNodeCount) {
      failures.push(`${prefix}: export mode must mount every lazy chart (${snapshot.chartMountedCount}/${snapshot.chartNodeCount}).`);
    }
    if (snapshot.chartRenderedCount !== snapshot.chartNodeCount) {
      failures.push(`${prefix}: export mode must render every lazy chart (${snapshot.chartRenderedCount}/${snapshot.chartNodeCount}).`);
    }
    if (snapshot.chartNonZeroGraphicCount !== snapshot.chartNodeCount) {
      failures.push(`${prefix}: export mode must produce non-zero chart graphics (${snapshot.chartNonZeroGraphicCount}/${snapshot.chartNodeCount}).`);
    }
  } else {
    if (snapshot.chartMountedCount < 1) {
      failures.push(`${prefix}: normal read mode did not mount any static chart.`);
    }
    if (snapshot.chartRenderedCount < 1) {
      failures.push(`${prefix}: normal read mode did not render any static chart.`);
    }
    if (snapshot.chartNonZeroGraphicCount < 1) {
      failures.push(`${prefix}: normal read mode did not produce any non-zero chart graphic.`);
    }
  }
  if (snapshot.evidenceDetailCount !== EXPECTED_EVIDENCE_DRAWER_SECTION_IDS.length) {
    failures.push(`${prefix}: expected ${EXPECTED_EVIDENCE_DRAWER_SECTION_IDS.length} evidence drawers, got ${snapshot.evidenceDetailCount}.`);
  }
  const evidenceDrawerSectionIds = (snapshot.evidenceSummaries ?? []).map((summary) => summary.sectionId);
  if (evidenceDrawerSectionIds.join('|') !== EXPECTED_EVIDENCE_DRAWER_SECTION_IDS.join('|')) {
    failures.push(`${prefix}: evidence drawer owners drifted; expected ${EXPECTED_EVIDENCE_DRAWER_SECTION_IDS.join(', ')}, got ${evidenceDrawerSectionIds.join(', ') || '<none>'}.`);
  }
  if (snapshot.evidenceOpenCount > 0) {
    failures.push(`${prefix}: evidence drawers should be collapsed by default (${snapshot.evidenceOpenCount} open).`);
  }
  for (const [index, summary] of (snapshot.evidenceSummaries ?? []).entries()) {
    if (summary.shownCount !== null && summary.shownCount > MAX_EVIDENCE_DRAWER_ROW_COUNT) {
      failures.push(`${prefix}: evidence drawer ${index + 1} renders ${summary.shownCount} initial rows; expected <= ${MAX_EVIDENCE_DRAWER_ROW_COUNT}.`);
    }
    if (summary.renderedRowCount !== null && summary.renderedRowCount > MAX_EVIDENCE_DRAWER_ROW_COUNT) {
      failures.push(`${prefix}: evidence drawer ${index + 1} has ${summary.renderedRowCount} rendered table row(s); expected <= ${MAX_EVIDENCE_DRAWER_ROW_COUNT}.`);
    }
    if (
      summary.shownCount !== null &&
      summary.totalCount !== null &&
      summary.totalCount < summary.shownCount
    ) {
      failures.push(`${prefix}: evidence drawer ${index + 1} totalCount ${summary.totalCount} is less than shownCount ${summary.shownCount}.`);
    }
  }
  for (const section of snapshot.sectionSummaries ?? []) {
    if (section.evidenceShownCount > MAX_SECTION_EVIDENCE_SHOWN_COUNT) {
      failures.push(`${prefix}: section #${section.id} exposes ${section.evidenceShownCount} evidence rows before expansion; expected <= ${MAX_SECTION_EVIDENCE_SHOWN_COUNT}.`);
    }
    if (section.tableCount > 0 && section.figureCount === 0 && section.chartCount === 0) {
      failures.push(`${prefix}: section #${section.id} contains table evidence without a primary figure/chart.`);
    }
  }
  if (viewport.width <= 640) {
    if (snapshot.mobileTocDetailsCount < 1) {
      failures.push(`${prefix}: mobile TOC details summary is missing.`);
    }
    if (snapshot.mobileTocOpenCount > 0) {
      failures.push(`${prefix}: mobile TOC should be collapsed by default.`);
    }
    if (snapshot.mobileEvidenceCellLabelCount < 20) {
      failures.push(`${prefix}: mobile evidence table cells are missing row-card field labels.`);
    }
  }

  return failures;
}

function buildIndexFailures({ documentStatus, route, snapshot, viewport }) {
  const prefix = `${viewport.name}px ${route.name} ${route.path}`;
  const failures = [];

  if (documentStatus < 200 || documentStatus >= 400) {
    failures.push(`${prefix}: document request returned HTTP ${documentStatus}.`);
  }
  if (!snapshot?.hasRoot) {
    failures.push(`${prefix}: #root element is missing.`);
  }
  if (snapshot.bodyTextLength < 400) {
    failures.push(`${prefix}: index body text is too short (${snapshot.bodyTextLength}); sample=${formatSnapshotSample(snapshot)}.`);
  }
  for (const expectedText of ['专题报告', '专题报告图表基准']) {
    if (!snapshot.bodyText.includes(expectedText)) {
      failures.push(`${prefix}: expected index text ${JSON.stringify(expectedText)} is missing; sample=${formatSnapshotSample(snapshot)}.`);
    }
  }
  if (snapshot.finalPath !== '/reports/special') {
    failures.push(`${prefix}: expected final path /reports/special, got ${snapshot.finalPath}.`);
  }
  if (snapshot.horizontalOverflow) {
    failures.push(`${prefix}: document has page-level horizontal overflow.`);
  }
  if (snapshot.viteErrorOverlay) {
    failures.push(`${prefix}: Vite error overlay is visible.`);
  }
  if (!snapshot.hasBoard) {
    failures.push(`${prefix}: chart reference board is missing.`);
  }
  if (snapshot.cardCount !== EXPECTED_CHART_GALLERY_CARD_COUNT) {
    failures.push(`${prefix}: expected ${EXPECTED_CHART_GALLERY_CARD_COUNT} chart reference cards, got ${snapshot.cardCount}; templates=${(snapshot.templateIds ?? []).join(', ') || '<none>'}.`);
  }
  if (snapshot.frameCount !== EXPECTED_CHART_GALLERY_CARD_COUNT) {
    failures.push(`${prefix}: expected ${EXPECTED_CHART_GALLERY_CARD_COUNT} chart reference frames, got ${snapshot.frameCount}.`);
  }
  for (const [label, count] of [
    ['preview kind', snapshot.previewCount],
    ['question', snapshot.questionHandleCount],
    ['claim', snapshot.claimHandleCount],
    ['mobile policy', snapshot.mobilePolicyHandleCount],
    ['mark count', snapshot.markCountHandleCount],
    ['label count', snapshot.labelCountHandleCount],
    ['palette', snapshot.paletteHandleCount],
  ]) {
    if (count !== EXPECTED_CHART_GALLERY_CARD_COUNT) {
      failures.push(`${prefix}: expected ${EXPECTED_CHART_GALLERY_CARD_COUNT} chart reference ${label} handle(s), got ${count}.`);
    }
  }
  if (snapshot.cardViewportOverflowCount > 0) {
    failures.push(`${prefix}: ${snapshot.cardViewportOverflowCount} chart reference card(s) overflow the viewport.`);
  }
  if (viewport.width <= 390 && snapshot.cardMaxWidth > viewport.width + 2) {
    failures.push(`${prefix}: chart reference card width is too large for phone viewport (${snapshot.cardMaxWidth}px > ${viewport.width}px).`);
  }

  return failures;
}

function buildMobileCompactFallbackFailures({ route, snapshot, viewport }) {
  const prefix = `${viewport.name}px ${route.name} ${route.path}`;
  if (!snapshot) {
    return [`${prefix}: failed to capture mobile compact TOC fallback snapshot.`];
  }

  const failures = [];
  for (const result of snapshot.results ?? []) {
    if (!result.targetExists) {
      failures.push(`${prefix}: mobile compact fallback target #${result.microId} is missing.`);
      continue;
    }
    if (result.activeTargetId !== result.microId) {
      failures.push(`${prefix}: mobile compact fallback did not activate micro target #${result.microId}; active=${result.activeTargetId || '<empty>'}.`);
    }
    if (result.actualEntryId !== result.expectedEntryId) {
      failures.push(`${prefix}: mobile compact current for micro target #${result.microId} must map to visible parent "${result.expectedEntryId}", got "${result.actualEntryId || '<empty>'}" (${result.summaryText || 'no summary text'}).`);
    }
  }

  return failures;
}

async function evaluateVisualSnapshot(client, sessionId) {
  const expression = `(${captureSpecialReportVisualSnapshot.toString()})()`;
  const evaluated = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  return evaluated.result?.value ?? null;
}

async function evaluateIndexSnapshot(client, sessionId) {
  const expression = `(${captureSpecialReportIndexSnapshot.toString()})()`;
  const evaluated = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  return evaluated.result?.value ?? null;
}

async function evaluateMobileCompactFallbackSnapshot(client, sessionId) {
  const expression = `(${captureMobileCompactFallbackSnapshot.toString()})(${JSON.stringify(MOBILE_COMPACT_ACTIVE_FALLBACKS)})`;
  const evaluated = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  return evaluated.result?.value ?? null;
}

function isReportRouteContentReady(snapshot, route) {
  if (!snapshot) {
    return false;
  }
  if (snapshot.finalPath !== '/reports/special/gsv-monthly-channel') {
    return false;
  }
  if (route.exportMode && snapshot.reportModeDataset !== 'export') {
    return false;
  }
  return (
    snapshot.bodyTextLength >= 800
    && snapshot.bodyText.includes('专题报告')
    && snapshot.chartNodeCount === EXPECTED_ECHARTS_CHART_NODE_COUNT
    && snapshot.staticVisualCount === EXPECTED_STATIC_DOM_VISUAL_COUNT
    && snapshot.evidenceDetailCount === EXPECTED_EVIDENCE_DRAWER_SECTION_IDS.length
    && snapshot.publishedPlaceholderCount === 0
    && snapshot.tocNavSummaries?.some((summary) => summary.mode === 'desktop')
    && snapshot.tocNavSummaries?.some((summary) => summary.mode === 'mobile')
  );
}

function isIndexRouteContentReady(snapshot) {
  return Boolean(
    snapshot
    && snapshot.finalPath === '/reports/special'
    && snapshot.bodyTextLength >= 400
    && snapshot.bodyText.includes('专题报告')
    && snapshot.hasBoard
    && snapshot.cardCount === EXPECTED_CHART_GALLERY_CARD_COUNT
  );
}

async function waitForRouteContentReady({ client, route, sessionId, settleTimeoutMs }) {
  const deadline = Date.now() + settleTimeoutMs;
  let snapshot = route.kind === 'gallery'
    ? await evaluateIndexSnapshot(client, sessionId)
    : await evaluateVisualSnapshot(client, sessionId);

  while (Date.now() < deadline) {
    const isReady = route.kind === 'gallery'
      ? isIndexRouteContentReady(snapshot)
      : isReportRouteContentReady(snapshot, route);
    if (isReady) {
      return snapshot;
    }
    await sleep(DEFAULT_ROUTE_SETTLE_POLL_MS);
    snapshot = route.kind === 'gallery'
      ? await evaluateIndexSnapshot(client, sessionId)
      : await evaluateVisualSnapshot(client, sessionId);
  }

  return snapshot;
}

async function waitForVisualSnapshot({ client, documentStatus, route, sessionId, settleTimeoutMs, viewport }) {
  const deadline = Date.now() + settleTimeoutMs;
  let snapshot = await evaluateVisualSnapshot(client, sessionId);
  let failures = snapshot
    ? buildVisualFailures({ documentStatus, route, snapshot, viewport })
    : [`${viewport.name}px ${route.name} ${route.path}: failed to capture special report visual snapshot.`];

  while (failures.length > 0 && Date.now() < deadline) {
    await sleep(DEFAULT_ROUTE_SETTLE_POLL_MS);
    snapshot = await evaluateVisualSnapshot(client, sessionId);
    failures = snapshot
      ? buildVisualFailures({ documentStatus, route, snapshot, viewport })
      : [`${viewport.name}px ${route.name} ${route.path}: failed to capture special report visual snapshot.`];
  }

  return { failures, snapshot };
}

async function waitForIndexSnapshot({ client, documentStatus, route, sessionId, settleTimeoutMs, viewport }) {
  const deadline = Date.now() + settleTimeoutMs;
  let snapshot = await evaluateIndexSnapshot(client, sessionId);
  let failures = snapshot
    ? buildIndexFailures({ documentStatus, route, snapshot, viewport })
    : [`${viewport.name}px ${route.name} ${route.path}: failed to capture special report index snapshot.`];

  while (failures.length > 0 && Date.now() < deadline) {
    await sleep(DEFAULT_ROUTE_SETTLE_POLL_MS);
    snapshot = await evaluateIndexSnapshot(client, sessionId);
    failures = snapshot
      ? buildIndexFailures({ documentStatus, route, snapshot, viewport })
      : [`${viewport.name}px ${route.name} ${route.path}: failed to capture special report index snapshot.`];
  }

  return { failures, snapshot };
}

async function scrollThroughLazyReportCharts({ client, sessionId }) {
  await client.send('Runtime.evaluate', {
    expression: `
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const getMaxScroll = () => Math.max(
          0,
          Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) - window.innerHeight
        );
        for (let attempt = 0; attempt < 80; attempt += 1) {
          if (document.querySelectorAll('[data-chart-mounted]').length > 0) {
            break;
          }
          await sleep(100);
        }
        for (const ratio of [0, 0.2, 0.45, 0.7, 1]) {
          window.scrollTo(0, Math.round(getMaxScroll() * ratio));
          await sleep(180);
        }
        for (const chartNode of [...document.querySelectorAll('[data-chart-mounted]')]) {
          chartNode.scrollIntoView({ block: 'center', inline: 'nearest' });
          window.dispatchEvent(new Event('scroll'));
          await sleep(260);
        }
        window.dispatchEvent(new Event('aios:report:mount-all-charts'));
        await sleep(600);
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event('scroll'));
        await sleep(180);
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
}

async function createInstrumentedTarget({ baseUrl, client, cookies, route, timeoutMs, viewport }) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });

  await client.send('Network.enable', {}, sessionId);
  for (const cookie of cookies) {
    const cookieResult = await client.send('Network.setCookie', {
      name: cookie.name,
      url: baseUrl,
      value: cookie.value,
    }, sessionId);
    if (cookieResult.success !== true) {
      throw new Error(`Failed to install special report browser smoke cookie ${cookie.name}.`);
    }
  }
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__specialReportSmokeErrors = [];
      window.addEventListener('error', (event) => {
        window.__specialReportSmokeErrors.push(event.message || 'window error');
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__specialReportSmokeErrors.push(String(event.reason || 'unhandled rejection'));
      });
      const originalConsoleError = console.error;
      console.error = (...args) => {
        window.__specialReportSmokeConsoleErrors = window.__specialReportSmokeConsoleErrors || [];
        window.__specialReportSmokeConsoleErrors.push(args.map((arg) => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }).join(' '));
        originalConsoleError.apply(console, args);
      };
    `,
  }, sessionId);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    mobile: viewport.mobile,
  }, sessionId);

  const targetUrl = buildRouteUrl(baseUrl, route.path);
  const documentResponse = await fetchWithTimeout(targetUrl, timeoutMs, {
    headers: cookies.length
      ? { Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') }
      : undefined,
  });
  const loadWaiter = client.waitForEvent('Page.loadEventFired', sessionId, timeoutMs);
  const navigation = await client.send('Page.navigate', { url: targetUrl }, sessionId);
  if (navigation.errorText) {
    throw new Error(`${viewport.name}px ${route.name}: navigation failed: ${navigation.errorText}`);
  }
  await loadWaiter;

  return {
    documentStatus: documentResponse.status,
    sessionId,
    targetId,
  };
}

export async function runSpecialReportBrowserVisualSmoke({
  baseUrl = normalizeBaseUrl(process.env.FRONTEND_SMOKE_BASE_URL),
  cookies = readSmokeCookiesFromEnv(),
  requireAuthCookies = process.env.SPECIAL_REPORT_BROWSER_SMOKE_REQUIRE_AUTH !== '0',
  routes = SPECIAL_REPORT_BROWSER_ROUTES,
  settleTimeoutMs = parseIntegerEnv('SPECIAL_REPORT_BROWSER_SMOKE_SETTLE_TIMEOUT_MS', DEFAULT_SPECIAL_REPORT_ROUTE_SETTLE_TIMEOUT_MS),
  timeoutMs = parseIntegerEnv('SPECIAL_REPORT_BROWSER_SMOKE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
  viewports = SPECIAL_REPORT_BROWSER_VIEWPORTS,
} = {}) {
  ensureCdpWebSocketRuntime();
  const authState = cookies.length > 0
    ? 'authenticated cookie header provided'
    : requireAuthCookies
      ? 'missing authenticated smoke cookies'
      : 'anonymous redirect allowed';
  const anonymousRedirectMode = !requireAuthCookies && cookies.length === 0;

  if (requireAuthCookies && cookies.length === 0) {
    return {
      authState,
      baseUrl,
      engine: 'chrome-cdp (not launched: missing authenticated smoke cookies)',
      failures: [
        [
          'Special report browser smoke requires authenticated browser state for the protected report route.',
          'Provide FRONTEND_SMOKE_COOKIE_HEADER="aios_access_token=...; aios_refresh_token=..."',
          'or set SPECIAL_REPORT_BROWSER_SMOKE_REQUIRE_AUTH=0 only when intentionally checking anonymous redirects.',
        ].join(' '),
      ],
      results: [],
    };
  }

  const chrome = await launchChrome();
  const client = new CdpClient(chrome.wsUrl);
  const failures = [];
  const results = [];

  try {
    await client.connect();

    for (const viewport of viewports) {
      for (const route of routes) {
        const target = await createInstrumentedTarget({
          baseUrl,
          client,
          cookies,
          route,
          timeoutMs,
          viewport,
        });
        try {
          if (anonymousRedirectMode) {
            const settled = await waitForAnonymousRedirectSnapshot({
              client,
              documentStatus: target.documentStatus,
              route,
              sessionId: target.sessionId,
              settleTimeoutMs,
              viewport,
            });
            failures.push(...settled.failures);
            results.push({
              kind: 'anonymous-redirect',
              route: route.path,
              viewport: viewport.name,
              status: target.documentStatus,
              finalPath: settled.snapshot?.finalPath,
              finalSearch: settled.snapshot?.finalSearch,
              redirectTarget: new URLSearchParams(settled.snapshot?.finalSearch).get('redirect'),
            });
            continue;
          }
          await waitForRouteContentReady({
            client,
            route,
            sessionId: target.sessionId,
            settleTimeoutMs,
          });
          if (!route.exportMode && route.kind !== 'gallery') {
            await scrollThroughLazyReportCharts({
              client,
              sessionId: target.sessionId,
            });
          }
          if (route.kind === 'gallery') {
            const settled = await waitForIndexSnapshot({
              client,
              documentStatus: target.documentStatus,
              route,
              sessionId: target.sessionId,
              settleTimeoutMs,
              viewport,
            });
            failures.push(...settled.failures);
            results.push({
              kind: 'gallery',
              route: route.path,
              viewport: viewport.name,
              status: target.documentStatus,
              finalPath: settled.snapshot?.finalPath,
              finalSearch: settled.snapshot?.finalSearch,
              cardCount: settled.snapshot?.cardCount ?? 0,
              cardMaxWidth: settled.snapshot?.cardMaxWidth ?? 0,
              claimHandleCount: settled.snapshot?.claimHandleCount ?? 0,
              frameCount: settled.snapshot?.frameCount ?? 0,
              horizontalOverflow: Boolean(settled.snapshot?.horizontalOverflow),
              mobilePolicyHandleCount: settled.snapshot?.mobilePolicyHandleCount ?? 0,
              previewCount: settled.snapshot?.previewCount ?? 0,
              questionHandleCount: settled.snapshot?.questionHandleCount ?? 0,
            });
            continue;
          }
          const settled = await waitForVisualSnapshot({
            client,
            documentStatus: target.documentStatus,
            route,
            sessionId: target.sessionId,
            settleTimeoutMs,
            viewport,
          });
          let mobileCompactFallbackSnapshot = null;
          let mobileCompactFallbackFailures = [];
          if (viewport.mobile) {
            mobileCompactFallbackSnapshot = await evaluateMobileCompactFallbackSnapshot(client, target.sessionId);
            mobileCompactFallbackFailures = buildMobileCompactFallbackFailures({
              route,
              snapshot: mobileCompactFallbackSnapshot,
              viewport,
            });
          }
          failures.push(...settled.failures, ...mobileCompactFallbackFailures);
          const tocSummaries = settled.snapshot?.tocNavSummaries ?? [];
          const desktopTocSummary = tocSummaries.find((summary) => summary.mode === 'desktop');
          const mobileTocSummary = tocSummaries.find((summary) => summary.mode === 'mobile');
          results.push({
            kind: 'report',
            route: route.path,
            viewport: viewport.name,
            status: target.documentStatus,
            finalPath: settled.snapshot?.finalPath,
            finalSearch: settled.snapshot?.finalSearch,
            chartMissingSemanticMetadataCount: settled.snapshot?.chartMissingSemanticMetadataCount ?? 0,
            chartBuilders: settled.snapshot?.chartBuilders ?? [],
            chartNodeCount: settled.snapshot?.chartNodeCount ?? 0,
            chartMountedCount: settled.snapshot?.chartMountedCount ?? 0,
            chartRenderedCount: settled.snapshot?.chartRenderedCount ?? 0,
            chartSectionIds: settled.snapshot?.chartSectionIds ?? [],
            evidenceDetailCount: settled.snapshot?.evidenceDetailCount ?? 0,
            evidenceDrawerSectionIds: (settled.snapshot?.evidenceSummaries ?? []).map((summary) => summary.sectionId),
            horizontalOverflow: Boolean(settled.snapshot?.horizontalOverflow),
            mobileEvidenceCellLabelCount: settled.snapshot?.mobileEvidenceCellLabelCount ?? 0,
            sectionEvidenceShownMax: Math.max(
              0,
              ...((settled.snapshot?.sectionSummaries ?? []).map((section) => section.evidenceShownCount ?? 0)),
            ),
            staticVisualCount: settled.snapshot?.staticVisualCount ?? 0,
            staticVisualNames: settled.snapshot?.staticVisualNames ?? [],
            staticVisualMaxHeight: settled.snapshot?.staticVisualMaxHeight ?? 0,
            staticVisualMissingSemanticMetadataCount: settled.snapshot?.staticVisualMissingSemanticMetadataCount ?? 0,
            staticVisualNonZeroBoxCount: settled.snapshot?.staticVisualNonZeroBoxCount ?? 0,
            publishedPlaceholderCount: settled.snapshot?.publishedPlaceholderCount ?? 0,
            desktopTocEntryCount: desktopTocSummary?.entryCount ?? 0,
            desktopTocVisibleEntryCount: desktopTocSummary?.visibleEntryCount ?? 0,
            mobileCompactFallbackFailedCount: mobileCompactFallbackFailures.length,
            mobileTocEntryCount: mobileTocSummary?.entryCount ?? 0,
            mobileTocVisibleEntryCount: mobileTocSummary?.visibleEntryCount ?? 0,
          });
        } finally {
          await client.send('Target.closeTarget', { targetId: target.targetId });
        }
      }
    }
  } finally {
    client.close();
    await chrome.cleanup();
  }

  return {
    authState,
    baseUrl,
    engine: `chrome-cdp (${chrome.executable})`,
    failures,
    results,
  };
}
