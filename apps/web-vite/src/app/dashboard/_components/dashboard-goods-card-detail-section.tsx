import type { Key, ReactNode } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';

import { DashboardChart } from './dashboard-chart';
import chartStyles from './dashboard-chart.module.css';
import detailActionsStyles from './dashboard-detail-section-actions.module.css';
import detailMetaStyles from './dashboard-detail-section-meta.module.css';
import detailStyles from './dashboard-detail-section.module.css';
import { DashboardGoodsCardTrafficDrawer } from './dashboard-goods-card-traffic-drawer';
import cardTableStyles from './dashboard-goods-data-table-card.module.css';
import tableShellStyles from './dashboard-goods-data-table-shell.module.css';
import { DashboardMetricCardSection } from './dashboard-metric-card-section';
import spotlightStyles from './dashboard-metric-spotlight.module.css';
import noticeStyles from './dashboard-notice.module.css';
import trafficSectionHeaderStyles from './dashboard-traffic-section-header.module.css';
import trafficSectionStyles from './dashboard-traffic-section.module.css';
import type {
  DashboardGoodsCardRow,
  DashboardGoodsCardTrafficTreeNode,
  LiveMetricCard,
} from './dashboard-types';

export type DashboardGoodsCardDetailSectionProps = {
  isMobile: boolean;
  loadError: string | null;
  topMetricCards: LiveMetricCard[];
  bottomMetricCards: LiveMetricCard[];
  trendOption: EChartsCoreOption;
  rows: DashboardGoodsCardRow[];
  columns: ColumnsType<DashboardGoodsCardRow>;
  loading: boolean;
  emptyText: ReactNode;
  trafficDrawerOpen: boolean;
  selectedTrafficRow: DashboardGoodsCardRow | null;
  trafficRangeLabel: string;
  trafficAsOfDate: string;
  trafficLoadError: string | null;
  trafficRows: DashboardGoodsCardTrafficTreeNode[];
  trafficColumns: ColumnsType<DashboardGoodsCardTrafficTreeNode>;
  trafficLoading: boolean;
  expandedTrafficRowKeys: Key[];
  onExpandedTrafficRowKeysChange: (keys: Key[]) => void;
  onCloseTrafficDrawer: () => void;
  getTrendClassNameByRate: (value: number | null | undefined) => string;
};

export function DashboardGoodsCardDetailSection({
  isMobile,
  loadError,
  topMetricCards,
  bottomMetricCards,
  trendOption,
  rows,
  columns,
  loading,
  emptyText,
  trafficDrawerOpen,
  selectedTrafficRow,
  trafficRangeLabel,
  trafficAsOfDate,
  trafficLoadError,
  trafficRows,
  trafficColumns,
  trafficLoading,
  expandedTrafficRowKeys,
  onExpandedTrafficRowKeysChange,
  onCloseTrafficDrawer,
  getTrendClassNameByRate,
}: DashboardGoodsCardDetailSectionProps) {
  return (
    <div className={trafficSectionStyles.sectionStack}>
      {loadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>商品卡维度数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{loadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 商品卡主表刷新状态。
          </span>
        </section>
      ) : null}

      <DashboardMetricCardSection
        header={
          <div className={trafficSectionHeaderStyles.head}>
            <div className={trafficSectionHeaderStyles.meta}>
              <h3 className={trafficSectionHeaderStyles.title}>商品卡核心指标</h3>
            </div>
          </div>
        }
        topCards={topMetricCards}
        bottomCards={bottomMetricCards}
        trendIdPrefix="goods-card"
        topGridClassName={spotlightStyles.goodsCardSpotlightGrid}
        topCardClassName={spotlightStyles.goodsCardSpotlightCard}
        miniTrendVariant="compact"
        getTrendClassNameByRate={getTrendClassNameByRate}
        resolveTopHeading={(item) => ({
          title: item.label,
        })}
      />

      <DashboardChart
        title="商品卡趋势"
        option={trendOption}
        className={chartStyles.widePanel}
      />

      <section className={detailStyles.detailPanel}>
        <div className={detailActionsStyles.detailHead}>
          <div className={detailMetaStyles.detailMeta}>
            <h3 className={detailMetaStyles.detailMetaTitle}>商品卡列表</h3>
          </div>
        </div>
        <Table<DashboardGoodsCardRow>
          rowKey={(row) => `${row.shop_id || ''}-${row.date || ''}-${row.product_id || ''}-${row.id ?? ''}`}
          className={`${tableShellStyles.goodsCardDataTable} ${cardTableStyles.goodsCardDataTableLayout}`}
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          sortDirections={['ascend', 'descend']}
          scroll={{ x: 'max-content', y: isMobile ? undefined : 560 }}
          rowClassName={() => tableShellStyles.goodsCardDataTableRow}
          pagination={{
            pageSize: isMobile ? 8 : 20,
            showSizeChanger: !isMobile,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{
            emptyText,
          }}
        />
      </section>

      <DashboardGoodsCardTrafficDrawer
        open={trafficDrawerOpen}
        isMobile={isMobile}
        selectedRow={selectedTrafficRow}
        rangeLabel={trafficRangeLabel}
        asOfDate={trafficAsOfDate}
        loadError={trafficLoadError}
        rows={trafficRows}
        columns={trafficColumns}
        loading={trafficLoading}
        expandedRowKeys={expandedTrafficRowKeys}
        onExpandedRowKeysChange={onExpandedTrafficRowKeysChange}
        onClose={onCloseTrafficDrawer}
      />
    </div>
  );
}
