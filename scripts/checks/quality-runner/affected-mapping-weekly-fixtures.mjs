import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertWeeklyAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const weeklyMetaCheck = selectAffectedGates(registry, ['scripts/checks/weekly/behavior-gate-registry.mjs']);
  assertTrue(weeklyMetaCheck.names.includes('verify:weekly:behavior-gate-registry'), 'weekly meta check command should select weekly behavior registry gate');
  assertTrue(weeklyMetaCheck.names.includes('verify:quality-runner:registry'), 'weekly meta check command should select quality runner registry self-check');

  const weeklyBehaviorRegistryHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/behavior-gate-registry.behavior-fixtures.mjs']);
  assertTrue(weeklyBehaviorRegistryHelper.names.includes('lint:scripts'), 'weekly behavior registry helper should keep script lint coverage');
  assertTrue(weeklyBehaviorRegistryHelper.names.includes('verify:weekly:behavior-gate-registry-behavior'), 'weekly behavior registry helper should select behavior fixture gate');
  assertTrue(weeklyBehaviorRegistryHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly behavior registry helper should select production registry gate');
  assertFalse(weeklyBehaviorRegistryHelper.names.includes('verify:weekly:funnel'), 'weekly behavior registry helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyBehaviorRegistryHelper.names.includes('verify:backend:size'), 'weekly behavior registry helper should not fall back to backend size gate');

  const weeklyBehaviorGuardQualityHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/behavior-guard-quality.behavior-fixtures.mjs']);
  assertTrue(weeklyBehaviorGuardQualityHelper.names.includes('lint:scripts'), 'weekly behavior guard quality helper should keep script lint coverage');
  assertTrue(weeklyBehaviorGuardQualityHelper.names.includes('verify:weekly:behavior-guard-quality-behavior'), 'weekly behavior guard quality helper should select behavior fixture gate');
  assertTrue(weeklyBehaviorGuardQualityHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly behavior guard quality helper should select weekly behavior registry gate');
  assertFalse(weeklyBehaviorGuardQualityHelper.names.includes('verify:weekly:funnel'), 'weekly behavior guard quality helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyBehaviorGuardQualityHelper.names.includes('verify:backend:size'), 'weekly behavior guard quality helper should not fall back to backend size gate');

  const weeklyBoundaryRegistryHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/boundary-gate-registry.behavior-fixtures.mjs']);
  assertTrue(weeklyBoundaryRegistryHelper.names.includes('lint:scripts'), 'weekly boundary registry helper should keep script lint coverage');
  assertTrue(weeklyBoundaryRegistryHelper.names.includes('verify:weekly:boundary-gate-registry-behavior'), 'weekly boundary registry helper should select behavior fixture gate');
  assertTrue(weeklyBoundaryRegistryHelper.names.includes('verify:weekly:boundary-gate-registry'), 'weekly boundary registry helper should select weekly boundary registry gate');
  assertFalse(weeklyBoundaryRegistryHelper.names.includes('verify:weekly:funnel'), 'weekly boundary registry helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyBoundaryRegistryHelper.names.includes('verify:backend:size'), 'weekly boundary registry helper should not fall back to backend size gate');

  const weeklyTabsMetaCheck = selectAffectedGates(registry, ['scripts/checks/weekly-tabs/boundary-gate-registry.mjs']);
  assertTrue(weeklyTabsMetaCheck.names.includes('verify:weekly:boundary-gate-registry'), 'weekly tabs meta check command should select weekly boundary registry gate');
  assertTrue(weeklyTabsMetaCheck.names.includes('verify:weekly:behavior-gate-registry'), 'weekly tabs meta check command should select weekly behavior registry gate');

  const weeklyTabsBoundaryCheck = selectAffectedGates(registry, ['scripts/checks/weekly-tabs/style-boundaries.mjs']);
  assertTrue(weeklyTabsBoundaryCheck.names.includes('verify:weekly:style-boundaries'), 'weekly tabs boundary check command should select its direct gate');
  assertTrue(weeklyTabsBoundaryCheck.names.includes('verify:weekly:boundary-gate-registry'), 'weekly tabs boundary check command should select boundary registry gate');

  const weeklyTabsStyleBoundaryHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-style-boundaries-core.mjs']);
  assertTrue(weeklyTabsStyleBoundaryHelper.names.includes('lint:scripts'), 'weekly tabs style boundary helper should keep script lint coverage');
  assertTrue(weeklyTabsStyleBoundaryHelper.names.includes('verify:weekly:style-boundaries'), 'weekly tabs style boundary helper should select its direct gate');
  assertTrue(weeklyTabsStyleBoundaryHelper.names.includes('verify:weekly:boundary-gate-registry'), 'weekly tabs style boundary helper should select boundary registry gate');
  assertFalse(weeklyTabsStyleBoundaryHelper.names.includes('verify:backend:size'), 'weekly tabs style boundary helper should not fall back to backend size gate');

  const weeklyTabsContractLayerHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-contract-layers-core.mjs']);
  assertTrue(weeklyTabsContractLayerHelper.names.includes('lint:scripts'), 'weekly tabs contract layer helper should keep script lint coverage');
  assertTrue(weeklyTabsContractLayerHelper.names.includes('verify:weekly:contract-layers'), 'weekly tabs contract layer helper should select its direct gate');
  assertTrue(weeklyTabsContractLayerHelper.names.includes('verify:weekly:boundary-gate-registry'), 'weekly tabs contract layer helper should select boundary registry gate');
  assertFalse(weeklyTabsContractLayerHelper.names.includes('verify:backend:size'), 'weekly tabs contract layer helper should not fall back to backend size gate');

  const weeklyTabsContractImportHygieneHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-contract-import-hygiene-core.mjs']);
  assertTrue(
    weeklyTabsContractImportHygieneHelper.names.includes('lint:scripts'),
    'weekly tabs contract import hygiene helper should keep script lint coverage',
  );
  assertTrue(
    weeklyTabsContractImportHygieneHelper.names.includes('verify:weekly:contract-import-hygiene'),
    'weekly tabs contract import hygiene helper should select its direct gate',
  );
  assertTrue(
    weeklyTabsContractImportHygieneHelper.names.includes('verify:weekly:boundary-gate-registry'),
    'weekly tabs contract import hygiene helper should select boundary registry gate',
  );
  assertFalse(
    weeklyTabsContractImportHygieneHelper.names.includes('verify:backend:size'),
    'weekly tabs contract import hygiene helper should not fall back to backend size gate',
  );

  const weeklyTabsContractBoundaryHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-contract-boundaries-core.mjs']);
  assertTrue(weeklyTabsContractBoundaryHelper.names.includes('lint:scripts'), 'weekly tabs contract boundary helper should keep script lint coverage');
  assertTrue(
    weeklyTabsContractBoundaryHelper.names.includes('verify:weekly:contract-boundaries'),
    'weekly tabs contract boundary helper should select its direct gate',
  );
  assertTrue(
    weeklyTabsContractBoundaryHelper.names.includes('verify:weekly:boundary-gate-registry'),
    'weekly tabs contract boundary helper should select boundary registry gate',
  );
  assertFalse(
    weeklyTabsContractBoundaryHelper.names.includes('verify:backend:size'),
    'weekly tabs contract boundary helper should not fall back to backend size gate',
  );

  const weeklyTabsExportedPropsBoundaryHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-exported-props-boundaries-core.mjs']);
  assertTrue(
    weeklyTabsExportedPropsBoundaryHelper.names.includes('lint:scripts'),
    'weekly tabs exported props boundary helper should keep script lint coverage',
  );
  assertTrue(
    weeklyTabsExportedPropsBoundaryHelper.names.includes('verify:weekly:exported-props-boundaries'),
    'weekly tabs exported props boundary helper should select its direct gate',
  );
  assertTrue(
    weeklyTabsExportedPropsBoundaryHelper.names.includes('verify:weekly:boundary-gate-registry'),
    'weekly tabs exported props boundary helper should select boundary registry gate',
  );
  assertFalse(
    weeklyTabsExportedPropsBoundaryHelper.names.includes('verify:backend:size'),
    'weekly tabs exported props boundary helper should not fall back to backend size gate',
  );

  const weeklyTabsAdapterLayerHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-adapter-layers-core.mjs']);
  assertTrue(weeklyTabsAdapterLayerHelper.names.includes('lint:scripts'), 'weekly tabs adapter layer helper should keep script lint coverage');
  assertTrue(weeklyTabsAdapterLayerHelper.names.includes('verify:weekly:adapter-layers'), 'weekly tabs adapter layer helper should select its direct gate');
  assertTrue(weeklyTabsAdapterLayerHelper.names.includes('verify:weekly:boundary-gate-registry'), 'weekly tabs adapter layer helper should select boundary registry gate');
  assertFalse(weeklyTabsAdapterLayerHelper.names.includes('verify:backend:size'), 'weekly tabs adapter layer helper should not fall back to backend size gate');

  const weeklyTabsRenderBoundaryHelper = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-tabs-render-boundaries-core.mjs']);
  assertTrue(weeklyTabsRenderBoundaryHelper.names.includes('lint:scripts'), 'weekly tabs render boundary helper should keep script lint coverage');
  assertTrue(weeklyTabsRenderBoundaryHelper.names.includes('verify:weekly:render-boundaries'), 'weekly tabs render boundary helper should select its direct gate');
  assertTrue(weeklyTabsRenderBoundaryHelper.names.includes('verify:weekly:boundary-gate-registry'), 'weekly tabs render boundary helper should select boundary registry gate');
  assertFalse(weeklyTabsRenderBoundaryHelper.names.includes('verify:backend:size'), 'weekly tabs render boundary helper should not fall back to backend size gate');

  const weeklyOverviewCheck = selectAffectedGates(registry, ['scripts/checks/weekly-overview/kpi.behavior.mjs']);
  assertTrue(weeklyOverviewCheck.names.includes('verify:weekly:overview-kpi'), 'weekly overview check command should select its direct gate');
  assertTrue(weeklyOverviewCheck.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview check command should select weekly behavior registry gate');

  const weeklyPlatformCheck = selectAffectedGates(registry, ['scripts/checks/weekly-platform-tab/content-routing.behavior.mjs']);
  assertTrue(weeklyPlatformCheck.names.includes('verify:weekly:platform-tab-content-routing'), 'weekly platform tab check command should select its direct gate');
  assertTrue(weeklyPlatformCheck.names.includes('verify:weekly:behavior-gate-registry'), 'weekly platform tab check command should select weekly behavior registry gate');

  const weeklyDouyinCheck = selectAffectedGates(registry, ['scripts/checks/weekly-douyin-card/product-section.behavior.mjs']);
  assertTrue(weeklyDouyinCheck.names.includes('verify:weekly:platform-tab-douyin-card-product-section'), 'weekly Douyin check command should select its direct gate');
  assertTrue(weeklyDouyinCheck.names.includes('verify:weekly:behavior-gate-registry'), 'weekly Douyin check command should select weekly behavior registry gate');

  const weeklyTmallCheck = selectAffectedGates(registry, ['scripts/checks/weekly-tmall/goods-section.behavior.mjs']);
  assertTrue(weeklyTmallCheck.names.includes('verify:weekly:platform-tab-tmall-goods-section'), 'weekly Tmall check command should select its direct gate');
  assertTrue(weeklyTmallCheck.names.includes('verify:weekly:behavior-gate-registry'), 'weekly Tmall check command should select weekly behavior registry gate');

  const weeklyHelper = selectAffectedGates(registry, ['scripts/lib/weekly/behavior-assert-utils.mjs']);
  assertTrue(weeklyHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly helper changes should select weekly behavior registry gate');
  assertTrue(weeklyHelper.names.includes('verify:weekly:platform-tab-tmall-goods-section'), 'weekly helper changes should select weekly behavior guard coverage');
  assertFalse(weeklyHelper.names.includes('verify:backend:size'), 'weekly helper changes should not fall back to backend size gate');

  const weeklyTsxGuardHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/tsx-guard-utils.behavior-fixtures.mjs']);
  assertTrue(weeklyTsxGuardHelper.names.includes('lint:scripts'), 'weekly TSX guard helper should keep script lint coverage');
  assertTrue(weeklyTsxGuardHelper.names.includes('verify:weekly:tsx-guard-utils'), 'weekly TSX guard helper should select its behavior gate');
  assertTrue(weeklyTsxGuardHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly TSX guard helper should select weekly behavior registry gate');
  assertFalse(weeklyTsxGuardHelper.names.includes('verify:weekly:funnel'), 'weekly TSX guard helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyTsxGuardHelper.names.includes('verify:backend:size'), 'weekly TSX guard helper should not fall back to backend size gate');

  const weeklyTsxGuardSourceHelper = selectAffectedGates(registry, ['scripts/lib/weekly/tsx-guard-utils.mjs']);
  assertTrue(weeklyTsxGuardSourceHelper.names.includes('lint:scripts'), 'weekly TSX guard source helper should keep script lint coverage');
  assertTrue(weeklyTsxGuardSourceHelper.names.includes('verify:weekly:tsx-guard-utils'), 'weekly TSX guard source helper should select TSX guard coverage');
  assertTrue(weeklyTsxGuardSourceHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly TSX guard source helper should select weekly behavior registry gate');
  assertFalse(weeklyTsxGuardSourceHelper.names.includes('verify:backend:size'), 'weekly TSX guard source helper should not fall back to backend size gate');

  const weeklyContentAdaptersHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/platform-tab-content-adapters.behavior-fixtures.mjs']);
  assertTrue(weeklyContentAdaptersHelper.names.includes('lint:scripts'), 'weekly content adapters helper should keep script lint coverage');
  assertTrue(weeklyContentAdaptersHelper.names.includes('verify:weekly:platform-tab-content-adapters'), 'weekly content adapters helper should select its behavior gate');
  assertTrue(weeklyContentAdaptersHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly content adapters helper should select weekly behavior registry gate');
  assertFalse(weeklyContentAdaptersHelper.names.includes('verify:weekly:funnel'), 'weekly content adapters helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyContentAdaptersHelper.names.includes('verify:backend:size'), 'weekly content adapters helper should not fall back to backend size gate');

  const weeklyContentRoutingHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/platform-tab-content-routing.behavior-fixtures.mjs']);
  assertTrue(weeklyContentRoutingHelper.names.includes('lint:scripts'), 'weekly content routing helper should keep script lint coverage');
  assertTrue(weeklyContentRoutingHelper.names.includes('verify:weekly:platform-tab-content-routing'), 'weekly content routing helper should select its behavior gate');
  assertTrue(weeklyContentRoutingHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly content routing helper should select weekly behavior registry gate');
  assertFalse(weeklyContentRoutingHelper.names.includes('verify:weekly:funnel'), 'weekly content routing helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyContentRoutingHelper.names.includes('verify:backend:size'), 'weekly content routing helper should not fall back to backend size gate');

  const weeklyPrimaryMetricsHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/primary-metrics.behavior-fixtures.mjs']);
  assertTrue(weeklyPrimaryMetricsHelper.names.includes('lint:scripts'), 'weekly primary metrics helper should keep script lint coverage');
  assertTrue(weeklyPrimaryMetricsHelper.names.includes('verify:weekly:primary-metrics'), 'weekly primary metrics helper should select its behavior gate');
  assertTrue(weeklyPrimaryMetricsHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly primary metrics helper should select weekly behavior registry gate');
  assertFalse(weeklyPrimaryMetricsHelper.names.includes('verify:weekly:funnel'), 'weekly primary metrics helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyPrimaryMetricsHelper.names.includes('verify:backend:size'), 'weekly primary metrics helper should not fall back to backend size gate');

  const weeklyPlatformRenderStateHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/platform-tab-render-state.behavior-fixtures.mjs']);
  assertTrue(weeklyPlatformRenderStateHelper.names.includes('lint:scripts'), 'weekly platform render-state helper should keep script lint coverage');
  assertTrue(weeklyPlatformRenderStateHelper.names.includes('verify:weekly:platform-tab-render-state'), 'weekly platform render-state helper should select its behavior gate');
  assertTrue(weeklyPlatformRenderStateHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly platform render-state helper should select weekly behavior registry gate');
  assertFalse(weeklyPlatformRenderStateHelper.names.includes('verify:weekly:funnel'), 'weekly platform render-state helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyPlatformRenderStateHelper.names.includes('verify:backend:size'), 'weekly platform render-state helper should not fall back to backend size gate');

  const weeklyPlatformTrendSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/platform-tab-trend-section-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyPlatformTrendSectionHelper.names.includes('lint:scripts'), 'weekly platform trend-section helper should keep script lint coverage');
  assertTrue(weeklyPlatformTrendSectionHelper.names.includes('verify:weekly:platform-tab-trend-section-adapter'), 'weekly platform trend-section helper should select its behavior gate');
  assertTrue(weeklyPlatformTrendSectionHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly platform trend-section helper should select weekly behavior registry gate');
  assertFalse(weeklyPlatformTrendSectionHelper.names.includes('verify:weekly:funnel'), 'weekly platform trend-section helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyPlatformTrendSectionHelper.names.includes('verify:backend:size'), 'weekly platform trend-section helper should not fall back to backend size gate');

  const weeklyPlatformKpiSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/platform-tab-kpi-section-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyPlatformKpiSectionHelper.names.includes('lint:scripts'), 'weekly platform KPI-section helper should keep script lint coverage');
  assertTrue(weeklyPlatformKpiSectionHelper.names.includes('verify:weekly:platform-tab-kpi-section-adapter'), 'weekly platform KPI-section helper should select its behavior gate');
  assertTrue(weeklyPlatformKpiSectionHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly platform KPI-section helper should select weekly behavior registry gate');
  assertFalse(weeklyPlatformKpiSectionHelper.names.includes('verify:weekly:funnel'), 'weekly platform KPI-section helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyPlatformKpiSectionHelper.names.includes('verify:backend:size'), 'weekly platform KPI-section helper should not fall back to backend size gate');

  const weeklyOverviewTabContentHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-tab-content-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewTabContentHelper.names.includes('lint:scripts'), 'weekly overview tab-content helper should keep script lint coverage');
  assertTrue(weeklyOverviewTabContentHelper.names.includes('verify:weekly:overview-tab-content-adapter'), 'weekly overview tab-content helper should select its behavior gate');
  assertTrue(weeklyOverviewTabContentHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview tab-content helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewTabContentHelper.names.includes('verify:weekly:funnel'), 'weekly overview tab-content helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewTabContentHelper.names.includes('verify:backend:size'), 'weekly overview tab-content helper should not fall back to backend size gate');

  const weeklyOverviewPlatformBreakdownHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-platform-breakdown-section-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewPlatformBreakdownHelper.names.includes('lint:scripts'), 'weekly overview platform-breakdown helper should keep script lint coverage');
  assertTrue(weeklyOverviewPlatformBreakdownHelper.names.includes('verify:weekly:overview-platform-breakdown-section-adapter'), 'weekly overview platform-breakdown helper should select its behavior gate');
  assertTrue(weeklyOverviewPlatformBreakdownHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview platform-breakdown helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewPlatformBreakdownHelper.names.includes('verify:weekly:funnel'), 'weekly overview platform-breakdown helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewPlatformBreakdownHelper.names.includes('verify:backend:size'), 'weekly overview platform-breakdown helper should not fall back to backend size gate');

  const weeklyOverviewByWeekTrendHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-by-week-trend.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewByWeekTrendHelper.names.includes('lint:scripts'), 'weekly overview by-week trend helper should keep script lint coverage');
  assertTrue(weeklyOverviewByWeekTrendHelper.names.includes('verify:weekly:overview-by-week-trend'), 'weekly overview by-week trend helper should select its behavior gate');
  assertTrue(weeklyOverviewByWeekTrendHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview by-week trend helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewByWeekTrendHelper.names.includes('verify:weekly:funnel'), 'weekly overview by-week trend helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewByWeekTrendHelper.names.includes('verify:backend:size'), 'weekly overview by-week trend helper should not fall back to backend size gate');

  const weeklyOverviewKpiSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-kpi-section-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewKpiSectionHelper.names.includes('lint:scripts'), 'weekly overview KPI-section helper should keep script lint coverage');
  assertTrue(weeklyOverviewKpiSectionHelper.names.includes('verify:weekly:overview-kpi-section-adapter'), 'weekly overview KPI-section helper should select its behavior gate');
  assertTrue(weeklyOverviewKpiSectionHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview KPI-section helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewKpiSectionHelper.names.includes('verify:weekly:funnel'), 'weekly overview KPI-section helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewKpiSectionHelper.names.includes('verify:backend:size'), 'weekly overview KPI-section helper should not fall back to backend size gate');

  const weeklyOverviewPlatformBreakdownDataHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-platform-breakdown.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewPlatformBreakdownDataHelper.names.includes('lint:scripts'), 'weekly overview platform-breakdown helper should keep script lint coverage');
  assertTrue(weeklyOverviewPlatformBreakdownDataHelper.names.includes('verify:weekly:overview-platform-breakdown'), 'weekly overview platform-breakdown helper should select its behavior gate');
  assertTrue(weeklyOverviewPlatformBreakdownDataHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview platform-breakdown helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewPlatformBreakdownDataHelper.names.includes('verify:weekly:funnel'), 'weekly overview platform-breakdown helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewPlatformBreakdownDataHelper.names.includes('verify:backend:size'), 'weekly overview platform-breakdown helper should not fall back to backend size gate');

  const weeklyOverviewTrendHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-trend.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewTrendHelper.names.includes('lint:scripts'), 'weekly overview trend helper should keep script lint coverage');
  assertTrue(weeklyOverviewTrendHelper.names.includes('verify:weekly:overview-trend'), 'weekly overview trend helper should select its behavior gate');
  assertTrue(weeklyOverviewTrendHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview trend helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewTrendHelper.names.includes('verify:weekly:funnel'), 'weekly overview trend helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewTrendHelper.names.includes('verify:backend:size'), 'weekly overview trend helper should not fall back to backend size gate');

  const weeklyOverviewTrendSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-trend-section-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewTrendSectionHelper.names.includes('lint:scripts'), 'weekly overview trend-section helper should keep script lint coverage');
  assertTrue(weeklyOverviewTrendSectionHelper.names.includes('verify:weekly:overview-trend-section-adapter'), 'weekly overview trend-section helper should select its behavior gate');
  assertTrue(weeklyOverviewTrendSectionHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview trend-section helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewTrendSectionHelper.names.includes('verify:weekly:funnel'), 'weekly overview trend-section helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewTrendSectionHelper.names.includes('verify:backend:size'), 'weekly overview trend-section helper should not fall back to backend size gate');

  const weeklyOverviewByWeekTrendSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/overview-by-week-trend-section-adapter.behavior-fixtures.mjs']);
  assertTrue(weeklyOverviewByWeekTrendSectionHelper.names.includes('lint:scripts'), 'weekly overview by-week trend-section helper should keep script lint coverage');
  assertTrue(weeklyOverviewByWeekTrendSectionHelper.names.includes('verify:weekly:overview-by-week-trend-section-adapter'), 'weekly overview by-week trend-section helper should select its behavior gate');
  assertTrue(weeklyOverviewByWeekTrendSectionHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly overview by-week trend-section helper should select weekly behavior registry gate');
  assertFalse(weeklyOverviewByWeekTrendSectionHelper.names.includes('verify:weekly:funnel'), 'weekly overview by-week trend-section helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyOverviewByWeekTrendSectionHelper.names.includes('verify:backend:size'), 'weekly overview by-week trend-section helper should not fall back to backend size gate');

  const weeklyDouyinAttributionPropsHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-attribution-section-props-contract.behavior-fixtures.mjs']);
  assertTrue(weeklyDouyinAttributionPropsHelper.names.includes('lint:scripts'), 'weekly Douyin attribution props helper should keep script lint coverage');
  assertTrue(weeklyDouyinAttributionPropsHelper.names.includes('verify:weekly:platform-tab-douyin-attribution-section-props-contract'), 'weekly Douyin attribution props helper should select its behavior gate');
  assertTrue(weeklyDouyinAttributionPropsHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly Douyin attribution props helper should select weekly behavior registry gate');
  assertFalse(weeklyDouyinAttributionPropsHelper.names.includes('verify:weekly:funnel'), 'weekly Douyin attribution props helper should not fan out to unrelated weekly behavior gates');
  assertFalse(weeklyDouyinAttributionPropsHelper.names.includes('verify:backend:size'), 'weekly Douyin attribution props helper should not fall back to backend size gate');

  const weeklyFunnelHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/funnel.behavior-fixtures.mjs']);
  assertTrue(weeklyFunnelHelper.names.includes('verify:weekly:funnel'), 'weekly funnel behavior helper should select weekly funnel behavior gate');
  assertTrue(weeklyFunnelHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly funnel behavior helper should select weekly behavior registry gate');
  assertFalse(weeklyFunnelHelper.names.includes('verify:backend:size'), 'weekly funnel behavior helper should not fall back to backend size gate');

  const weeklyWaterfallHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/waterfall.behavior-fixtures.mjs']);
  assertTrue(weeklyWaterfallHelper.names.includes('verify:weekly:waterfall'), 'weekly waterfall behavior helper should select weekly waterfall behavior gate');
  assertTrue(weeklyWaterfallHelper.names.includes('verify:weekly:behavior-gate-registry'), 'weekly waterfall behavior helper should select weekly behavior registry gate');
  assertFalse(weeklyWaterfallHelper.names.includes('verify:backend:size'), 'weekly waterfall behavior helper should not fall back to backend size gate');

  const weeklyDouyinAttributionSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-attribution-section-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinAttributionSectionHelper.names.includes('verify:weekly:platform-tab-douyin-attribution-section-adapter'),
    'weekly Douyin attribution section adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinAttributionSectionHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin attribution section adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinAttributionSectionHelper.names.includes('verify:backend:size'),
    'weekly Douyin attribution section adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinChannelLeafHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-channel-leaf-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinChannelLeafHelper.names.includes('verify:weekly:platform-tab-douyin-channel-leaf-adapter'),
    'weekly Douyin channel leaf adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinChannelLeafHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin channel leaf adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinChannelLeafHelper.names.includes('verify:backend:size'),
    'weekly Douyin channel leaf adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinCardLeafHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-card-leaf-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinCardLeafHelper.names.includes('verify:weekly:platform-tab-douyin-card-leaf-adapter'),
    'weekly Douyin card leaf adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinCardLeafHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin card leaf adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinCardLeafHelper.names.includes('verify:backend:size'),
    'weekly Douyin card leaf adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinCardSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-card-section-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinCardSectionHelper.names.includes('verify:weekly:platform-tab-douyin-card-section-adapter'),
    'weekly Douyin card section adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinCardSectionHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin card section adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinCardSectionHelper.names.includes('verify:backend:size'),
    'weekly Douyin card section adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinLiveLeafHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-live-leaf-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinLiveLeafHelper.names.includes('verify:weekly:platform-tab-douyin-live-leaf-adapter'),
    'weekly Douyin live leaf adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinLiveLeafHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin live leaf adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinLiveLeafHelper.names.includes('verify:backend:size'),
    'weekly Douyin live leaf adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinLiveSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-live-section-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinLiveSectionHelper.names.includes('verify:weekly:platform-tab-douyin-live-section-adapter'),
    'weekly Douyin live section adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinLiveSectionHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin live section adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinLiveSectionHelper.names.includes('verify:backend:size'),
    'weekly Douyin live section adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinSectionListHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-section-list-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinSectionListHelper.names.includes('verify:weekly:platform-tab-douyin-section-list-adapter'),
    'weekly Douyin section-list adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinSectionListHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin section-list adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinSectionListHelper.names.includes('verify:backend:size'),
    'weekly Douyin section-list adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-section-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinSectionHelper.names.includes('verify:weekly:platform-tab-douyin-section-adapter'),
    'weekly Douyin section adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinSectionHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin section adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinSectionHelper.names.includes('verify:backend:size'),
    'weekly Douyin section adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinShortvideoLeafHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-shortvideo-leaf-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinShortvideoLeafHelper.names.includes('verify:weekly:platform-tab-douyin-shortvideo-leaf-adapter'),
    'weekly Douyin shortvideo leaf adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinShortvideoLeafHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin shortvideo leaf adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinShortvideoLeafHelper.names.includes('verify:backend:size'),
    'weekly Douyin shortvideo leaf adapter helper should not fall back to backend size gate',
  );

  const weeklyDouyinShortvideoSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/douyin-shortvideo-section-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyDouyinShortvideoSectionHelper.names.includes('verify:weekly:platform-tab-douyin-shortvideo-section-adapter'),
    'weekly Douyin shortvideo section adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyDouyinShortvideoSectionHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Douyin shortvideo section adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyDouyinShortvideoSectionHelper.names.includes('verify:backend:size'),
    'weekly Douyin shortvideo section adapter helper should not fall back to backend size gate',
  );

  const weeklyTmallFunnelLeafHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/tmall-funnel-leaf-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyTmallFunnelLeafHelper.names.includes('verify:weekly:platform-tab-tmall-funnel-leaf-adapter'),
    'weekly Tmall funnel leaf adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyTmallFunnelLeafHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Tmall funnel leaf adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyTmallFunnelLeafHelper.names.includes('verify:backend:size'),
    'weekly Tmall funnel leaf adapter helper should not fall back to backend size gate',
  );

  const weeklyTmallFunnelSectionListHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/tmall-funnel-section-list-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyTmallFunnelSectionListHelper.names.includes('verify:weekly:platform-tab-tmall-funnel-section-list-adapter'),
    'weekly Tmall funnel section-list adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyTmallFunnelSectionListHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Tmall funnel section-list adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyTmallFunnelSectionListHelper.names.includes('verify:backend:size'),
    'weekly Tmall funnel section-list adapter helper should not fall back to backend size gate',
  );

  const weeklyTmallAttributionSectionHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/tmall-attribution-section-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyTmallAttributionSectionHelper.names.includes('verify:weekly:platform-tab-tmall-attribution-section-adapter'),
    'weekly Tmall attribution section adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyTmallAttributionSectionHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Tmall attribution section adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyTmallAttributionSectionHelper.names.includes('verify:backend:size'),
    'weekly Tmall attribution section adapter helper should not fall back to backend size gate',
  );

  const weeklyTmallLeafHelper = selectAffectedGates(registry, ['scripts/fixtures/weekly/tmall-leaf-adapter.behavior-fixtures.mjs']);
  assertTrue(
    weeklyTmallLeafHelper.names.includes('verify:weekly:platform-tab-tmall-leaf-adapter'),
    'weekly Tmall leaf adapter helper should select its behavior gate',
  );
  assertTrue(
    weeklyTmallLeafHelper.names.includes('verify:weekly:behavior-gate-registry'),
    'weekly Tmall leaf adapter helper should select weekly behavior registry gate',
  );
  assertFalse(
    weeklyTmallLeafHelper.names.includes('verify:backend:size'),
    'weekly Tmall leaf adapter helper should not fall back to backend size gate',
  );

  const weeklyMetadata = selectAffectedGates(registry, ['scripts/lib/weekly/weekly-behavior-gates.mjs']);
  assertTrue(weeklyMetadata.names.includes('verify:weekly:behavior-gate-registry'), 'weekly metadata changes should select weekly behavior registry gate');
  assertFalse(weeklyMetadata.names.includes('verify:backend:size'), 'weekly metadata changes should not fall back to backend size gate');
}
