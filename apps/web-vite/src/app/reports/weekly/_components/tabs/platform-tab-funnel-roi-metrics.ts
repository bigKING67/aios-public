import { calcChangePercent } from './platform-tab-formatters';
import { resolveFunnelRoi } from './platform-tab-funnel-rate-fallbacks';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';
import type { FunnelChannelRow } from './platform-tab-types';

export type FunnelRoiMetrics = Pick<
  FunnelChannelRow,
  | 'currRoi'
  | 'prevRoi'
  | 'roiWoW'
>;

export function resolveFunnelRoiMetrics(
  item: FunnelChannelItem,
  currPayAmount: number,
  prevPayAmount: number,
  currCost: number,
  prevCost: number,
): FunnelRoiMetrics {
  const currRoi = resolveFunnelRoi(item.curr_roi, currPayAmount, currCost);
  const prevRoi = resolveFunnelRoi(item.prev_roi, prevPayAmount, prevCost);

  return {
    currRoi,
    prevRoi,
    roiWoW:
      currRoi !== undefined && prevRoi !== undefined
        ? calcChangePercent(currRoi, prevRoi)
        : undefined,
  };
}
