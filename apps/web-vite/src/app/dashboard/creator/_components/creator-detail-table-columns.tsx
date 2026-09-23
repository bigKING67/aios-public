'use client';

import type { ColumnsType } from 'antd/es/table';
import {
  CreatorCooperationStatusBadge,
  type CreatorCooperationStatusRecord,
} from './creator-cooperation-status-badge';
import { CreatorMatchStatusTag } from './creator-match-status-tag';
import {
  formatCreatorCurrencyCell,
  formatCreatorIntegerCell,
  formatCreatorRateCell,
  formatCreatorTextCell,
  type NumericInput,
} from './creator-formatters';
import { renderCreatorStatusDescText } from './creator-table-renderers';
import { compareCreatorNumbers } from './creator-sorters';
import type { CreatorMatchStatusTagMeta } from './creator-ui-utils';

export interface CreatorDetailBaseColumnRecord extends CreatorCooperationStatusRecord {
  cooperation_desc: string | null;
  influencer_name: string;
  influencer_id: string | null;
  owner_name: string | null;
  anchor_level: string | null;
  anchor_desc: string | null;
  platform: string | null;
  main_platform_fans: string | null;
  sales_30d: string | null;
  sales_90d: string | null;
  match_status: string;
  influencer_nickname: string | null;
  shop_name: string | null;
}

export interface CreatorDetailMetricColumnRecord {
  source_etl_loaded_at: string | null;
  watch_to_buyer_rate: NumericInput;
  refund_rate: NumericInput;
}

