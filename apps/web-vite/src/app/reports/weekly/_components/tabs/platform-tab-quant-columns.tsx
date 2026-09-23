import type { ColumnsType } from 'antd/es/table';
import { buildQuantContributionColumns } from './platform-tab-quant-contribution-columns';
import { buildQuantDriverColumns } from './platform-tab-quant-driver-columns';
import type { QuantAttributionRow } from './platform-tab-types';

export function buildQuantColumns(): ColumnsType<QuantAttributionRow> {
  return [...buildQuantDriverColumns(), ...buildQuantContributionColumns()];
}
