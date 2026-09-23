'use client';

import { LineChart } from '@/components/organisms/line-chart';
import type {
  PlatformTrendSectionProps,
} from './platform-tab-trend-section-contracts';
import {
  WeeklyBlock,
  WeeklyChartFrame,
  WeeklyEmptyState,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function PlatformTrendSection({
  platformLabel,
  lineChartProps,
  summaryText,
}: PlatformTrendSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title={`${platformLabel}趋势`}
        description="按自然日观察 GMV、订单与 UV 的波动节奏。"
      />
      <WeeklyChartFrame>
        {lineChartProps ? (
          <LineChart
            {...lineChartProps}
          />
        ) : (
          <WeeklyEmptyState description="暂无趋势数据" />
        )}
      </WeeklyChartFrame>
      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
