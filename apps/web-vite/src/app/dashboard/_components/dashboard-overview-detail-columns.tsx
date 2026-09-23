import type { ColumnsType } from 'antd/es/table';
import {
  formatTableInteger,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import {
  getNowcastQualityStatusLabel,
  getPredictionConfidenceLabel,
} from './dashboard-overview-labels';
import { compareNullableNumbers, compareText } from './dashboard-sorters';
import type { DashboardOverviewDetailRow } from './dashboard-types';

export interface DashboardOverviewDetailTableClassNames {
  pendingMetricCell: string;
  pendingMetricHeader: string;
}

function buildPendingMetricHeaderCellProps(classNames: DashboardOverviewDetailTableClassNames) {
  return { className: classNames.pendingMetricHeader };
}

export function buildDashboardOverviewDetailColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardOverviewDetailTableClassNames;
}): ColumnsType<DashboardOverviewDetailRow> {
  const pendingMetricHeaderCellProps = () => buildPendingMetricHeaderCellProps(classNames);

  return [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      fixed: isMobile ? undefined : 'left',
      align: 'center',
      sorter: (left, right) => compareText(left.date, right.date),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 120,
      align: 'center',
      sorter: (left, right) => compareText(left.platform, right.platform),
    },
    {
      title: 'GMV',
      dataIndex: 'gmv',
      key: 'gmv',
      width: 120,
      align: 'right',
      sorter: (left, right) => compareNullableNumbers(left.gmv, right.gmv),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '用户支付金额',
      dataIndex: 'user_pay_amount',
      key: 'user_pay_amount',
      width: 142,
      align: 'right',
      sorter: (left, right) => compareNullableNumbers(left.user_pay_amount, right.user_pay_amount),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: 'GSV（支付时间）',
      dataIndex: 'gsv_pay_time_current',
      key: 'gsv_pay_time_current',
      width: 172,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.gsv_pay_time_current, right.gsv_pay_time_current),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: 'GSV（退款时间）',
      dataIndex: 'gsv_refund_time',
      key: 'gsv_refund_time',
      width: 142,
      align: 'right',
      sorter: (left, right) => compareNullableNumbers(left.gsv_refund_time, right.gsv_refund_time),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '订单量',
      dataIndex: 'order_count',
      key: 'order_count',
      width: 110,
      align: 'right',
      sorter: (left, right) => compareNullableNumbers(left.order_count, right.order_count),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '成交人数',
      dataIndex: 'buyer_count',
      key: 'buyer_count',
      width: 120,
      align: 'right',
      sorter: (left, right) => compareNullableNumbers(left.buyer_count, right.buyer_count),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '客单价',
      dataIndex: 'arpu',
      key: 'arpu',
      width: 110,
      align: 'right',
      sorter: (left, right) => compareNullableNumbers(left.arpu, right.arpu),
      render: (value: NumericInput) => formatTableInteger(value),
    },
    {
      title: '当前退款金额（支付时间）',
      dataIndex: 'refund_amount_pay_time_current',
      key: 'refund_amount_pay_time_current',
      width: 188,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.refund_amount_pay_time_current, right.refund_amount_pay_time_current),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '预测全部退款金额（支付时间）',
      dataIndex: 'refund_amount_pay_time_predicted',
      key: 'refund_amount_pay_time_predicted',
      width: 188,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.refund_amount_pay_time_predicted, right.refund_amount_pay_time_predicted),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '退款金额（退款时间）',
      dataIndex: 'refund_amount_refund_time',
      key: 'refund_amount_refund_time',
      width: 166,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.refund_amount_refund_time, right.refund_amount_refund_time),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '退款率（支付时间）',
      dataIndex: 'refund_rate_pay_time_current',
      key: 'refund_rate_pay_time_current',
      width: 166,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.refund_rate_pay_time_current, right.refund_rate_pay_time_current),
      render: (value: NumericInput) => formatTableRate(value),
    },
    {
      title: '预测退款率（支付时间）',
      dataIndex: 'refund_rate_pay_time_predicted',
      key: 'refund_rate_pay_time_predicted',
      width: 166,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.refund_rate_pay_time_predicted, right.refund_rate_pay_time_predicted),
      render: (value: NumericInput) => formatTableRate(value),
    },
    {
      title: '退款率（退款时间）',
      dataIndex: 'refund_rate_refund_time',
      key: 'refund_rate_refund_time',
      width: 144,
      align: 'right',
      sorter: (left, right) =>
        compareNullableNumbers(left.refund_rate_refund_time, right.refund_rate_refund_time),
      render: (value: NumericInput) => formatTableRate(value),
    },
    {
      title: '消耗',
      dataIndex: 'cost',
      key: 'cost',
      width: 120,
      align: 'right',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareNullableNumbers(left.cost, right.cost),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: '付费GMV',
      dataIndex: 'gmv_from_cost',
      key: 'gmv_from_cost',
      width: 120,
      align: 'right',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareNullableNumbers(left.gmv_from_cost, right.gmv_from_cost),
      render: (value: NumericInput) => formatTableNumber(value, 2),
    },
    {
      title: 'ROI',
      dataIndex: 'roi',
      key: 'roi',
      width: 100,
      align: 'right',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareNullableNumbers(left.roi, right.roi),
      render: (value: NumericInput) => formatTableNumber(value, 4),
    },
    {
      title: '付费ROI',
      dataIndex: 'roi_from_cost',
      key: 'roi_from_cost',
      width: 100,
      align: 'right',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareNullableNumbers(left.roi_from_cost, right.roi_from_cost),
      render: (value: NumericInput) => formatTableNumber(value, 4),
    },
    {
      title: '预测完备率',
      dataIndex: 'completeness_ratio',
      key: 'completeness_ratio',
      width: 126,
      align: 'right',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareNullableNumbers(left.completeness_ratio, right.completeness_ratio),
      render: (value: NumericInput) => formatTableRate(value),
    },
    {
      title: '预测置信度',
      dataIndex: 'prediction_confidence',
      key: 'prediction_confidence',
      width: 124,
      align: 'center',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareText(left.prediction_confidence || '', right.prediction_confidence || ''),
      render: (value: string | null) => getPredictionConfidenceLabel(value),
    },
    {
      title: '预测质量状态',
      dataIndex: 'quality_status',
      key: 'quality_status',
      width: 136,
      align: 'center',
      className: classNames.pendingMetricCell,
      onHeaderCell: pendingMetricHeaderCellProps,
      sorter: (left, right) => compareText(left.quality_status || '', right.quality_status || ''),
      render: (value: string | null) => getNowcastQualityStatusLabel(value),
    },
  ];
}
