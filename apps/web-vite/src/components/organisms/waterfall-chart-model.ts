export interface WaterfallStepItem {
  name: string;
  delta: number;
  current: number;
  prev: number;
  share: number; // 百分比值，例如 32.5
  color?: string;
}

export interface WaterfallChartProps {
  title?: string;
  startLabel?: string;
  endLabel?: string;
  startValue: number;
  endValue: number;
  steps: WaterfallStepItem[];
  totalColor?: string;
  showBoundaryTotals?: boolean;
  loading?: boolean;
  height?: number;
  gridBottomPx?: number;
}

export type WaterfallChartMetaItem =
  | { type: 'start'; value: number }
  | {
      type: 'step';
      delta: number;
      current: number;
      prev: number;
      share: number;
      before: number;
      after: number;
      name: string;
    }
  | { type: 'end'; value: number; delta: number };

export interface WaterfallChartComputedModel {
  categories: string[];
  values: number[];
  positiveValues: Array<number | null>;
  negativeValues: Array<number | null>;
  legendItems: Array<{
    name: string;
    color: string;
  }>;
  colors: string[];
  meta: WaterfallChartMetaItem[];
  hasNegativeStep: boolean;
  averageContribution: number;
}

interface BuildWaterfallChartComputedInput {
  startLabel: string;
  endLabel: string;
  startValue: number;
  endValue: number;
  steps: WaterfallStepItem[];
  primaryColor: string;
  boundaryTotalColor: string;
  showBoundaryTotals: boolean;
}

export function formatCurrencyCompact(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absValue = Math.abs(safeValue);

  if (absValue >= 10_000_000) {
    return `¥${(safeValue / 10_000_000).toFixed(2)}千万`;
  }
  if (absValue >= 10_000) {
    return `¥${(safeValue / 10_000).toFixed(2)}万`;
  }
  return `¥${safeValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatSignedCurrency(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (safeValue > 0) {
    return `+${formatCurrencyCompact(safeValue)}`;
  }
  if (safeValue < 0) {
    return `-${formatCurrencyCompact(Math.abs(safeValue))}`;
  }
  return formatCurrencyCompact(0);
}

export function formatSignedPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(Math.abs(safeValue));
  if (rounded === 0) {
    return '0%';
  }

  const sign = safeValue > 0 ? '+' : '-';
  return `${sign}${rounded}%`;
}

export function buildWaterfallChartComputedModel({
  startLabel,
  endLabel,
  startValue,
  endValue,
  steps,
  primaryColor,
  boundaryTotalColor,
  showBoundaryTotals,
}: BuildWaterfallChartComputedInput): WaterfallChartComputedModel {
  const safeStart = Number.isFinite(startValue) ? startValue : 0;
  const safeEnd = Number.isFinite(endValue) ? endValue : 0;
  const safeSteps = steps.map((item) => ({
    name: item.name,
    delta: Number.isFinite(item.delta) ? item.delta : 0,
    current: Number.isFinite(item.current) ? item.current : 0,
    prev: Number.isFinite(item.prev) ? item.prev : 0,
    share: Number.isFinite(item.share) ? item.share : 0,
    color: item.color,
  }));

  const categories: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const meta: WaterfallChartMetaItem[] = [];

  if (showBoundaryTotals) {
    categories.push(startLabel);
    values.push(safeStart);
    colors.push(boundaryTotalColor);
    meta.push({ type: 'start', value: safeStart });
  }

  let running = safeStart;
  for (const item of safeSteps) {
    const before = running;
    const after = before + item.delta;

    categories.push(item.name);
    values.push(item.delta);
    colors.push(item.color || primaryColor);
    meta.push({
      type: 'step',
      name: item.name,
      delta: item.delta,
      current: item.current,
      prev: item.prev,
      share: item.share,
      before,
      after,
    });

    running = after;
  }

  if (showBoundaryTotals) {
    categories.push(endLabel);
    values.push(safeEnd);
    colors.push(boundaryTotalColor);
    meta.push({
      type: 'end',
      value: safeEnd,
      delta: safeEnd - safeStart,
    });
  }

  return {
    categories,
    values,
    positiveValues: values.map((value) => (value >= 0 ? value : null)),
    negativeValues: values.map((value) => (value < 0 ? value : null)),
    legendItems: safeSteps.map((item) => ({
      name: item.name,
      color: item.color || primaryColor,
    })),
    colors,
    meta,
    hasNegativeStep: safeSteps.some((item) => item.delta < 0),
    averageContribution: safeSteps.length > 0 ? 100 / safeSteps.length : 0,
  };
}
