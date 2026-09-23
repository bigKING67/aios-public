import type { Key, ReactNode } from 'react';
import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import noticeStyles from './dashboard-notice.module.css';
import { renderDashboardTrafficExpandIcon } from './dashboard-traffic-expand-icon';
import sectionHeaderStyles from './dashboard-traffic-section-header.module.css';
import sectionStyles from './dashboard-traffic-section.module.css';
import tableStyles from './dashboard-traffic-table.module.css';
import type {
  DashboardTrafficGoodsTreeNode,
  DashboardTrafficTreeNode,
} from './dashboard-types';

export type DashboardTrafficDetailSectionProps = {
  isMobile: boolean;
  trafficLoadError: string | null;
  trafficGoodsLoadError: string | null;
  trafficRows: DashboardTrafficTreeNode[];
  trafficGoodsRows: DashboardTrafficGoodsTreeNode[];
  trafficColumns: ColumnsType<DashboardTrafficTreeNode>;
  trafficGoodsColumns: ColumnsType<DashboardTrafficGoodsTreeNode>;
  trafficLoading: boolean;
  trafficGoodsLoading: boolean;
  expandedTrafficRowKeys: Key[];
  expandedTrafficGoodsRowKeys: Key[];
  onExpandedTrafficRowKeysChange: (keys: Key[]) => void;
  onExpandedTrafficGoodsRowKeysChange: (keys: Key[]) => void;
};

function resolveTrafficEmptyText(loading: boolean, loadError: string | null): ReactNode {
  if (loading) {
    return '流量维度数据加载中';
  }
  if (loadError) {
    return '流量维度数据加载失败，请查看上方提示';
  }
  return <Empty description="当前筛选条件下暂无流量数据" />;
}

function resolveTrafficGoodsEmptyText(loading: boolean, loadError: string | null): ReactNode {
  if (loading) {
    return '商品流量维度数据加载中';
  }
  if (loadError) {
    return '商品流量维度数据加载失败，请查看上方提示';
  }
  return <Empty description="当前筛选条件下暂无商品流量数据" />;
}

function getTrafficRowClassName(row: DashboardTrafficTreeNode): string {
  const rowClassNames = [tableStyles.trafficTableRow];

  if (row.sourceLevel <= 1) {
    rowClassNames.push(tableStyles.trafficTableRowL1);
    rowClassNames.push('traffic-row-l1');
  } else if (row.sourceLevel === 2) {
    rowClassNames.push(tableStyles.trafficTableRowL2);
    rowClassNames.push('traffic-row-l2');
  } else {
    rowClassNames.push(tableStyles.trafficTableRowL3);
    rowClassNames.push('traffic-row-l3');
  }

  return rowClassNames.join(' ');
}

function getTrafficGoodsRowClassName(row: DashboardTrafficGoodsTreeNode): string {
  const rowClassNames = [tableStyles.trafficTableRow];

  if (row.sourceLevel <= 0) {
    rowClassNames.push(tableStyles.trafficGoodsTableRowSummary);
    rowClassNames.push('traffic-goods-row-summary');
  } else if (row.sourceLevel === 1) {
    rowClassNames.push(tableStyles.trafficGoodsTableRowL1);
    rowClassNames.push('traffic-goods-row-l1');
  } else if (row.sourceLevel === 2) {
    rowClassNames.push(tableStyles.trafficGoodsTableRowL2);
    rowClassNames.push('traffic-goods-row-l2');
  } else {
    rowClassNames.push(tableStyles.trafficGoodsTableRowL3);
    rowClassNames.push('traffic-goods-row-l3');
  }

  return rowClassNames.join(' ');
}

export function DashboardTrafficDetailSection({
  isMobile,
  trafficLoadError,
  trafficGoodsLoadError,
  trafficRows,
  trafficGoodsRows,
  trafficColumns,
  trafficGoodsColumns,
  trafficLoading,
  trafficGoodsLoading,
  expandedTrafficRowKeys,
  expandedTrafficGoodsRowKeys,
  onExpandedTrafficRowKeysChange,
  onExpandedTrafficGoodsRowKeysChange,
}: DashboardTrafficDetailSectionProps) {
  return (
    <div className={sectionStyles.sectionStack}>
      {trafficLoadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>全店流量维度数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{trafficLoadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 店铺流量日表刷新状态。
          </span>
        </section>
      ) : null}
      {trafficGoodsLoadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>商品流量维度数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{trafficGoodsLoadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 商品流量日表刷新状态。
          </span>
        </section>
      ) : null}

      <section className={sectionStyles.panel}>
        <div className={sectionHeaderStyles.head}>
          <div className={sectionHeaderStyles.meta}>
            <h3 className={sectionHeaderStyles.title}>全店流量来源</h3>
          </div>
        </div>

        <Table<DashboardTrafficTreeNode>
          rowKey={(row) => row.key}
          className={tableStyles.table}
          columns={trafficColumns}
          dataSource={trafficRows}
          loading={trafficLoading}
          size="small"
          tableLayout="fixed"
          scroll={{ x: isMobile ? 2266 : 2644 }}
          pagination={
            isMobile
              ? {
                pageSize: 8,
                showSizeChanger: false,
              }
              : false
          }
          expandable={{
            expandedRowKeys: expandedTrafficRowKeys,
            onExpandedRowsChange: (keys) => onExpandedTrafficRowKeysChange([...keys]),
            expandRowByClick: true,
            childrenColumnName: 'children',
            expandIcon: renderDashboardTrafficExpandIcon,
          }}
          locale={{
            emptyText: resolveTrafficEmptyText(trafficLoading, trafficLoadError),
          }}
          rowClassName={getTrafficRowClassName}
        />

      </section>

      <section className={sectionStyles.panel}>
        <div className={sectionHeaderStyles.head}>
          <div className={sectionHeaderStyles.meta}>
            <h3 className={sectionHeaderStyles.title}>商品流量来源</h3>
          </div>
        </div>

        <Table<DashboardTrafficGoodsTreeNode>
          rowKey={(row) => row.key}
          className={`${tableStyles.table} ${tableStyles.goodsTable}`}
          columns={trafficGoodsColumns}
          dataSource={trafficGoodsRows}
          loading={trafficGoodsLoading}
          size="small"
          tableLayout="fixed"
          scroll={{ x: isMobile ? 1600 : 2020, y: isMobile ? undefined : 560 }}
          pagination={
            isMobile
              ? {
                pageSize: 6,
                showSizeChanger: false,
              }
              : false
          }
          expandable={{
            expandedRowKeys: expandedTrafficGoodsRowKeys,
            onExpandedRowsChange: (keys) => onExpandedTrafficGoodsRowKeysChange([...keys]),
            expandRowByClick: true,
            childrenColumnName: 'children',
            expandIcon: renderDashboardTrafficExpandIcon,
          }}
          locale={{
            emptyText: resolveTrafficGoodsEmptyText(trafficGoodsLoading, trafficGoodsLoadError),
          }}
          rowClassName={getTrafficGoodsRowClassName}
        />

      </section>
    </div>
  );
}