export interface BuildCreatorDetailBaseColumnsParams {
  statusMap: Readonly<Record<string, CreatorMatchStatusTagMeta>>;
  fallbackStatus: CreatorMatchStatusTagMeta;
  normalizePlatform: (value: string | null) => string;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

export interface BuildCreatorDetailMetricColumnsParams<TRecord extends CreatorDetailMetricColumnRecord> {
  contentLabel: string;
  gmvValue: (record: TRecord) => NumericInput;
  buyerCount: (record: TRecord) => NumericInput;
  orderCount: (record: TRecord) => NumericInput;
  contentCount: (record: TRecord) => NumericInput;
  watchCount: (record: TRecord) => NumericInput;
  userPayAmount: (record: TRecord) => NumericInput;
  refundAmount: (record: TRecord) => NumericInput;
}

export interface BuildCreatorDetailColumnsParams<
  TRecord extends CreatorDetailBaseColumnRecord & CreatorDetailMetricColumnRecord,
> {
  base: BuildCreatorDetailBaseColumnsParams;
  metrics: BuildCreatorDetailMetricColumnsParams<TRecord>;
}

export function buildCreatorDetailBaseColumns<TRecord extends CreatorDetailBaseColumnRecord>({
  statusMap,
  fallbackStatus,
  normalizePlatform,
  resolveStageKey,
  formatDisplay,
}: BuildCreatorDetailBaseColumnsParams): ColumnsType<TRecord> {
  return [
    {
      title: '合作状态',
      dataIndex: 'cooperation_status',
      fixed: 'left',
      width: 132,
      render: (_value: string | null, row) => (
        <CreatorCooperationStatusBadge
          record={row}
          resolveStageKey={resolveStageKey}
          formatDisplay={formatDisplay}
        />
      ),
    },
    {
      title: '达人名称',
      dataIndex: 'influencer_name',
      fixed: 'left',
      width: 170,
    },
    {
      title: '达人ID',
      dataIndex: 'influencer_id',
      fixed: 'left',
      width: 150,
      render: formatCreatorTextCell,
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      fixed: 'left',
      width: 118,
      render: formatCreatorTextCell,
    },
    {
      title: '主播等级',
      dataIndex: 'anchor_level',
      width: 108,
      render: formatCreatorTextCell,
    },
    {
      title: '主播描述',
      dataIndex: 'anchor_desc',
      width: 210,
      render: formatCreatorTextCell,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 112,
      render: (value: string | null) => normalizePlatform(value),
    },
    {
      title: '主平台粉丝数',
      dataIndex: 'main_platform_fans',
      width: 130,
      render: formatCreatorTextCell,
    },
    {
      title: '近30天销售额',
      dataIndex: 'sales_30d',
      width: 132,
      render: formatCreatorTextCell,
    },
    {
      title: '近90天销售额',
      dataIndex: 'sales_90d',
      width: 132,
      render: formatCreatorTextCell,
    },
    {
      title: '合作描述',
      dataIndex: 'cooperation_desc',
      width: 210,
      render: renderCreatorStatusDescText,
    },
    {
      title: '匹配状态',
      dataIndex: 'match_status',
      width: 118,
      render: (value: string) => (
        <CreatorMatchStatusTag value={value} statusMap={statusMap} fallback={fallbackStatus} />
      ),
    },
    {
      title: '主播昵称',
      dataIndex: 'influencer_nickname',
      width: 150,
      render: formatCreatorTextCell,
    },
    {
      title: '店铺名称',
      dataIndex: 'shop_name',
      width: 170,
      render: formatCreatorTextCell,
    },
  ];
}

export function buildCreatorDetailColumns<
  TRecord extends CreatorDetailBaseColumnRecord & CreatorDetailMetricColumnRecord,
>({ base, metrics }: BuildCreatorDetailColumnsParams<TRecord>): ColumnsType<TRecord> {
  return [...buildCreatorDetailBaseColumns<TRecord>(base), ...buildCreatorDetailMetricColumns<TRecord>(metrics)];
}

export function buildCreatorDetailMetricColumns<TRecord extends CreatorDetailMetricColumnRecord>({
  contentLabel,
  gmvValue,
  buyerCount,
  orderCount,
  contentCount,
  watchCount,
  userPayAmount,
  refundAmount,
}: BuildCreatorDetailMetricColumnsParams<TRecord>): ColumnsType<TRecord> {
  return [
    {
      title: `${contentLabel}GMV`,
      dataIndex: `${contentLabel}-gmv`,
      width: 130,
      align: 'right',
      sorter: (left, right) => compareCreatorNumbers(gmvValue(left), gmvValue(right)),
      render: (_value: unknown, row) => formatCreatorCurrencyCell(gmvValue(row)),
    },
    {
      title: `${contentLabel}成交人数`,
      dataIndex: `${contentLabel}-buyer-count`,
      width: 122,
      align: 'right',
      sorter: (left, right) => compareCreatorNumbers(buyerCount(left), buyerCount(right)),
      render: (_value: unknown, row) => formatCreatorIntegerCell(buyerCount(row)),
    },
    {
      title: `${contentLabel}订单量`,
      dataIndex: `${contentLabel}-order-count`,
      width: 118,
      align: 'right',
      sorter: (left, right) => compareCreatorNumbers(orderCount(left), orderCount(right)),
      render: (_value: unknown, row) => formatCreatorIntegerCell(orderCount(row)),
    },
    {
      title: `${contentLabel}场次`,
      dataIndex: `${contentLabel}-content-count`,
      width: 106,
      align: 'right',
      sorter: (left, right) => compareCreatorNumbers(contentCount(left), contentCount(right)),
      render: (_value: unknown, row) => formatCreatorIntegerCell(contentCount(row)),
    },
    {
      title: `${contentLabel}观看人数`,
      dataIndex: `${contentLabel}-watch-count`,
      width: 132,
      align: 'right',
      render: (_value: unknown, row) => formatCreatorIntegerCell(watchCount(row)),
    },
    {
      title: '观看转成交率',
      dataIndex: 'watch_to_buyer_rate',
      width: 130,
      align: 'right',
      render: formatCreatorRateCell,
    },
    {
      title: `${contentLabel}支付金额`,
      dataIndex: `${contentLabel}-user-pay-amount`,
      width: 132,
      align: 'right',
      render: (_value: unknown, row) => formatCreatorCurrencyCell(userPayAmount(row)),
    },
    {
      title: `${contentLabel}退款金额`,
      dataIndex: `${contentLabel}-refund-amount`,
      width: 132,
      align: 'right',
      render: (_value: unknown, row) => formatCreatorCurrencyCell(refundAmount(row)),
    },
    {
      title: '退款率',
      dataIndex: 'refund_rate',
      width: 96,
      align: 'right',
      render: formatCreatorRateCell,
    },
    {
      title: '来源批次时间',
      dataIndex: 'source_etl_loaded_at',
      width: 180,
      render: formatCreatorTextCell,
    },
  ];
}
