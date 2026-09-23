import type { WaterfallChartProps } from '@/components/organisms/waterfall-chart';

export type AttributionWaterfallChartProps = WaterfallChartProps | null;

interface BuildAttributionWaterfallChartPropsInput {
  title: string;
  previousValue: number;
  currentValue: number;
  steps: WaterfallChartProps['steps'];
  totalColor: string;
}

export function buildAttributionWaterfallChartProps({
  title,
  previousValue,
  currentValue,
  steps,
  totalColor,
}: BuildAttributionWaterfallChartPropsInput): AttributionWaterfallChartProps {
  if (steps.length === 0) {
    return null;
  }

  return {
    title,
    startLabel: '上周同期',
    endLabel: '本周同期',
    startValue: previousValue,
    endValue: currentValue,
    steps,
    totalColor,
    showBoundaryTotals: false,
    height: 360,
    gridBottomPx: 26,
  };
}
