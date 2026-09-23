import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  formatTableInteger,
  formatTableNumber,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { compareNullableNumbers, compareText } from './dashboard-sorters';
import type { DashboardShortVideoDetailRow } from './dashboard-types';

export interface DashboardShortVideoDetailTableClassNames {
  shortVideoHeaderCell: string;
  shortVideoBodyCell: string;
  shortVideoTextHeaderCell: string;
  shortVideoTextBodyCell: string;
}

function buildShortVideoTextHeaderCellProps(classNames: DashboardShortVideoDetailTableClassNames) {
  return {
    className: `${classNames.shortVideoHeaderCell} ${classNames.shortVideoTextHeaderCell}`,
  };
}

function buildShortVideoTextBodyCellProps(classNames: DashboardShortVideoDetailTableClassNames) {
  return {
    className: `${classNames.shortVideoBodyCell} ${classNames.shortVideoTextBodyCell}`,
  };
}

function buildShortVideoHeaderCellProps(classNames: DashboardShortVideoDetailTableClassNames) {
  return { className: classNames.shortVideoHeaderCell };
}

function buildShortVideoBodyCellProps(classNames: DashboardShortVideoDetailTableClassNames) {
  return { className: classNames.shortVideoBodyCell };
}

export function buildDashboardShortVideoDetailColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardShortVideoDetailTableClassNames;
}): ColumnsType<DashboardShortVideoDetailRow> {
  const headerCellProps = () => buildShortVideoHeaderCellProps(classNames);
  const bodyCellProps = () => buildShortVideoBodyCellProps(classNames);
  const textHeaderCellProps = () => buildShortVideoTextHeaderCellProps(classNames);
  const textBodyCellProps = () => buildShortVideoTextBodyCellProps(classNames);

  return [
    {
      title: '日期',
      dataIndex: 'stat_date',
      key: 'stat_date',
      width: isMobile ? 112 : 126,
      fixed: isMobile ? undefined : 'left',
      ellipsis: true,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.stat_date || '', right.stat_date || ''),
      render: (value: string | undefined) => {
        if (!value) return '--';
        const parsed = dayjs(value);
        return parsed.isValid() ? parsed.format('YYYY-MM-DD') : value;
      },
    },
    {
      title: '达人昵称',
      dataIndex: 'author_nickname',
      key: 'author_nickname',
      width: isMobile ? 152 : 172,
      fixed: isMobile ? undefined : 'left',
      ellipsis: true,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.author_nickname || '', right.author_nickname || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '抖音号',
      dataIndex: 'author_douyin_id',
      key: 'author_douyin_id',
      width: isMobile ? 136 : 152,
      fixed: isMobile ? undefined : 'left',
      ellipsis: true,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.author_douyin_id || '', right.author_douyin_id || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '达人类型',
      dataIndex: 'account_type',
      key: 'account_type',
      width: isMobile ? 108 : 124,
      fixed: isMobile ? undefined : 'left',
      ellipsis: true,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.account_type || '', right.account_type || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '视频标题',
      dataIndex: 'video_title',
      key: 'video_title',
      width: isMobile ? 420 : 520,
      ellipsis: true,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.video_title || '', right.video_title || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '发布时间',
      dataIndex: 'publish_time',
      key: 'publish_time',
      width: isMobile ? 152 : 172,
      ellipsis: true,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => {
        const leftTime = dayjs(left.publish_time || '').valueOf();
        const rightTime = dayjs(right.publish_time || '').valueOf();
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
          return leftTime - rightTime;
        }
        return compareText(left.publish_time || '', right.publish_time || '');
      },
      render: (value: string | null | undefined) => {
        if (!value) return '--';
        const parsed = dayjs(value);
        if (!parsed.isValid()) {
          return value || '--';
        }
        return parsed.format('YYYY-MM-DD HH:mm');
      },
    },
    {
      title: '视频ID',
      dataIndex: 'video_id',
      key: 'video_id',
      width: isMobile ? 176 : 198,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.video_id || '', right.video_id || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '是否投放',
      dataIndex: 'is_promoted',
      key: 'is_promoted',
      width: isMobile ? 112 : 126,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.is_promoted || '', right.is_promoted || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '播放链接',
      dataIndex: 'play_url',
      key: 'play_url',
      width: isMobile ? 120 : 136,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.play_url || '', right.play_url || ''),
      render: (value: string | null | undefined) => {
        const normalized = value?.trim() || '';
        if (!normalized) {
          return '--';
        }
        return (
          <a href={normalized} target="_blank" rel="noreferrer">
            打开链接
          </a>
        );
      },
    },
    {
      title: '带货商品ID',
      dataIndex: 'product_id',
      key: 'product_id',
      width: isMobile ? 136 : 152,
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) => compareText(left.product_id || '', right.product_id || ''),
      render: (value: string) => value?.trim() || '--',
    },
    {
      title: '视频观看次数',
      dataIndex: 'video_view_count',
      key: 'video_view_count',
      width: isMobile ? 136 : 158,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.video_view_count, right.video_view_count),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '用户支付金额(元)',
      dataIndex: 'user_pay_amount',
      key: 'user_pay_amount',
      width: isMobile ? 160 : 182,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.user_pay_amount, right.user_pay_amount),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '退款金额(元)',
      dataIndex: 'refund_amount',
      key: 'refund_amount',
      width: isMobile ? 142 : 160,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.refund_amount, right.refund_amount),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '引流直播间用户支付金额(元)',
      dataIndex: 'live_room_pay_amount',
      key: 'live_room_pay_amount',
      width: isMobile ? 240 : 272,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.live_room_pay_amount, right.live_room_pay_amount),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '看后搜用户支付金额(元)',
      dataIndex: 'search_after_view_pay_amount',
      key: 'search_after_view_pay_amount',
      width: isMobile ? 220 : 248,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) =>
        compareNullableNumbers(left.search_after_view_pay_amount, right.search_after_view_pay_amount),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '引流店铺页用户支付金额(元)',
      dataIndex: 'shop_page_pay_amount',
      key: 'shop_page_pay_amount',
      width: isMobile ? 232 : 262,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.shop_page_pay_amount, right.shop_page_pay_amount),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
  ];
}
