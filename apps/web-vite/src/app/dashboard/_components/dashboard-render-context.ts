import {
  DASHBOARD_DIMENSION_LIBRARY,
  PLATFORM_TABS,
  TAB_TO_QUERY_PLATFORM,
  type DashboardDimension,
  type DateMode,
  type PlatformTabKey,
} from './dashboard-config';
import { resolveDimensionsByTab } from './dashboard-date-range';
import type { DashboardDimensionContentKind } from './dashboard-dimension-content';

export type DashboardDimensionContentKindFlags = {
  isBusinessDimension: boolean;
  isTmallGoodsDimension: boolean;
  isTmallTrafficDimension: boolean;
  isDouyinLiveDimension: boolean;
  isDouyinShortVideoDimension: boolean;
  isDouyinGoodsCardDimension: boolean;
  isDouyinQianchuanDimension: boolean;
};

type DashboardRenderContextArgs = {
  activeTab: PlatformTabKey;
  activeDimension: DashboardDimension;
  allowedTabs: readonly PlatformTabKey[];
  dateMode: DateMode;
};

function resolveDashboardDimensionContentKindFlags(
  activeTab: PlatformTabKey,
  effectiveDimension: DashboardDimension
): DashboardDimensionContentKindFlags {
  return {
    isBusinessDimension: effectiveDimension === 'business',
    isTmallGoodsDimension: activeTab === 'tmall' && effectiveDimension === 'goods',
    isTmallTrafficDimension: activeTab === 'tmall' && effectiveDimension === 'traffic',
    isDouyinLiveDimension: activeTab === 'douyin' && effectiveDimension === 'live',
    isDouyinShortVideoDimension: activeTab === 'douyin' && effectiveDimension === 'shortVideo',
    isDouyinGoodsCardDimension: activeTab === 'douyin' && effectiveDimension === 'goodsCard',
    isDouyinQianchuanDimension: activeTab === 'douyin' && effectiveDimension === 'qianchuan',
  };
}

export function resolveDashboardDimensionContentKind({
  isBusinessDimension,
  isTmallGoodsDimension,
  isTmallTrafficDimension,
  isDouyinLiveDimension,
  isDouyinShortVideoDimension,
  isDouyinGoodsCardDimension,
  isDouyinQianchuanDimension,
}: DashboardDimensionContentKindFlags): DashboardDimensionContentKind {
  if (isBusinessDimension) return 'business';
  if (isTmallGoodsDimension) return 'goods';
  if (isTmallTrafficDimension) return 'traffic';
  if (isDouyinLiveDimension) return 'live';
  if (isDouyinShortVideoDimension) return 'shortVideo';
  if (isDouyinGoodsCardDimension) return 'goodsCard';
  if (isDouyinQianchuanDimension) return 'qianchuan';
  return 'placeholder';
}

export function resolveDashboardRenderContext({
  activeTab,
  activeDimension,
  allowedTabs,
  dateMode,
}: DashboardRenderContextArgs) {
  const isOverviewTab = activeTab === 'overview';
  const effectiveDimension: DashboardDimension = isOverviewTab ? 'business' : activeDimension;
  const activeTabDimensions = resolveDimensionsByTab(activeTab);
  const dimensionContentKindFlags = resolveDashboardDimensionContentKindFlags(activeTab, effectiveDimension);

  return {
    visibleTabs: PLATFORM_TABS.filter((item) => allowedTabs.includes(item.key)),
    isOverviewTab,
    effectiveDimension,
    activeDimensionItems: activeTabDimensions.map((key) => ({
      key,
      ...DASHBOARD_DIMENSION_LIBRARY[key],
    })),
    dimensionContentKind: resolveDashboardDimensionContentKind(dimensionContentKindFlags),
    dimensionContentKindFlags,
    activeQueryPlatform: TAB_TO_QUERY_PLATFORM[activeTab],
    isDayMode: dateMode === 'day',
  };
}

export type {
  DashboardLiveScopeContentArgs,
  DashboardLiveScopeContent,
  DashboardShortVideoScopeContentArgs,
  DashboardShortVideoScopeContent,
} from './dashboard-scope-content';

export {
  resolveDashboardLiveScopeContent,
  resolveDashboardShortVideoScopeContent,
} from './dashboard-scope-content';
