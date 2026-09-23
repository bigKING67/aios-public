export interface FunnelChannelRow {
  rowId: string;
  productId: string;
  productName: string;
  trafficChannel: string;
  trafficChannelLabel: string;
  metricSource: string;
  hasClickStage: boolean;
  currVisitorCount: number | undefined;
  prevVisitorCount: number | undefined;
  currImpressionCount: number;
  prevImpressionCount: number;
  currClickCount: number;
  prevClickCount: number;
  currCartCount: number;
  prevCartCount: number;
  currPayBuyerCount: number;
  prevPayBuyerCount: number;
  currPayAmount: number;
  prevPayAmount: number;
  payAmountWoW: number | undefined;
  currCtr: number | undefined;
  prevCtr: number | undefined;
  currClickToCartRate: number | undefined;
  prevClickToCartRate: number | undefined;
  currCartToPayRate: number | undefined;
  prevCartToPayRate: number | undefined;
  currCost: number;
  prevCost: number;
  costWoW: number | undefined;
  currRoi: number | undefined;
  prevRoi: number | undefined;
  roiWoW: number | undefined;
  currAvgClickCost: number | undefined;
  prevAvgClickCost: number | undefined;
  currCpm: number | undefined;
  prevCpm: number | undefined;
  currClickConversionRate: number | undefined;
  prevClickConversionRate: number | undefined;
  currWangwangConsultCount: number;
  prevWangwangConsultCount: number;
  currMemberJoinCount: number;
  prevMemberJoinCount: number;
  currNewBuyerCount: number;
  prevNewBuyerCount: number;
  currCouponClaimCount: number;
  prevCouponClaimCount: number;
  currTotalFavoriteCartCount: number;
  prevTotalFavoriteCartCount: number;
}

export interface FunnelSelectedChannelDetail {
  trafficChannel: string;
  trafficChannelLabel: string;
  gmvDelta: number;
  contributionRate: number | undefined;
}

export interface FunnelStagePoint {
  key: string;
  label: string;
  value: number;
  prevValue: number;
  wow: number | undefined;
  conversionLabel?: string;
  conversionRate?: number;
  conversionPrevRate?: number;
  conversionWoW?: number;
}

export interface FunnelChannelSection {
  channelKey: string;
  titleText: string;
  summaryText: string;
  rows: FunnelChannelRow[];
  stages: FunnelStagePoint[];
  currPayAmount: number;
  prevPayAmount: number;
}
