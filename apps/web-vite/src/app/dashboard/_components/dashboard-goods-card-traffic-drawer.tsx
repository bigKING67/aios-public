import { useMemo, type Key, type ReactNode } from 'react';
import { Drawer, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import drawerStyles from './dashboard-goods-card-traffic-drawer.module.css';
import noticeStyles from './dashboard-notice.module.css';
import { renderDashboardTrafficExpandIcon } from './dashboard-traffic-expand-icon';
import tableCellStyles from './dashboard-traffic-table-cells.module.css';
import tableStyles from './dashboard-traffic-table.module.css';
import type { DashboardGoodsCardRow, DashboardGoodsCardTrafficTreeNode } from './dashboard-types';

export type DashboardGoodsCardTrafficDrawerProps = {
  open: boolean;
  isMobile: boolean;
  selectedRow: DashboardGoodsCardRow | null;
  rangeLabel: string;
  asOfDate: string;
  loadError: string | null;
  rows: DashboardGoodsCardTrafficTreeNode[];
  columns: ColumnsType<DashboardGoodsCardTrafficTreeNode>;
  loading: boolean;
  expandedRowKeys: Key[];
  onExpandedRowKeysChange: (keys: Key[]) => void;
  onClose: () => void;
};

function getGoodsCardTrafficRowClassName(row: DashboardGoodsCardTrafficTreeNode): string {
  const rowClassNames = [drawerStyles.goodsCardTrafficRow];

  if (row.sourceLevel <= 0) {
    rowClassNames.push(drawerStyles.goodsCardTrafficRowSummary);
    return rowClassNames.join(' ');
  }
  if (row.sourceLevel === 1) {
    rowClassNames.push(drawerStyles.goodsCardTrafficRowL1);
    return rowClassNames.join(' ');
  }
  if (row.sourceLevel === 2) {
    rowClassNames.push(drawerStyles.goodsCardTrafficRowL2);
    return rowClassNames.join(' ');
  }
  rowClassNames.push(drawerStyles.goodsCardTrafficRowL3);
  return rowClassNames.join(' ');
}

function getGoodsCardTrafficFirstCellClassName(row: DashboardGoodsCardTrafficTreeNode): string {
  const levelClassName =
    row.sourceLevel <= 0
      ? drawerStyles.goodsCardTrafficFirstCellSummary
      : row.sourceLevel === 1
        ? drawerStyles.goodsCardTrafficFirstCellL1
        : row.sourceLevel === 2
          ? drawerStyles.goodsCardTrafficFirstCellL2
          : drawerStyles.goodsCardTrafficFirstCellL3;
  return `${drawerStyles.goodsCardTrafficFirstCell} ${levelClassName}`;
}

function resolveGoodsCardTrafficEmptyText(loading: boolean, loadError: string | null): ReactNode {
  if (loading) {
    return '商品卡流量来源加载中';
  }
  if (loadError) {
    return '商品卡流量来源加载失败，请查看上方提示';
  }
  return <Empty description="当前商品暂无流量来源数据" />;
}

export function DashboardGoodsCardTrafficDrawer({
  open,
  isMobile,
  selectedRow,
  rangeLabel,
  asOfDate,
  loadError,
  rows,
  columns,
  loading,
  expandedRowKeys,
  onExpandedRowKeysChange,
  onClose,
}: DashboardGoodsCardTrafficDrawerProps) {
  const title = `流量来源 · ${selectedRow?.product_title?.trim() || selectedRow?.product_id || '商品卡'}`;
  const tableColumns = useMemo<ColumnsType<DashboardGoodsCardTrafficTreeNode>>(
    () =>
      columns.map((column, index) => {
        if (index !== 0) {
          return column;
        }
        const originalOnCell = 'onCell' in column ? column.onCell : undefined;
        return {
          ...column,
          onCell: (row, rowIndex) => {
            const originalCellProps = originalOnCell?.(row, rowIndex) ?? {};
            return {
              ...originalCellProps,
              className: [originalCellProps.className, getGoodsCardTrafficFirstCellClassName(row)]
                .filter(Boolean)
                .join(' '),
            };
          },
        };
      }),
    [columns]
  );

  return (
    <Drawer
      title={title}
      placement="right"
      width={isMobile ? '100%' : 1100}
      closable={{ placement: 'end' }}
      open={open}
      onClose={onClose}
    >
      <div className={drawerStyles.meta}>
        <span className={drawerStyles.metaPill}>{`商品ID：${selectedRow?.product_id || '--'}`}</span>
        <span className={drawerStyles.metaPill}>{`店铺：${selectedRow?.shop_name || selectedRow?.shop_id || '--'}`}</span>
        <span className={drawerStyles.metaPill}>{`统计窗口：${rangeLabel}`}</span>
        <span className={drawerStyles.metaPill}>{`截止日期：${asOfDate}`}</span>
      </div>
      {loadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>商品卡流量来源数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{loadError}</span>
        </section>
      ) : null}
      <Table<DashboardGoodsCardTrafficTreeNode>
        rowKey={(row) => row.key}
        className={`${tableStyles.table} ${tableCellStyles.goodsCardTypographyScope} ${drawerStyles.table}`}
        columns={tableColumns}
        dataSource={rows}
        loading={loading}
        size="small"
        tableLayout="fixed"
        scroll={{ x: isMobile ? 1760 : 2040, y: isMobile ? undefined : 620 }}
        pagination={false}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => onExpandedRowKeysChange([...keys]),
          expandRowByClick: true,
          childrenColumnName: 'children',
          expandIcon: renderDashboardTrafficExpandIcon,
        }}
        locale={{
          emptyText: resolveGoodsCardTrafficEmptyText(loading, loadError),
        }}
        rowClassName={getGoodsCardTrafficRowClassName}
      />
    </Drawer>
  );
}
