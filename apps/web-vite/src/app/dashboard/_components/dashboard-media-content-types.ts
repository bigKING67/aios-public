import type { MessageInstance } from 'antd/es/message/interface';
import type {
  Dispatch,
  Key,
  ReactNode,
  SetStateAction,
} from 'react';

import type { DashboardDateRangeLike } from './dashboard-date-range';
import type { DashboardLiveChartClassNames } from './dashboard-live-trend-option';
import type { DashboardLiveDetailTableClassNames } from './dashboard-live-detail-columns';
import type { DashboardShortVideoDetailTableClassNames } from './dashboard-short-video-detail-columns';
import type {
  DashboardLiveApiResponse,
  DashboardLiveDetailRow,
  DashboardLiveGoodsApiResponse,
  DashboardShortVideoApiResponse,
  LiveScope,
  ShortVideoScope,
} from './dashboard-types';

export type DashboardDetailSectionShellProps = {
  isAuthenticated: boolean;
  isMobile: boolean;
  onNavigateLogin: () => void;
};

export type DashboardMediaContentsArgs = {
  isAuthenticated: boolean;
  isMobile: boolean;
  currentRange: DashboardDateRangeLike;
  messageApi: MessageInstance;
  detailSectionShellProps: DashboardDetailSectionShellProps;
  getTrendClassNameByRate: (value: number | null | undefined) => string;

  isDouyinLiveDimension: boolean;
  liveData: DashboardLiveApiResponse | null;
  liveLoadError: string | null;
  liveGoodsData: DashboardLiveGoodsApiResponse | null;
  liveGoodsLoadError: string | null;
  liveGoodsLoading: boolean;
  liveScope: LiveScope;
  setLiveScope: Dispatch<SetStateAction<LiveScope>>;
  expandedLiveGoodsRowKeys: Key[];
  expandedLiveGoodsSessionKeys: Key[];
  liveGoodsSessionPage: number;
  liveGoodsSessionPageSize: number;
  setLiveGoodsSessionPage: Dispatch<SetStateAction<number>>;
  toggleLiveGoodsSession: (key: Key) => void;
  toggleLiveGoodsProduct: (key: Key) => void;
  changeLiveGoodsPage: (page: number, pageSize: number) => void;
  isLiveMetricsDrawerOpen: boolean;
  selectedLiveMetricsRow: DashboardLiveDetailRow | null;
  openLiveMetricsDrawer: (row: DashboardLiveDetailRow) => void;
  closeLiveMetricsDrawer: () => void;
  isLiveFunnelDrawerOpen: boolean;
  selectedLiveFunnelRow: DashboardLiveDetailRow | null;
  setSelectedLiveFunnelRow: Dispatch<SetStateAction<DashboardLiveDetailRow | null>>;
  openLiveFunnelDrawer: (row: DashboardLiveDetailRow) => void;
  closeLiveFunnelDrawer: () => void;
  isExportingLiveDetails: boolean;
  setIsExportingLiveDetails: Dispatch<SetStateAction<boolean>>;
  isExportingLiveGoodsDetails: boolean;
  setIsExportingLiveGoodsDetails: Dispatch<SetStateAction<boolean>>;
  liveChartClassNames: DashboardLiveChartClassNames;
  liveDetailTableClassNames: DashboardLiveDetailTableClassNames;

  isDouyinShortVideoDimension: boolean;
  shortVideoData: DashboardShortVideoApiResponse | null;
  shortVideoLoadError: string | null;
  shortVideoScope: ShortVideoScope;
  setShortVideoScope: Dispatch<SetStateAction<ShortVideoScope>>;
  isExportingShortVideoDetails: boolean;
  setIsExportingShortVideoDetails: Dispatch<SetStateAction<boolean>>;
  shortVideoDetailTableClassNames: DashboardShortVideoDetailTableClassNames;
};

export type DashboardMediaContents = {
  liveContent: ReactNode;
  shortVideoContent: ReactNode;
};
