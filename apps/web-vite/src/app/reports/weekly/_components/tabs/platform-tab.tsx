'use client';

import { useIsMobile } from '@/hooks/use-media-query';
import { PlatformTabBody } from './platform-tab-body';
import { buildPlatformTabColumns } from './platform-tab-columns';
import { PlatformTabEmptyState } from './platform-tab-empty-state';
import { resolvePlatformTabContext } from './platform-tab-context';
import { buildPlatformTabRenderState } from './platform-tab-render-state';
import type {
  PlatformTabProps,
  TrendMetricDefinition,
} from './platform-tab-types';
import {
  DOUYIN_CHANNEL_COLORS,
  getCategoryWaterfallColor,
  getTrendClassName,
} from './platform-tab-visuals';

const TREND_METRICS: TrendMetricDefinition[] = [
  { key: 'gmv', label: 'GMV' },
  { key: 'orders', label: '订单' },
  { key: 'uv', label: 'UV' },
];

/**
 * 平台 Tab：单个平台的详细数据
 *
 * 布局：
 * - 第一行：平台核心指标卡（Material You 风格）
 * - 第二行：天猫显示「商品归因（表格 + 瀑布）」；其他平台显示趋势图
 * - 第三行：补充效率指标
 */
export function PlatformTab({ report, platform }: PlatformTabProps) {
  const isMobile = useIsMobile();
  const context = resolvePlatformTabContext(report, platform);
  const columns = buildPlatformTabColumns(getTrendClassName);
  const renderState = buildPlatformTabRenderState({
    report,
    isMobile,
    context,
    metricDefinitions: TREND_METRICS,
    columns,
    channelColors: DOUYIN_CHANNEL_COLORS,
    resolveCategoryWaterfallColor: getCategoryWaterfallColor,
  });

  if (renderState.kind === 'empty') {
    return <PlatformTabEmptyState />;
  }

  return <PlatformTabBody contentProps={renderState.contentProps} />;
}
