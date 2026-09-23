import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  formatCompactWanCurrency,
  formatTableInteger,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import {
  getLiveDetailGsv,
} from './dashboard-live-detail-formatters';
import { formatLiveGoodsAnchorType } from './dashboard-live-goods-formatters';
import { compareNullableNumbers, compareText } from './dashboard-sorters';
import type { DashboardLiveDetailRow } from './dashboard-types';

export interface DashboardLiveDetailTableClassNames {
  liveDetailHeaderCell: string;
  liveDetailBodyCell: string;
  liveDetailFixedRightCell: string;
  liveDetailAnchorCell: string;
  liveDetailAnchorId: string;
  liveDetailAnchorName: string;
  liveDetailTypeTag: string;
  liveDetailInspectButton: string;
}

function mergeLiveDetailClassNames(...classNames: string[]) {
  return classNames.filter(Boolean).join(' ');
}

function buildLiveDetailHeaderCellProps(classNames: DashboardLiveDetailTableClassNames) {
  return { className: classNames.liveDetailHeaderCell };
}

function buildLiveDetailBodyCellProps(classNames: DashboardLiveDetailTableClassNames) {
  return { className: classNames.liveDetailBodyCell };
}

function buildLiveDetailFixedRightHeaderCellProps(classNames: DashboardLiveDetailTableClassNames) {
  return {
    className: mergeLiveDetailClassNames(
      classNames.liveDetailHeaderCell,
      classNames.liveDetailFixedRightCell
    ),
  };
}

function buildLiveDetailFixedRightBodyCellProps(classNames: DashboardLiveDetailTableClassNames) {
  return {
    className: mergeLiveDetailClassNames(
      classNames.liveDetailBodyCell,
      classNames.liveDetailFixedRightCell
    ),
  };
}

export function buildDashboardLiveDetailColumns({
  isMobile,
  classNames,
  onOpenMetrics,
}: {
  isMobile: boolean;
  classNames: DashboardLiveDetailTableClassNames;
  onOpenMetrics: (row: DashboardLiveDetailRow) => void;
}): ColumnsType<DashboardLiveDetailRow> {
  const headerCellProps = () => buildLiveDetailHeaderCellProps(classNames);
  const bodyCellProps = () => buildLiveDetailBodyCellProps(classNames);
  const fixedRightHeaderCellProps = () => buildLiveDetailFixedRightHeaderCellProps(classNames);
  const fixedRightBodyCellProps = () => buildLiveDetailFixedRightBodyCellProps(classNames);

  return [
    {
      title: '直播开始时间',
      dataIndex: 'live_start_time',
      key: 'live_start_time',
      width: isMobile ? 176 : 198,
      fixed: isMobile ? undefined : 'left',
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => {
        const leftTime = dayjs(left.live_start_time).valueOf();
        const rightTime = dayjs(right.live_start_time).valueOf();
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
          return leftTime - rightTime;
        }
        return compareText(left.live_start_time || '', right.live_start_time || '');
      },
      render: (value: string) => {
        const parsed = dayjs(value);
        if (!parsed.isValid()) {
          return value || '--';
        }
        return parsed.format('YYYY-MM-DD HH:mm');
      },
    },
    {
      title: '主播',
      dataIndex: 'anchor_nickname',
      key: 'anchor_nickname',
      width: isMobile ? 176 : 216,
      fixed: isMobile ? undefined : 'left',
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareText(left.anchor_nickname || '', right.anchor_nickname || ''),
      render: (_value: string, row) => (
        <div className={classNames.liveDetailAnchorCell}>
          <strong className={classNames.liveDetailAnchorName} title={row.anchor_nickname}>
            {row.anchor_nickname?.trim() || '--'}
          </strong>
          <span className={classNames.liveDetailAnchorId} title={row.anchor_douyin_id}>
            {`抖音号 ${row.anchor_douyin_id || '--'}`}
          </span>
        </div>
      ),
    },
    {
      title: '主播类型',
      dataIndex: 'anchor_type',
      key: 'anchor_type',
      width: 96,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareText(left.anchor_type || '', right.anchor_type || ''),
      render: (value: string) => <Tag className={classNames.liveDetailTypeTag}>{formatLiveGoodsAnchorType(value)}</Tag>,
    },
    {
      title: 'GMV',
      dataIndex: 'live_gmv',
      key: 'live_gmv',
      width: 124,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.live_gmv, right.live_gmv),
      render: (value: NumericInput) => formatCompactWanCurrency(value),
    },
    {
      title: 'GSV',
      key: 'live_gsv',
      width: 124,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(getLiveDetailGsv(left), getLiveDetailGsv(right)),
      render: (_value, row) => formatCompactWanCurrency(getLiveDetailGsv(row)),
    },
    {
      title: '成交人数',
      dataIndex: 'live_buyer_count',
      key: 'live_buyer_count',
      width: 112,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.live_buyer_count, right.live_buyer_count),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '订单数',
      dataIndex: 'live_order_count',
      key: 'live_order_count',
      width: 104,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.live_order_count, right.live_order_count),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '观看人数',
      dataIndex: 'live_watch_user_count',
      key: 'live_watch_user_count',
      width: 118,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.live_watch_user_count, right.live_watch_user_count),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '看播成交率',
      dataIndex: 'watch_to_pay_rate_user',
      key: 'watch_to_pay_rate_user',
      width: 124,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.watch_to_pay_rate_user, right.watch_to_pay_rate_user),
      render: (value: NumericInput) => formatTableRate(value),
    },
    {
      title: '退款率',
      dataIndex: 'refund_rate',
      key: 'refund_rate',
      width: 104,
      align: 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.refund_rate, right.refund_rate),
      render: (value: NumericInput) => formatTableRate(value),
    },
    {
      title: '详情',
      key: 'detail',
      width: 104,
      fixed: isMobile ? undefined : 'right',
      align: 'center',
      onHeaderCell: fixedRightHeaderCellProps,
      onCell: fixedRightBodyCellProps,
      render: (_value, row) => (
        <Button
          type="link"
          size="small"
          className={classNames.liveDetailInspectButton}
          onClick={() => onOpenMetrics(row)}
        >
          查看更多指标
        </Button>
      ),
    },
  ];
}
