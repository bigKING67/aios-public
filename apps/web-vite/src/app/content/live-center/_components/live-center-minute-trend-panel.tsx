import { Alert, Empty } from 'antd';
import { LineChart } from '@/components/organisms/line-chart';
import type { LineChartData } from '@/components/organisms/line-chart';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import { formatInteger } from '../_lib/live-center-formatters';
import type { LiveCenterMinuteMetric } from '../_lib/live-center-types';
import { summarizeMinuteMetrics } from '../_lib/live-center-view-helpers';
import styles from '../live-center.module.css';
import { MetricCell, PanelHeader } from './live-center-shared';

export function MinuteTrendPanel({
  chartData,
  liveOrderCount,
  minuteMetrics,
}: {
  chartData: LineChartData;
  liveOrderCount: number | null;
  minuteMetrics: LiveCenterMinuteMetric[];
}) {
  const matchedCount = minuteMetrics.filter((metric) => metric.matchStatus === 'matched').length;
  const overlapCount = minuteMetrics.filter((metric) => metric.matchStatus === 'overlap_resolved').length;
  const trendSummary = summarizeMinuteMetrics(minuteMetrics);
  const orderGap = resolveOrderGap(liveOrderCount, trendSummary.totalOrders);
  const hasRenderableMinuteData = Boolean(chartData.series[0]?.data.length);
  const hasOrdersWithoutMinuteMetrics =
    !hasRenderableMinuteData && typeof liveOrderCount === 'number' && liveOrderCount > 0;

  return (
    <section className={`${styles.panel} ${styles.minuteTrendPanel}`} aria-label="成交订单分钟线">
      <PanelHeader
        title="成交订单分钟线"
        description="按分钟定位成交峰值。"
        extra={(
          <div className={styles.panelMetaStrip}>
            <span>匹配 {formatInteger(matchedCount)}</span>
            <span>重叠归属 {formatInteger(overlapCount)}</span>
          </div>
        )}
      />
      {trendSummary.pointCount > 0 ? (
        <div className={styles.trendEvidenceBlock}>
          <div className={styles.trendSummaryGrid}>
            <MetricCell label="绘制点位" value={formatInteger(trendSummary.pointCount)} />
            <MetricCell label="场次汇总订单" value={`${formatInteger(liveOrderCount)} 单`} />
            <MetricCell label="分钟订单合计" value={formatInteger(trendSummary.totalOrders)} />
            <MetricCell label="源头差异" value={resolveOrderGapLabel(orderGap)} />
            <MetricCell label="峰值分钟" value={trendSummary.peakLabel} />
          </div>
          {typeof orderGap === 'number' && orderGap !== 0 ? (
            <Alert
              className={styles.inlineAlert}
              type="warning"
              showIcon
              message="源头订单口径存在差异"
              description={
                `场次汇总 ${formatInteger(liveOrderCount)} 单，分钟明细 ${formatInteger(trendSummary.totalOrders)} 单，`
                + `${resolveOrderGapDescription(orderGap)}。该提示表示两个 ODS 源头落数或口径不同，不代表图表绘制失败。`
              }
            />
          ) : null}
        </div>
      ) : null}
      {hasRenderableMinuteData ? (
        <div className={styles.minuteTrendChartFrame} data-live-center-minute-chart-frame="true">
          <LineChart
            className={styles.minuteTrendChartCanvas}
            colors={[ECHARTS_CHART_TOKENS.primarySeries]}
            data={chartData}
            height="100%"
            lineStep="middle"
            showArea={false}
            showDataLabel={false}
            showPointSymbol={false}
            smooth={false}
            yAxisMinInterval={1}
          />
        </div>
      ) : (
        <Empty
          className={
            hasOrdersWithoutMinuteMetrics
              ? `${styles.emptyBlock} ${styles.emptyBlockWarning}`
              : styles.emptyBlock
          }
          description={resolveMinuteEmptyDescription(liveOrderCount)}
        />
      )}
    </section>
  );
}

function resolveMinuteEmptyDescription(liveOrderCount: number | null): string {
  if (typeof liveOrderCount === 'number' && liveOrderCount > 0) {
    return `已有 ${formatInteger(liveOrderCount)} 单，但暂无分钟点；请复核指标刷新。`;
  }
  return '暂无可绘制分钟订单。';
}

function resolveOrderGap(liveOrderCount: number | null, minuteOrderCount: number): number | null {
  if (typeof liveOrderCount !== 'number' || !Number.isFinite(liveOrderCount)) {
    return null;
  }
  return liveOrderCount - minuteOrderCount;
}

function resolveOrderGapLabel(orderGap: number | null): string {
  if (typeof orderGap !== 'number') {
    return '-';
  }
  if (orderGap === 0) {
    return '一致';
  }
  return `${orderGap > 0 ? '+' : '-'}${formatInteger(Math.abs(orderGap))} 单`;
}

function resolveOrderGapDescription(orderGap: number): string {
  const direction = orderGap > 0 ? '场次汇总多' : '分钟明细多';
  return `${direction} ${formatInteger(Math.abs(orderGap))} 单`;
}
