import type { CreatorStatusTableRowMetrics } from './creator-status-table-row';
import { calculateCreatorGsv, type NumericInput } from './creator-formatters';

export interface BuildCreatorStatusTableMetricsParams {
  gmv: NumericInput;
  gsvBaseAmount: NumericInput;
  refundAmount: NumericInput;
  refundRate: NumericInput;
}

export interface BuildCreatorStatusTableMetricsGetterParams<TRecord> {
  gmv: (record: TRecord) => NumericInput;
  gsvBaseAmount: (record: TRecord) => NumericInput;
  refundAmount: (record: TRecord) => NumericInput;
  refundRate: (record: TRecord) => NumericInput;
}

export function buildCreatorStatusTableMetrics({
  gmv,
  gsvBaseAmount,
  refundAmount,
  refundRate,
}: BuildCreatorStatusTableMetricsParams): CreatorStatusTableRowMetrics {
  return {
    gmv,
    gsv: calculateCreatorGsv(gsvBaseAmount, refundAmount),
    refundRate,
  };
}

export function buildCreatorStatusTableMetricsGetter<TRecord>({
  gmv,
  gsvBaseAmount,
  refundAmount,
  refundRate,
}: BuildCreatorStatusTableMetricsGetterParams<TRecord>): (record: TRecord) => CreatorStatusTableRowMetrics {
  return (record) =>
    buildCreatorStatusTableMetrics({
      gmv: gmv(record),
      gsvBaseAmount: gsvBaseAmount(record),
      refundAmount: refundAmount(record),
      refundRate: refundRate(record),
    });
}
