import { InfoCircleOutlined } from '@ant-design/icons';
import { Button, Segmented, Tooltip } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';

import { SPOTLIGHT_TREND_COLOR, type QueryPlatform } from './dashboard-config';
import { DashboardChart } from './dashboard-chart';
import chartStyles from './dashboard-chart.module.css';
import { toCompactNumber } from './dashboard-formatters';
import metricCardStyles from './dashboard-metric-card-grid.module.css';
import spotlightStyles from './dashboard-metric-spotlight.module.css';
import { MiniTrend } from './dashboard-mini-trend';
import { DashboardNoteDrawer, type DashboardNoteDrawerProps } from './dashboard-note-drawer';
import noticeStyles from './dashboard-notice.module.css';
import { DashboardOverviewDetailSection } from './dashboard-overview-detail-section';
import type { DashboardOverviewDetailSectionProps } from './dashboard-overview-detail-section';
import { formatTrend } from './dashboard-overview-snapshot';
import trendStyles from './dashboard-trend-status.module.css';
import type {
  DashboardCustomTrendGranularity,
  DashboardDayMiniTrendWindow,
} from './dashboard-trend-context';
import type { DashboardSnapshot } from './dashboard-types';

export type DashboardBusinessOverviewSectionProps = {
  overviewLoadError: string | null;
  hasRealSnapshot: boolean;
  snapshot: DashboardSnapshot;
  dayMiniTrendWindow: DashboardDayMiniTrendWindow | null;
  showPlatformShare: boolean;
  trendTitle: string;
  trendSubtitle?: string;
  trendOption: EChartsCoreOption;
  shareOption: EChartsCoreOption;
  isDayMode: boolean;
  showCustomTrendGranularity: boolean;
  customTrendGranularity: DashboardCustomTrendGranularity;
  showNoteMarkers: boolean;
  dailyNotesLoading: boolean;
  activeQueryPlatform: QueryPlatform;
  canWriteDailyNote: boolean;
  overviewDetailProps: DashboardOverviewDetailSectionProps;
  noteDrawerProps: DashboardNoteDrawerProps;
  onToggleNoteMarkers: () => void;
  onOpenDailyNoteDrawer: () => void;
  onTrendPointClick: (params: unknown) => void;
  onCustomTrendGranularityChange: (granularity: DashboardCustomTrendGranularity) => void;
};

