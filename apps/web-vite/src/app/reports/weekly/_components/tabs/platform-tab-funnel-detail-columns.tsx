import type { ColumnsType } from 'antd/es/table';
import type { FunnelChannelRow } from './platform-tab-types';
import type { TrendClassNameResolver } from './platform-tab-column-contracts';
import { buildFunnelBaseColumns } from './platform-tab-funnel-base-columns';
import { buildFunnelClickStageColumns } from './platform-tab-funnel-click-stage-columns';
import { buildFunnelNonClickStageColumns } from './platform-tab-funnel-non-click-stage-columns';

export interface FunnelDetailColumns {
  withClickStage: ColumnsType<FunnelChannelRow>;
  withoutClickStage: ColumnsType<FunnelChannelRow>;
}

export function buildFunnelDetailColumns(
  resolveTrendClassName: TrendClassNameResolver
): FunnelDetailColumns {
  const baseColumns = buildFunnelBaseColumns(resolveTrendClassName);

  return {
    withClickStage: [
      ...baseColumns,
      ...buildFunnelClickStageColumns(resolveTrendClassName),
    ],
    withoutClickStage: [
      ...baseColumns,
      ...buildFunnelNonClickStageColumns(),
    ],
  };
}
