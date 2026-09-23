import type { ReactNode } from 'react';

import { DashboardGoodsScoreDrawer } from './dashboard-goods-score-drawer';
import { useDashboardCommerceContents } from './dashboard-commerce-content';
import type { DashboardCommerceContentsArgs } from './dashboard-commerce-content-types';
import { DASHBOARD_COMMERCE_VIEW_CLASS_NAMES } from './dashboard-commerce-view-class-names';
import type { DashboardDimensionContentKind } from './dashboard-dimension-content';

export type DashboardCommerceContentLazyProps = Omit<
  DashboardCommerceContentsArgs,
  | 'getTrendClassNameByRate'
  | 'goodsScoreClassNames'
  | 'goodsMatrixClassNames'
  | 'goodsScoreChartClassNames'
  | 'trafficTableClassNames'
  | 'goodsCardTableClassNames'
> & {
  contentKind: Extract<DashboardDimensionContentKind, 'goods' | 'traffic' | 'goodsCard'>;
  isGoodsScoreDrawerOpen: boolean;
};

export default function DashboardCommerceContentLazy({
  contentKind,
  isGoodsScoreDrawerOpen,
  ...args
}: DashboardCommerceContentLazyProps) {
  const {
    goodsContent,
    trafficContent,
    goodsCardContent,
    goodsScoreRadarOption,
    selectedGoodsScoreDetail,
    handleCloseGoodsScoreDrawer,
  } = useDashboardCommerceContents({
    ...args,
    getTrendClassNameByRate: DASHBOARD_COMMERCE_VIEW_CLASS_NAMES.getTrendClassNameByRate,
    goodsScoreClassNames: DASHBOARD_COMMERCE_VIEW_CLASS_NAMES.goodsScoreClassNames,
    goodsMatrixClassNames: DASHBOARD_COMMERCE_VIEW_CLASS_NAMES.goodsMatrixClassNames,
    goodsScoreChartClassNames: DASHBOARD_COMMERCE_VIEW_CLASS_NAMES.goodsScoreChartClassNames,
    trafficTableClassNames: DASHBOARD_COMMERCE_VIEW_CLASS_NAMES.trafficTableClassNames,
    goodsCardTableClassNames: DASHBOARD_COMMERCE_VIEW_CLASS_NAMES.goodsCardTableClassNames,
  });

  const contentByKind = {
    goods: goodsContent,
    traffic: trafficContent,
    goodsCard: goodsCardContent,
  } satisfies Record<DashboardCommerceContentLazyProps['contentKind'], ReactNode>;

  return (
    <>
      {contentByKind[contentKind]}
      <DashboardGoodsScoreDrawer
        open={isGoodsScoreDrawerOpen}
        isMobile={args.isMobile}
        selectedDetail={selectedGoodsScoreDetail}
        radarOption={goodsScoreRadarOption}
        onClose={handleCloseGoodsScoreDrawer}
      />
    </>
  );
}
