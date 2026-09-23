import { Drawer, Tag } from 'antd';

import {
  formatCompactWanCurrency,
  formatLiveDetailMetricValue,
  formatTableInteger,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { LIVE_DETAIL_DRAWER_GROUPS } from './dashboard-metric-definitions';
import {
  formatLiveGoodsAnchorType,
  formatLiveGoodsSessionTime,
} from './dashboard-live-goods-formatters';
import {
  getLiveDetailGsv,
} from './dashboard-live-detail-formatters';
import tableStyles from './dashboard-live-detail-table-cells.module.css';
import hintStyles from './dashboard-drawer-hint.module.css';
import drawerHeaderStyles from './dashboard-live-detail-drawer-header.module.css';
import drawerMetricStyles from './dashboard-live-detail-drawer-metrics.module.css';
import drawerSummaryStyles from './dashboard-live-detail-drawer-summary.module.css';
import drawerStyles from './dashboard-live-detail-drawer.module.css';
import type { DashboardLiveDetailRow } from './dashboard-types';

export type DashboardLiveDetailDrawerProps = {
  open: boolean;
  isMobile: boolean;
  selectedRow: DashboardLiveDetailRow | null;
  onClose: () => void;
};

export function DashboardLiveDetailDrawer({
  open,
  isMobile,
  selectedRow,
  onClose,
}: DashboardLiveDetailDrawerProps) {
  return (
    <Drawer
      title="直播指标详情"
      placement="right"
      width={isMobile ? '100%' : 560}
      closable={{ placement: 'end' }}
      open={open}
      onClose={onClose}
    >
      {selectedRow ? (
        <div className={drawerStyles.content}>
          <div className={drawerHeaderStyles.header}>
            <h4 className={drawerHeaderStyles.headerTitle}>{selectedRow.anchor_nickname || '--'}</h4>
            <p className={drawerHeaderStyles.headerTime}>{formatLiveGoodsSessionTime(selectedRow.live_start_time)}</p>
          </div>
          <div className={drawerHeaderStyles.meta}>
            <Tag className={tableStyles.liveDetailTypeTag}>{formatLiveGoodsAnchorType(selectedRow.anchor_type)}</Tag>
            <span className={drawerHeaderStyles.metaItem}>{`抖音号 ${selectedRow.anchor_douyin_id || '--'}`}</span>
            <span className={drawerHeaderStyles.metaItem}>{selectedRow.shop_name || selectedRow.shop_id || '--'}</span>
          </div>
          <div className={drawerSummaryStyles.summary}>
            <span className={drawerSummaryStyles.summaryItem}>
              <small className={drawerSummaryStyles.summaryLabel}>GMV</small>
              <strong className={drawerSummaryStyles.summaryValue}>
                {formatCompactWanCurrency(selectedRow.live_gmv)}
              </strong>
            </span>
            <span className={drawerSummaryStyles.summaryItem}>
              <small className={drawerSummaryStyles.summaryLabel}>GSV</small>
              <strong className={drawerSummaryStyles.summaryValue}>
                {formatCompactWanCurrency(getLiveDetailGsv(selectedRow))}
              </strong>
            </span>
            <span className={drawerSummaryStyles.summaryItem}>
              <small className={drawerSummaryStyles.summaryLabel}>成交人数</small>
              <strong className={drawerSummaryStyles.summaryValue}>
                {formatTableInteger(selectedRow.live_buyer_count)}
              </strong>
            </span>
            <span className={drawerSummaryStyles.summaryItem}>
              <small className={drawerSummaryStyles.summaryLabel}>退款率</small>
              <strong className={drawerSummaryStyles.summaryValue}>{formatTableRate(selectedRow.refund_rate)}</strong>
            </span>
          </div>
          <div className={drawerMetricStyles.metricGroups}>
            {LIVE_DETAIL_DRAWER_GROUPS.map((group) => (
              <section key={group.title} className={drawerMetricStyles.metricGroup}>
                <h5>{group.title}</h5>
                <div className={drawerMetricStyles.metricGrid}>
                  {group.metrics.map((metric) => (
                    <span key={metric.key} className={drawerMetricStyles.metricItem}>
                      <small className={drawerMetricStyles.metricLabel}>{metric.title}</small>
                      <strong className={drawerMetricStyles.metricValue}>
                        {formatLiveDetailMetricValue(
                          selectedRow[metric.key] as NumericInput,
                          metric.format,
                          metric.digits ?? 2
                        )}
                      </strong>
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <p className={hintStyles.hint}>点击直播明细行里的「查看更多指标」查看完整指标。</p>
      )}
    </Drawer>
  );
}
