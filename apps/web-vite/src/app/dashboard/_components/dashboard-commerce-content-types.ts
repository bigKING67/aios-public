import type { Key, ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { GoodsQuadrantKey } from './dashboard-config';
import type { DashboardGoodsCardTableClassNames } from './dashboard-goods-card-columns';
import type { DashboardGoodsMatrixClassNames } from './dashboard-goods-matrix-model';
import type { DashboardGoodsScoreChartClassNames } from './dashboard-goods-score-chart-option';
import type { DashboardGoodsTableClassNames } from './dashboard-goods-columns';
import type { DashboardTrafficTableClassNames } from './dashboard-traffic-columns';
import type {
  DashboardGoodsApiResponse,
  DashboardGoodsCardApiResponse,
  DashboardGoodsCardRow,
  DashboardGoodsCardTrafficApiResponse,
  DashboardGoodsScoreDetailItem,
  DashboardTrafficApiResponse,
  DashboardTrafficGoodsApiResponse,
} from './dashboard-types';

export type DashboardCommerceContentsArgs = {
  isMobile: boolean;
  dashboardRangeLabel: string;
  dashboardFallbackAsOfDate: string;
  getTrendClassNameByRate: (value: number | null | undefined) => string;

  goodsData: DashboardGoodsApiResponse | null;
  goodsLoadError: string | null;
  goodsLoading: boolean;
  goodsMatrixVisibleQuadrants: GoodsQuadrantKey[];
  toggleGoodsMatrixQuadrant: (quadrant: GoodsQuadrantKey) => void;
  selectedGoodsScoreDetail: DashboardGoodsScoreDetailItem | null;
  openGoodsScoreDrawer: (detail: DashboardGoodsScoreDetailItem | null) => void;
  closeGoodsScoreDrawer: () => void;
  goodsScoreClassNames: DashboardGoodsTableClassNames;
  goodsMatrixClassNames: DashboardGoodsMatrixClassNames;
  goodsScoreChartClassNames: DashboardGoodsScoreChartClassNames;

  trafficData: DashboardTrafficApiResponse | null;
  trafficLoadError: string | null;
  trafficLoading: boolean;
  trafficGoodsData: DashboardTrafficGoodsApiResponse | null;
  trafficGoodsLoadError: string | null;
  trafficGoodsLoading: boolean;
  expandedTrafficRowKeys: Key[];
  setExpandedTrafficRowKeys: (keys: Key[]) => void;
  expandedTrafficGoodsRowKeys: Key[];
  setExpandedTrafficGoodsRowKeys: (keys: Key[]) => void;
  trafficTableClassNames: DashboardTrafficTableClassNames;

  isDouyinGoodsCardDimension: boolean;
  goodsCardData: DashboardGoodsCardApiResponse | null;
  goodsCardLoadError: string | null;
  goodsCardLoading: boolean;
  goodsCardTrafficData: DashboardGoodsCardTrafficApiResponse | null;
  goodsCardTrafficLoadError: string | null;
  goodsCardTrafficLoading: boolean;
  isGoodsCardTrafficDrawerOpen: boolean;
  selectedGoodsCardRow: DashboardGoodsCardRow | null;
  openGoodsCardTrafficDrawer: (row: DashboardGoodsCardRow) => void;
  closeGoodsCardTrafficDrawer: () => void;
  resetGoodsCardTrafficDrawerData: () => void;
  expandedGoodsCardTrafficRowKeys: Key[];
  setExpandedGoodsCardTrafficRowKeys: (keys: Key[]) => void;
  goodsCardTableClassNames: DashboardGoodsCardTableClassNames;
};

export type DashboardCommerceContents = {
  goodsContent: ReactNode;
  trafficContent: ReactNode;
  goodsCardContent: ReactNode;
  goodsScoreRadarOption: EChartsCoreOption;
  selectedGoodsScoreDetail: DashboardGoodsScoreDetailItem | null;
  handleCloseGoodsScoreDrawer: () => void;
};
