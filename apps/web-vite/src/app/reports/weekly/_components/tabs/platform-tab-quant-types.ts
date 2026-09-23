export interface QuantAttributionRow {
  rowId: string;
  factorKey: string;
  factorLabel: string;
  currValue: number;
  prevValue: number;
  changeRate: number | undefined;
  lnContribution: number;
  contributionRate: number | undefined;
  effect: string;
  reason: string;
  action: string;
  priority: string;
}

export type QuantFactorBucket =
  | 'impression'
  | 'visitor'
  | 'clickRate'
  | 'clickToCart'
  | 'cartToPay'
  | 'avgOrderValue'
  | 'other';

export type ChannelQuantType =
  | 'search'
  | 'recommend'
  | 'keywordAd'
  | 'crowdAd'
  | 'sceneAd'
  | 'other';
