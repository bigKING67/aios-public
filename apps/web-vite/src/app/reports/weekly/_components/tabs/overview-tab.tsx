'use client';

import { WeeklySummaryCard } from '@/components/organisms/weekly-summary-card';
import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { OverviewByWeekTrendSection } from './overview-by-week-trend-section';
import { OverviewKpiSection } from './overview-kpi-section';
import { OverviewPlatformBreakdownSection } from './overview-platform-breakdown-section';
import { OverviewTrendSection } from './overview-trend-section';
import { buildOverviewTabContentProps } from './overview-tab-content-adapter';
import {
  WeeklyPageStack,
  resolveWeeklyTrendClassName,
} from './weekly-primitives';

interface OverviewTabProps {
  report: WeeklyReportResponse;
}

function resolveOverviewTrendClassName(value: number | undefined): string {
  return resolveWeeklyTrendClassName(value, 'up');
}

/**
 * 概览 Tab：总结 + 全公司级 KPI + 趋势
 *
 * 布局：
 * - 第一行：周报总结（总体、亮点、风险）
 * - 第二行：核心指标 KPI 卡片（6 个，2-3 列网格）
 * - 第三行：7 天趋势图表
 *
 * 数据语义：
 * - 支持按 weekPeriod 筛选数据
 * - 显示 6 个核心指标（GMV、GSV、订单数、成交用户、客单价、退款金额）
 * - 显示环比增长率
 */
export function OverviewTab({ report }: OverviewTabProps) {
  const {
    summaryCardProps,
    kpiSectionProps,
    trendSectionProps,
    byWeekTrendSectionProps,
    platformBreakdownSectionProps,
  } = buildOverviewTabContentProps({
    report,
    resolveTrendClassName: resolveOverviewTrendClassName,
  });

  return (
    <WeeklyPageStack>
      <WeeklySummaryCard
        {...summaryCardProps}
      />

      <OverviewKpiSection
        {...kpiSectionProps}
      />

      <OverviewTrendSection {...trendSectionProps} />

      <OverviewByWeekTrendSection {...byWeekTrendSectionProps} />

      <OverviewPlatformBreakdownSection {...platformBreakdownSectionProps} />
    </WeeklyPageStack>
  );
}
