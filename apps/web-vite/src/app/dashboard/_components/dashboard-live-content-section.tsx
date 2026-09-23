import { Segmented } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';

import { DashboardChart } from './dashboard-chart';
import chartStyles from './dashboard-chart.module.css';
import { DashboardLiveDetailDrawer } from './dashboard-live-detail-drawer';
import type { DashboardLiveDetailDrawerProps } from './dashboard-live-detail-drawer';
import { DashboardLiveDetailSection } from './dashboard-live-detail-section';
import type { DashboardLiveDetailSectionProps } from './dashboard-live-detail-section';
import { DashboardLiveFunnelDrawer } from './dashboard-live-funnel-drawer';
import type { DashboardLiveFunnelDrawerProps } from './dashboard-live-funnel-drawer';
import { DashboardLiveGoodsBoard } from './dashboard-live-goods-board';
import type { DashboardLiveGoodsBoardProps } from './dashboard-live-goods-board';
import liveTrendStyles from './dashboard-live-trend.module.css';
import { DashboardMetricCardSection } from './dashboard-metric-card-section';
import { LIVE_SCOPE_OPTIONS } from './dashboard-metric-definitions';
import noticeStyles from './dashboard-notice.module.css';
import trafficSectionControlStyles from './dashboard-traffic-section-control.module.css';
import trafficSectionHeaderStyles from './dashboard-traffic-section-header.module.css';
import trafficSectionStyles from './dashboard-traffic-section.module.css';
import type { LiveMetricCard, LiveScope } from './dashboard-types';

export type DashboardLiveContentSectionProps = {
  liveLoadError: string | null;
  liveGoodsLoadError: string | null;
  liveScope: LiveScope;
  topMetricCards: LiveMetricCard[];
  bottomMetricCards: LiveMetricCard[];
  trendOption: EChartsCoreOption;
  goodsBoardProps: DashboardLiveGoodsBoardProps;
  detailSectionProps: DashboardLiveDetailSectionProps;
  detailDrawerProps: DashboardLiveDetailDrawerProps;
  funnelDrawerProps: DashboardLiveFunnelDrawerProps;
  onLiveScopeChange: (scope: LiveScope) => void;
  onTrendPointClick: (params: unknown) => void;
  getTrendClassNameByRate: (value: number | null | undefined) => string;
};

export function DashboardLiveContentSection({
  liveLoadError,
  liveGoodsLoadError,
  liveScope,
  topMetricCards,
  bottomMetricCards,
  trendOption,
  goodsBoardProps,
  detailSectionProps,
  detailDrawerProps,
  funnelDrawerProps,
  onLiveScopeChange,
  onTrendPointClick,
  getTrendClassNameByRate,
}: DashboardLiveContentSectionProps) {
  return (
    <div className={trafficSectionStyles.sectionStack}>
      {liveLoadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>直播维度数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{liveLoadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 直播明细事实表刷新状态。
          </span>
        </section>
      ) : null}
      {liveGoodsLoadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>直播商品维度数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{liveGoodsLoadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 直播商品明细事实表刷新状态。
          </span>
        </section>
      ) : null}

      <DashboardMetricCardSection
        header={
          <div className={trafficSectionHeaderStyles.head}>
            <div className={`${trafficSectionHeaderStyles.meta} ${trafficSectionHeaderStyles.liveScopeMeta}`}>
              <div className={trafficSectionControlStyles.liveScopeSwitch}>
                <Segmented<LiveScope>
                  name="dashboard-live-scope"
                  size="small"
                  value={liveScope}
                  onChange={(value) => onLiveScopeChange(value as LiveScope)}
                  options={LIVE_SCOPE_OPTIONS}
                />
              </div>
            </div>
          </div>
        }
        topCards={topMetricCards}
        bottomCards={bottomMetricCards}
        trendIdPrefix={`live-scope-${liveScope}`}
        getTrendClassNameByRate={getTrendClassNameByRate}
        miniTrendVariant="dense"
        resolveTopHeading={(item) => ({
          title: item.key === 'live_session_count' ? '直播场次' : item.key === 'live_gmv' ? 'GMV' : 'GSV',
          subtitle: item.label,
        })}
      />
      <DashboardChart
        title="直播趋势"
        option={trendOption}
        onPointClick={onTrendPointClick}
        className={`${chartStyles.widePanel} ${liveTrendStyles.panel}`}
      />

      <DashboardLiveGoodsBoard {...goodsBoardProps} />
      <DashboardLiveDetailSection {...detailSectionProps} />
      <DashboardLiveDetailDrawer {...detailDrawerProps} />
      <DashboardLiveFunnelDrawer {...funnelDrawerProps} />
    </div>
  );
}