export function DashboardBusinessOverviewSection({
  overviewLoadError,
  hasRealSnapshot,
  snapshot,
  dayMiniTrendWindow,
  showPlatformShare,
  trendTitle,
  trendSubtitle,
  trendOption,
  shareOption,
  isDayMode,
  showCustomTrendGranularity,
  customTrendGranularity,
  showNoteMarkers,
  dailyNotesLoading,
  activeQueryPlatform,
  canWriteDailyNote,
  overviewDetailProps,
  noteDrawerProps,
  onToggleNoteMarkers,
  onOpenDailyNoteDrawer,
  onTrendPointClick,
  onCustomTrendGranularityChange,
}: DashboardBusinessOverviewSectionProps) {
  const carrierCards = snapshot.carrierCards || [];

  return (
    <>
      {overviewLoadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>看板数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{overviewLoadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            {hasRealSnapshot
              ? '当前页面已保留最近一次成功快照，避免错误被误判为业务全 0。'
              : '当前暂无可用快照，请先完成数据库迁移与 ETL 补刷后再刷新页面。'}
          </span>
        </section>
      ) : null}

      <section className={spotlightStyles.spotlightGrid}>
        {snapshot.spotlight.map((item) => {
          const trendValues = (() => {
            if (!dayMiniTrendWindow) {
              return item.trend;
            }
            if (item.key === 'gmv') {
              return dayMiniTrendWindow.gmv;
            }
            if (item.key === 'user-pay-amount') {
              return dayMiniTrendWindow.userPayAmount;
            }
            if (item.key === 'gsv') {
              return dayMiniTrendWindow.gsv;
            }
            return dayMiniTrendWindow.refundRate;
          })();
          const trendLabels = dayMiniTrendWindow
            ? dayMiniTrendWindow.labels
            : item.trend.map((_, index) => snapshot.trendLabels[index] || `${index + 1}`);
          const trendValueFormatter = (value: number) => {
            if (item.key === 'refund-rate') {
              return `${value.toFixed(2)}%`;
            }
            return `¥${toCompactNumber(value)}`;
          };

          return (
            <article key={item.key} className={spotlightStyles.spotlightCard}>
              <div className={spotlightStyles.spotlightHeading}>
                <span>{item.heading}</span>
                {item.tooltip ? (
                  <Tooltip title={item.tooltip}>
                    <span
                      className={spotlightStyles.spotlightTooltipIcon}
                      aria-label={`${item.heading}口径说明`}
                      role="img"
                    >
                      <InfoCircleOutlined />
                    </span>
                  </Tooltip>
                ) : null}
                {item.label ? <span className={spotlightStyles.spotlightSubtitle}>{item.label}</span> : null}
              </div>
              <div className={spotlightStyles.spotlightValue}>{item.displayValue}</div>
              <div className={spotlightStyles.spotlightMeta}>
                <span className={item.change >= 0 ? trendStyles.trendUp : trendStyles.trendDown}>
                  {formatTrend(item.change)}
                </span>
                <span>较上周期</span>
              </div>
              <MiniTrend
                id={`spotlight-${item.key}`}
                values={trendValues}
                labels={trendLabels}
                color={SPOTLIGHT_TREND_COLOR}
                formatValue={trendValueFormatter}
                variant="dense"
              />
            </article>
          );
        })}
      </section>

      <section className={metricCardStyles.metricGrid}>
        {snapshot.metrics.map((metric) => (
          <article key={metric.key} className={metricCardStyles.metricCard}>
            <p className={metricCardStyles.metricCardLabel}>{metric.label}</p>
            <strong className={metricCardStyles.metricCardValue}>{metric.value}</strong>
            <span className={metric.change >= 0 ? trendStyles.trendUp : trendStyles.trendDown}>
              {formatTrend(metric.change)}
            </span>
          </article>
        ))}
      </section>

      {carrierCards.length > 0 ? (
        <section
          className={`${metricCardStyles.metricGrid} ${metricCardStyles.metricCarrierGrid}`}
          aria-label="载体成交金额"
        >
          {carrierCards.map((metric) => (
            <article key={metric.key} className={metricCardStyles.metricCard}>
              <p className={metricCardStyles.metricCardLabel}>{metric.label}</p>
              <strong className={metricCardStyles.metricCardValue}>{metric.value}</strong>
              <div className={spotlightStyles.spotlightMeta}>
                <span className={metric.change >= 0 ? trendStyles.trendUp : trendStyles.trendDown}>
                  {formatTrend(metric.change)}
                </span>
                <span>较上周期</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section
        className={`${chartStyles.layout} ${
          showPlatformShare ? chartStyles.layoutWithShare : chartStyles.layoutSingle
        }`}
      >
        <DashboardChart
          title={trendTitle}
          subtitle={trendSubtitle}
          option={trendOption}
          onPointClick={onTrendPointClick}
          onNoteLinkClick={onOpenDailyNoteDrawer}
          headerExtra={showCustomTrendGranularity ? (
            <Segmented<DashboardCustomTrendGranularity>
              size="small"
              aria-label="区间趋势展示粒度"
              value={customTrendGranularity}
              options={[
                { label: '日', value: 'day' },
                { label: '月', value: 'month' },
              ]}
              onChange={onCustomTrendGranularityChange}
            />
          ) : isDayMode ? (
            <div className={chartStyles.notesActions}>
              <Button
                size="small"
                type={showNoteMarkers ? 'primary' : 'default'}
                ghost={showNoteMarkers}
                loading={dailyNotesLoading}
                onClick={onToggleNoteMarkers}
              >
                {showNoteMarkers ? '隐藏日报标记' : '显示日报标记'}
              </Button>
              <Button size="small" onClick={onOpenDailyNoteDrawer}>
                查看日报
              </Button>
              {activeQueryPlatform !== 'overview' ? (
                <Button
                  size="small"
                  type="primary"
                  disabled={!canWriteDailyNote}
                  onClick={onOpenDailyNoteDrawer}
                >
                  写日报
                </Button>
              ) : null}
            </div>
          ) : undefined}
          className={chartStyles.widePanel}
        />
        {showPlatformShare ? (
          <DashboardChart
            title="平台成交贡献"
            option={shareOption}
            className={chartStyles.narrowPanel}
          />
        ) : null}
      </section>

      <DashboardOverviewDetailSection {...overviewDetailProps} />
      <DashboardNoteDrawer {...noteDrawerProps} />
    </>
  );
}
