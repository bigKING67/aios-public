export interface DashboardGoodsMatrixItem {
  productId: string;
  productName: string;
  currGmv: number;
  prevGmv: number;
  gmvDelta: number;
  salesShare: number | null;
  gmvWow: number | null;
}

export interface DashboardGoodsTableItem {
  productId: string;
  productName: string;
  currGmv: number;
  prevGmv: number;
  gmvDelta: number;
  gmvWow: number | null;
  currGsv: number;
  gsvWow: number | null;
  visitorCount: number;
  visitorWow: number | null;
  payBuyerCount: number;
  payBuyerWow: number | null;
  payConversionRate: number | null;
  payConversionRateWow: number | null;
  avgOrderValue: number | null;
  avgOrderValueWow: number | null;
  refundAmount: number;
  refundWow: number | null;
  salesShare: number | null;
  topsisScore: number | null;
  topsisRank: number | null;
  scoreConfidence: 'high' | 'medium' | 'low' | null;
  scoreBreakdown: DashboardGoodsScoreBreakdown | null;
}

export interface DashboardGoodsScoreBreakdown {
  scale: number;
  efficiency: number;
  growth: number;
  risk: number;
}

export interface DashboardGoodsScoreRankingItem {
  productId: string;
  productName: string;
  currGmv: number;
  gmvWow: number | null;
  topsisScore: number;
  topsisRank: number;
  scoreConfidence: 'high' | 'medium' | 'low';
  scoreBreakdown: DashboardGoodsScoreBreakdown;
}

export interface DashboardGoodsScoreDetailItem {
  productId: string;
  productName: string;
  currGmv: number;
  gmvWow: number | null;
  topsisScore: number | null;
  topsisRank: number | null;
  scoreConfidence: DashboardGoodsTableItem['scoreConfidence'];
  scoreBreakdown: DashboardGoodsScoreBreakdown;
}

export interface DashboardGoodsApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'taobao';
  topN: number;
  scorePoolN: number;
  asOfDate: string;
  summary: {
    totalCurrGmv: number;
    totalPrevGmv: number;
    delta: number;
    deltaRate: number | null;
    observedDays: number;
  };
  matrix: DashboardGoodsMatrixItem[];
  table: DashboardGoodsTableItem[];
  scoreRanking: DashboardGoodsScoreRankingItem[];
}
