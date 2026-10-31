import type { TableColumnsType } from '@lobehub/ui';
import { buildQuantContributionColumns } from './platform-tab-quant-contribution-columns';
import { buildQuantDriverColumns } from './platform-tab-quant-driver-columns';
import type { QuantAttributionRow } from './platform-tab-types';

export function buildQuantColumns(): TableColumnsType<QuantAttributionRow> {
  return [...buildQuantDriverColumns(), ...buildQuantContributionColumns()];
}
