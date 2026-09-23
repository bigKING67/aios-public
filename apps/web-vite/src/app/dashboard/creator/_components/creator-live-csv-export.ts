'use client';

import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DateRange } from './creator-date-range';
import { useCreatorCsvExport } from './creator-csv-export';
import { calculateCreatorGsv, formatCsvNumber, formatCsvRate } from './creator-formatters';
import { buildCreatorCsvBaseCells } from './creator-helpers';
import { normalizeCreatorCooperationPlatform as normalizeCooperationPlatform } from './creator-cooperation-normalizers';
import type { CreatorLiveDetailRow } from './creator-live-dashboard-types';

type UseCreatorLiveCsvExportParams = {
  rows: readonly CreatorLiveDetailRow[];
  isAuthenticated: boolean;
  currentRange: DateRange;
  messageApi: MessageInstance;
};

export function useCreatorLiveCsvExport({
  rows,
  isAuthenticated,
  currentRange,
  messageApi,
}: UseCreatorLiveCsvExportParams) {
  const getCsvExportConfig = useCallback(
    () => ({
      headers: [
        '合作状态',
        '达人名称',
        '达人ID',
        '主播描述',
        '平台',
        '主平台粉丝数',
        '近30天销售额',
        '近90天销售额',
        '合作描述',
        '匹配状态',
        '负责人',
        '主播等级',
        '主播昵称',
        '店铺ID',
        '店铺名称',
        '直播场次',
        '直播时长(分钟)',
        '直播观看人数',
        '直播曝光人数',
        '直播商品点击人数',
        '直播订单量',
        '直播成交人数',
        '直播GMV',
        '直播GSV',
        '直播支付金额',
        '直播退款金额',
        '直播投流成本',
        '观看转成交率',
        '退款率',
        '来源文件',
        '来源ETL时间',
      ],
      fileNamePrefix: 'creator-live-details',
      buildCells: (row: CreatorLiveDetailRow) => [
        ...buildCreatorCsvBaseCells(row, normalizeCooperationPlatform),
        formatCsvNumber(row.live_session_count),
        formatCsvNumber(row.live_duration_minutes),
        formatCsvNumber(row.live_watch_user_count),
        formatCsvNumber(row.live_exposure_user_count),
        formatCsvNumber(row.live_product_click_user),
        formatCsvNumber(row.live_order_count),
        formatCsvNumber(row.live_buyer_count),
        formatCsvNumber(row.live_gmv, 2),
        formatCsvNumber(calculateCreatorGsv(row.live_gmv, row.live_refund_amount), 2),
        formatCsvNumber(row.live_user_pay_amount, 2),
        formatCsvNumber(row.live_refund_amount, 2),
        formatCsvNumber(row.live_ad_cost, 2),
        formatCsvRate(row.watch_to_buyer_rate),
        formatCsvRate(row.refund_rate),
        row.source_file_name,
        row.source_etl_loaded_at || '',
      ],
    }),
    []
  );

  return useCreatorCsvExport<CreatorLiveDetailRow>({
    rows,
    isAuthenticated,
    currentRange,
    messageApi,
    getConfig: getCsvExportConfig,
  });
}
