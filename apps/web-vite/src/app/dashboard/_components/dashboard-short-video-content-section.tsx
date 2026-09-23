import { Segmented } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';

import { DashboardChart } from './dashboard-chart';
import chartStyles from './dashboard-chart.module.css';
import { DashboardMetricCardSection } from './dashboard-metric-card-section';
import { SHORT_VIDEO_SCOPE_OPTIONS } from './dashboard-metric-definitions';
import noticeStyles from './dashboard-notice.module.css';
import { DashboardShortVideoDetailSection } from './dashboard-short-video-detail-section';
import trafficSectionControlStyles from './dashboard-traffic-section-control.module.css';
import trafficSectionHeaderStyles from './dashboard-traffic-section-header.module.css';
import trafficSectionStyles from './dashboard-traffic-section.module.css';
import type { DashboardShortVideoDetailSectionProps } from './dashboard-short-video-detail-section';
import type { LiveMetricCard, ShortVideoScope } from './dashboard-types';

export type DashboardShortVideoContentSectionProps = {
  loadError: string | null;
  shortVideoScope: ShortVideoScope;
  topMetricCards: LiveMetricCard[];
  bottomMetricCards: LiveMetricCard[];
  trendOption: EChartsCoreOption;
  detailSectionProps: DashboardShortVideoDetailSectionProps;
  onShortVideoScopeChange: (scope: ShortVideoScope) => void;
  getTrendClassNameByRate: (value: number | null | undefined) => string;
};

export function DashboardShortVideoContentSection({
  loadError,
  shortVideoScope,
  topMetricCards,
  bottomMetricCards,
  trendOption,
  detailSectionProps,
  onShortVideoScopeChange,
  getTrendClassNameByRate,
}: DashboardShortVideoContentSectionProps) {
  return (
    <div className={trafficSectionStyles.sectionStack}>
      {loadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>短视频维度数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{loadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 短视频明细事实表刷新状态。
          </span>
        </section>
      ) : null}

      <DashboardMetricCardSection
        header={
          <div className={trafficSectionHeaderStyles.head}>
            <div className={`${trafficSectionHeaderStyles.meta} ${trafficSectionHeaderStyles.liveScopeMeta}`}>
              <div className={trafficSectionControlStyles.liveScopeSwitch}>
                <Segmented<ShortVideoScope>
                  name="dashboard-shortvideo-scope"
                  size="small"
                  value={shortVideoScope}
                  onChange={(value) => onShortVideoScopeChange(value as ShortVideoScope)}
                  options={SHORT_VIDEO_SCOPE_OPTIONS}
                />
              </div>
            </div>
          </div>
        }
        topCards={topMetricCards}
        bottomCards={bottomMetricCards}
        trendIdPrefix={`shortvideo-scope-${shortVideoScope}`}
        getTrendClassNameByRate={getTrendClassNameByRate}
        miniTrendVariant="dense"
        resolveTopHeading={(item) => ({
          title: item.key === 'shortvideo_count' ? '视频数量' : item.key === 'shortvideo_gmv' ? 'GMV' : 'GSV',
          subtitle: item.label,
        })}
      />

      <DashboardChart
        title="短视频趋势"
        option={trendOption}
        className={chartStyles.widePanel}
      />

      <DashboardShortVideoDetailSection {...detailSectionProps} />
    </div>
  );
}
