import {
  formatInteger,
  formatRatioPercent,
} from './platform-tab-formatters';
import type { FunnelStagePoint } from './platform-tab-types';

type FunnelStageColorResolver = (index: number) => string;

export function buildDouyinFunnelChartData(
  stages: FunnelStagePoint[],
  resolveFunnelStageColor: FunnelStageColorResolver
) {
  return stages.map((stage, index) => ({
    name: stage.label,
    value: stage.value,
    prevValue: stage.prevValue,
    wow: stage.wow,
    conversionText: stage.conversionLabel
      ? `${stage.conversionLabel} ${formatRatioPercent(stage.conversionRate, 2)}`
      : undefined,
    conversionPrevText: stage.conversionLabel
      ? `上周 ${formatRatioPercent(stage.conversionPrevRate, 2)}`
      : undefined,
    conversionWoW: stage.conversionWoW,
    prevText: `上周 ${formatInteger(stage.prevValue)}`,
    color: resolveFunnelStageColor(index),
  }));
}
