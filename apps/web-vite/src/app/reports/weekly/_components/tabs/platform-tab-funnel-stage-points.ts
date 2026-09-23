import { calcChangePercent } from './platform-tab-formatters';
import type { FunnelStagePoint } from './platform-tab-types';

export type FunnelStageSeed = Omit<FunnelStagePoint, 'wow' | 'conversionWoW'>;

export function buildFunnelStagePoint(stage: FunnelStageSeed): FunnelStagePoint {
  return {
    ...stage,
    wow: calcChangePercent(stage.value, stage.prevValue),
    conversionWoW:
      typeof stage.conversionRate === 'number' && typeof stage.conversionPrevRate === 'number'
        ? calcChangePercent(stage.conversionRate, stage.conversionPrevRate)
        : undefined,
  };
}

export function buildFunnelStagePointsFromSeeds(
  stages: FunnelStageSeed[]
): FunnelStagePoint[] {
  return stages.map(buildFunnelStagePoint);
}
