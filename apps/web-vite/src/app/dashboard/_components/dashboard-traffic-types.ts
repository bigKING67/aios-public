export interface DashboardTrafficMetricTriplet {
  current: number;
  previous: number;
  wow: number | null;
}

export interface DashboardTrafficMetrics {
  visitorCount: DashboardTrafficMetricTriplet;
  newVisitorCount: DashboardTrafficMetricTriplet;
  avgStayDuration: DashboardTrafficMetricTriplet;
  view3sUserCount: DashboardTrafficMetricTriplet;
  productClickUserCount: DashboardTrafficMetricTriplet;
  payBuyerCount: DashboardTrafficMetricTriplet;
  payAmount: DashboardTrafficMetricTriplet;
  followShopUserCount: DashboardTrafficMetricTriplet;
  productFavoriteUserCount: DashboardTrafficMetricTriplet;
  cartUserCount: DashboardTrafficMetricTriplet;
  cartCount: DashboardTrafficMetricTriplet;
  payConversionRate: DashboardTrafficMetricTriplet;
  uvValue: DashboardTrafficMetricTriplet;
  avgOrderValue: DashboardTrafficMetricTriplet;
}

export interface DashboardTrafficTreeNode {
  key: string;
  sourceLevel: number;
  sourceName: string;
  parentSourceName: string;
  metrics: DashboardTrafficMetrics;
  children?: DashboardTrafficTreeNode[];
}

export interface DashboardTrafficApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'taobao';
  asOfDate: string;
  tree: DashboardTrafficTreeNode[];
}

export interface DashboardTrafficGoodsMetrics {
  visitorCount: DashboardTrafficMetricTriplet;
  pageView: DashboardTrafficMetricTriplet;
  productFavoriteUserCount: DashboardTrafficMetricTriplet;
  cartUserCount: DashboardTrafficMetricTriplet;
  orderBuyerCount: DashboardTrafficMetricTriplet;
  payBuyerCount: DashboardTrafficMetricTriplet;
  payQuantity: DashboardTrafficMetricTriplet;
  payAmount: DashboardTrafficMetricTriplet;
  payConversionRate: DashboardTrafficMetricTriplet;
  avgOrderValue: DashboardTrafficMetricTriplet;
}

export interface DashboardTrafficGoodsTreeNode {
  key: string;
  productId: string;
  productName: string;
  sourceLevel: number;
  sourceName: string;
  parentSourceName: string;
  metrics: DashboardTrafficGoodsMetrics;
  children?: DashboardTrafficGoodsTreeNode[];
}

export interface DashboardTrafficGoodsApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'taobao';
  asOfDate: string;
  tree: DashboardTrafficGoodsTreeNode[];
}

export type TrafficMetricFormat = 'integer' | 'number' | 'rate' | 'currency';

export type TrafficMetricDefinition = {
  key: keyof DashboardTrafficMetrics;
  title: string;
  format: TrafficMetricFormat;
  digits?: number;
};

export type TrafficGoodsMetricDefinition = {
  key: keyof DashboardTrafficGoodsMetrics;
  title: string;
  format: TrafficMetricFormat;
  digits?: number;
};
