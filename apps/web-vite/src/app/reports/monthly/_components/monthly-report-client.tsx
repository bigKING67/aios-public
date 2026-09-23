'use client';

import { useState } from 'react';
import { Tabs } from 'antd';
import { useMonthlyReport } from '@/hooks/use-monthly-report';
import { useFilter } from '@/hooks/use-filter';
import { ReportSkeleton } from '@/components/organisms/report-skeleton';
import { ErrorState } from '@/components/states/error-state';
import { ReportHeader } from './report-header';
import { MonthlyOverviewTab } from './monthly-overview-tab';
import type { MonthlyReportResponse } from '@/types/reports';

interface MonthlyReportClientProps {
  reportId: string;
}

/**
 * 从平台数据动态生成 Tab 配置（复用周报逻辑）
 */
function generateTabsFromReport(data: MonthlyReportResponse): Array<{
  key: string;
  label: string;
  children: React.ReactNode;
}> {
  const tabs = [
    {
      key: 'overview',
      label: '概览',
      children: <MonthlyOverviewTab report={data} />,
    },
  ];

  return tabs;
}

/**
 * 月报页面（Client Component）
 *
 * 职责：
 * 1. 从 FilterContext 读取 monthPeriod 筛选
 * 2. 使用 useMonthlyReport Hook 获取数据
 * 3. 从数据动态生成 Tab 配置
 * 4. 处理加载/错误状态
 * 5. 渲染报告内容
 *
 * 设计特点：
 * - 复用周报的组件和逻辑
 * - 动态 Tab 生成支持任意平台数量
 * - 完整的错误和加载状态处理
 */
export function MonthlyReportClient({ reportId }: MonthlyReportClientProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const { filters } = useFilter();
  const { data, isLoading, error } = useMonthlyReport({
    reportId,
    monthPeriod: filters.monthPeriod || reportId,
    enabled: true,
  });

  // 错误状态
  if (error) {
    return (
      <ErrorState
        title="获取报告失败"
        subTitle={error.message || '无法加载月报数据，请稍后重试'}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // 加载状态
  if (isLoading && !data) {
    return <ReportSkeleton />;
  }

  // 确保有数据
  if (!data) {
    return (
      <ErrorState
        title="报告不存在"
        subTitle={`未找到报告：${reportId}`}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // 从数据动态生成 Tab 配置
  const tabItems = generateTabsFromReport(data);

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      {/* 报告头部：标题、时间、版本、导出按钮 */}
      <ReportHeader report={data} reportId={reportId} />

      {/* Tab 切换：从数据动态生成 */}
      <div className="bg-bg-card rounded-lg shadow-sm p-4 sm:p-5 lg:p-6">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </div>
    </div>
  );
}
