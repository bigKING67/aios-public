import type { CreatorMetricGridItem } from './creator-metric-grid';
import {
  calculateCreatorGsv,
  formatCurrency,
  formatInteger,
  formatRate,
  toNumber,
  type NumericInput,
} from './creator-formatters';

export interface CreatorPerformanceMetricLabels {
  rosterInfluencerCount: string;
  activeInfluencerCount: string;
  activeContentCount: string;
  gmv: string;
  gsv: string;
  refundRate: string;
}

export interface BuildCreatorPerformanceMetricCardsParams {
  labels: CreatorPerformanceMetricLabels;
  rosterInfluencerCount: NumericInput;
  activeInfluencerCount: NumericInput;
  activeContentCount: NumericInput;
  gmv: NumericInput;
  refundAmount: NumericInput;
}

export function buildCreatorPerformanceMetricCards({
  labels,
  rosterInfluencerCount,
  activeInfluencerCount,
  activeContentCount,
  gmv,
  refundAmount,
}: BuildCreatorPerformanceMetricCardsParams): CreatorMetricGridItem[] {
  const gsv = calculateCreatorGsv(gmv, refundAmount);
  const parsedGmv = toNumber(gmv);
  const parsedRefundAmount = toNumber(refundAmount);
  const refundRate = parsedGmv > 0 ? parsedRefundAmount / parsedGmv : null;

  return [
    {
      label: labels.rosterInfluencerCount,
      value: formatInteger(rosterInfluencerCount),
    },
    {
      label: labels.activeInfluencerCount,
      value: formatInteger(activeInfluencerCount),
    },
    {
      label: labels.activeContentCount,
      value: formatInteger(activeContentCount),
    },
    {
      label: labels.gmv,
      value: formatCurrency(gmv, 2),
    },
    {
      label: labels.gsv,
      value: Number.isFinite(gsv) ? formatCurrency(gsv, 2) : '--',
    },
    {
      label: labels.refundRate,
      value: formatRate(refundRate, 2),
    },
  ];
}
