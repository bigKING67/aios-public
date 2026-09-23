import type { QuantAttributionRow, QuantFactorBucket } from './platform-tab-types';

export interface ChannelQuantReasonAction {
  reason: string;
  action: string;
}

export interface QuantFactorIdentity {
  factorKey: QuantAttributionRow['factorKey'];
  factorLabel: QuantAttributionRow['factorLabel'];
}

export interface BuildChannelQuantReasonActionParams {
  bucket: QuantFactorBucket;
  lnContribution: number;
  channelKey: string;
  channelLabel: string;
  fallbackReason?: string;
  fallbackAction?: string;
}
