import type { QuantFactorBucket } from './platform-tab-types';

export interface ChannelQuantContext {
  channelKey?: string;
  channelLabel?: string;
}

export interface ChannelQuantFactorValue {
  bucket: QuantFactorBucket;
  factorKey: string;
  factorLabel: string;
  currValue: number;
  prevValue: number;
}

export interface ChannelQuantTotals {
  currImpressionCount: number;
  prevImpressionCount: number;
  currVisitorCount: number;
  prevVisitorCount: number;
  currClickCount: number;
  prevClickCount: number;
  currCartCount: number;
  prevCartCount: number;
  currPayBuyerCount: number;
  prevPayBuyerCount: number;
  currPayAmount: number;
  prevPayAmount: number;
}
