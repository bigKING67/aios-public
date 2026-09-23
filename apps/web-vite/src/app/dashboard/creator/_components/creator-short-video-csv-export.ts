'use client';

import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DateRange } from './creator-date-range';
import { type CreatorCsvExportConfig, useCreatorCsvExport } from './creator-csv-export';
import {
  calculateCreatorGsv,
  formatCsvNumber,
  formatCsvRate,
} from './creator-formatters';
import { normalizeCreatorCooperationPlatform as normalizeCooperationPlatform } from './creator-cooperation-normalizers';
import {
  resolveShortVideoAdCost,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoQianchuanGsv,
  resolveShortVideoQianchuanRoi,
} from './creator-short-video-dashboard-model';
import { formatShortVideoAssetVideoTypeValues } from './creator-short-video-array-values';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';

type UseCreatorShortVideoCsvExportParams = {
  rows: readonly CreatorShortVideoDetailRow[];
  summaryRows?: readonly CreatorShortVideoDetailRow[];
  isAuthenticated: boolean;
  currentRange: DateRange;
  messageApi: MessageInstance;
};

const TRANSACTION_DATE_HEADER_INDEX = 1;

const SHORT_VIDEO_TRANSACTION_DETAIL_CSV_HEADERS = [
  '行粒度',
  '成交日期',
  '店铺名称',
  '店铺ID',
  '账号类型',
  '账号类型集合',
  '罗盘视频标题',
  '视频ID',
  '是否投流',
  '播放URL',
  '发布日期',
  '达人昵称',
  '达人ID（抖音号）',
  '商品ID',
  '罗盘源ID',
  '罗盘观看数',
  '罗盘成交金额',
  '罗盘退款金额（退款时间）',
  '罗盘引流直播间成交',
  '罗盘看后搜成交',
  '罗盘引流店铺页成交',
  '罗盘创建时间',
  '罗盘更新时间',
  '罗盘源更新时间',
  '千川素材ID',
  '千川素材Key',
  '千川素材数',
  '千川素材视频名',
  '千川素材最早创建',
  '千川素材最晚创建',
  '千川展现量',
  '千川点击量',
  '千川点击率',
  '千川转化率',
  '千川消耗',
  '千川成交订单',
  '千川GMV',
  '千川支付ROI',
  '千川成交成本',
  '千川用户支付',
  '千川CPM',
  '千川CPC',
  '千川智能优惠券金额',
  '千川平台补贴金额',
  '千川净GMV ROI',
  '千川净GMV',
  '千川净订单',
  '千川净成交成本',
  '千川净GMV结算率',
  '千川1小时退款率',
  '千川来源文件',
  '千川源ID',
  '千川入库时间',
  '千川源更新时间',
  '素材库资产ID',
  '素材库平台身份ID',
  '素材库广告素材关系ID',
  '素材库产品',
  '素材库负责人',
  '素材库视频类型',
  '素材库场景类型',
  '素材库大场景',
  '素材库细分场景',
  '维护记录ID',
  '维护粒度',
  '维护平台',
  '维护抖音号',
  '维护达人名称快照',
  '维护视频ID',
  '维护商品ID',
  '人工粉丝量',
  '粉丝量更新时间',
  '达人类型',
  '维护MCN',
  '达人费用金额',
  '达人费用类型',
  '达人费用备注',
  '维护创建人ID',
  '维护创建人',
  '维护更新人ID',
  '维护更新人',
  '维护创建时间',
  '维护更新时间',
  '维护删除标记',
  '映射状态',
  '千川匹配状态',
  '千川已归因',
  '归因排序',
  '源最大更新时间',
  '明细创建时间',
  '明细更新时间',
  '页面平台',
  '页面达人Key',
  '页面达人ID',
  '页面达人名称',
  '页面达人昵称',
  '页面挂车状态',
  '页面挂车状态分组',
  '页面账号类型描述',
  '页面数据来源',
  '页面源加载时间',
  '页面短视频数',
  '页面短视频观看数',
  '页面挂车GMV',
  '页面退款金额（退款时间）',
  '页面挂车GSV（挂车GMV-退款金额（退款时间））',
  '页面千川GMV',
  '页面千川GSV',
  '页面千川消耗',
  '页面千川ROI',
  '页面观看成交率',
  '页面退款率',
  '页面匹配状态',
  '页面是否匹配',
  '页面是否有短视频数据',
] as const;

const SHORT_VIDEO_CURRENT_SUMMARY_CSV_HEADERS = [
  '统计开始日期',
  '统计结束日期',
  ...SHORT_VIDEO_TRANSACTION_DETAIL_CSV_HEADERS.filter((_, index) => index !== TRANSACTION_DATE_HEADER_INDEX),
] as const;

function formatCsvArray(value: unknown): string {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .join(' / ');
}

function formatCsvAssetVideoTypes(value: unknown): string {
  return formatShortVideoAssetVideoTypeValues(value).join(' / ');
}

function formatCsvDateTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '').slice(0, 19);
}

function formatCsvBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  return value ? '是' : '否';
}

function buildShortVideoTransactionDetailCsvCells(
  row: CreatorShortVideoDetailRow
): readonly (string | number | null | undefined)[] {
  return [
    row.detail_grain,
    row.stat_date,
    row.shop_name || '',
    row.shop_id || '',
    row.account_type || '',
    formatCsvArray(row.account_types),
    row.video_title || '',
    row.video_id || '',
    row.is_promoted || '',
    row.play_url || '',
    formatCsvDateTime(row.publish_time),
    row.author_nickname || '',
    row.author_douyin_id || '',
    row.product_id || '',
    formatCsvArray(row.trade_source_ids),
    formatCsvNumber(row.video_view_count),
    formatCsvNumber(row.user_pay_amount, 2),
    formatCsvNumber(row.refund_amount, 2),
    formatCsvNumber(row.live_room_pay_amount, 2),
    formatCsvNumber(row.search_after_view_pay_amount, 2),
    formatCsvNumber(row.shop_page_pay_amount, 2),
    formatCsvDateTime(row.trade_created_at),
    formatCsvDateTime(row.trade_updated_at),
    formatCsvDateTime(row.trade_source_updated_at),
    formatCsvArray(row.qianchuan_material_ids),
    row.qianchuan_material_key || '',
    formatCsvNumber(row.qianchuan_material_count),
    formatCsvArray(row.qianchuan_material_video_names),
    formatCsvDateTime(row.qianchuan_material_created_at_min),
    formatCsvDateTime(row.qianchuan_material_created_at_max),
    formatCsvNumber(row.qianchuan_overall_impression_count),
    formatCsvNumber(row.qianchuan_overall_click_count),
    formatCsvRate(row.qianchuan_overall_click_rate),
    formatCsvRate(row.qianchuan_overall_conversion_rate),
    formatCsvNumber(row.qianchuan_overall_cost, 2),
    formatCsvNumber(row.qianchuan_overall_order_count),
    formatCsvNumber(row.qianchuan_overall_gmv, 2),
    formatCsvNumber(row.qianchuan_overall_pay_roi, 2),
    formatCsvNumber(row.qianchuan_overall_order_cost, 2),
    formatCsvNumber(row.qianchuan_user_pay_amount, 2),
    formatCsvNumber(row.qianchuan_overall_cpm, 2),
    formatCsvNumber(row.qianchuan_overall_cpc, 2),
    formatCsvNumber(row.qianchuan_smart_coupon_amount, 2),
    formatCsvNumber(row.qianchuan_platform_subsidy_amount, 2),
    formatCsvNumber(row.qianchuan_net_gmv_roi, 2),
    formatCsvNumber(row.qianchuan_net_gmv, 2),
    formatCsvNumber(row.qianchuan_net_order_count),
    formatCsvNumber(row.qianchuan_net_order_cost, 2),
    formatCsvRate(row.qianchuan_net_gmv_settlement_rate),
    formatCsvRate(row.qianchuan_refund_rate_1h),
    formatCsvArray(row.qianchuan_source_file_names),
    formatCsvArray(row.qianchuan_source_ids),
    formatCsvDateTime(row.qianchuan_ingest_time),
    formatCsvDateTime(row.qianchuan_source_updated_at),
    formatCsvArray(row.asset_ids),
    formatCsvArray(row.platform_video_ids),
    formatCsvArray(row.ad_material_ids),
    formatCsvArray(row.asset_product_names),
    formatCsvArray(row.asset_owner_names),
    formatCsvAssetVideoTypes(row.asset_video_types),
    formatCsvArray(row.asset_content_scenes),
    formatCsvArray(row.asset_content_scene_groups),
    formatCsvArray(row.asset_content_scene_subtypes),
    formatCsvNumber(row.manual_attr_id),
    row.manual_scope_type || '',
    row.manual_platform || '',
    row.manual_author_douyin_id || '',
    row.manual_author_name_snapshot || '',
    row.manual_video_id || '',
    row.manual_product_id || '',
    formatCsvNumber(row.manual_fans_count),
    formatCsvDateTime(row.manual_fans_count_updated_at),
    row.manual_creator_type || '',
    row.manual_mcn || '',
    formatCsvNumber(row.manual_creator_fee_amount, 2),
    row.manual_creator_fee_type || '',
    row.manual_creator_fee_note || '',
    row.manual_created_by_user_id || '',
    row.manual_created_by_name || '',
    row.manual_updated_by_user_id || '',
    row.manual_updated_by_name || '',
    formatCsvDateTime(row.manual_created_at),
    formatCsvDateTime(row.manual_updated_at),
    formatCsvBoolean(row.manual_is_deleted),
    row.mapping_status,
    row.qianchuan_match_status,
    formatCsvBoolean(row.qianchuan_metric_attributed),
    formatCsvNumber(row.qianchuan_attribution_rank),
    formatCsvDateTime(row.source_max_updated_at),
    formatCsvDateTime(row.created_at),
    formatCsvDateTime(row.updated_at),
    normalizeCooperationPlatform(row.platform),
    row.influencer_key || '',
    row.influencer_id || '',
    row.influencer_name,
    row.influencer_nickname || '',
    row.cooperation_status || '',
    row.cooperation_status_norm,
    row.cooperation_desc || '',
    row.source_file_name,
    formatCsvDateTime(row.source_etl_loaded_at),
    formatCsvNumber(row.shortvideo_count),
    formatCsvNumber(row.shortvideo_view_count),
    formatCsvNumber(row.shortvideo_gmv, 2),
    formatCsvNumber(row.shortvideo_refund_amount, 2),
    formatCsvNumber(calculateCreatorGsv(row.user_pay_amount, row.refund_amount), 2),
    formatCsvNumber(resolveShortVideoQianchuanGmv(row), 2),
    formatCsvNumber(resolveShortVideoQianchuanGsv(row), 2),
    formatCsvNumber(resolveShortVideoAdCost(row), 2),
    formatCsvNumber(resolveShortVideoQianchuanRoi(row), 2),
    formatCsvRate(row.watch_to_buyer_rate),
    formatCsvRate(row.refund_rate),
    row.match_status,
    formatCsvBoolean(row.is_matched),
    formatCsvBoolean(row.has_shortvideo_data),
  ];
}

function buildShortVideoCurrentSummaryCsvCells(
  row: CreatorShortVideoDetailRow,
  currentRange: DateRange
): readonly (string | number | null | undefined)[] {
  const transactionCells = buildShortVideoTransactionDetailCsvCells(row);

  return [
    currentRange.start.format('YYYY-MM-DD'),
    currentRange.end.format('YYYY-MM-DD'),
    ...transactionCells.filter((_, index) => index !== TRANSACTION_DATE_HEADER_INDEX),
  ];
}

const SHORT_VIDEO_TRANSACTION_DETAIL_CSV_CONFIG: CreatorCsvExportConfig<CreatorShortVideoDetailRow> = {
  headers: SHORT_VIDEO_TRANSACTION_DETAIL_CSV_HEADERS,
  fileNamePrefix: 'creator-shortvideo-transaction-detail',
  buildCells: buildShortVideoTransactionDetailCsvCells,
};

export function useCreatorShortVideoCsvExport({
  rows,
  summaryRows = rows,
  isAuthenticated,
  currentRange,
  messageApi,
}: UseCreatorShortVideoCsvExportParams) {
  const getTransactionDetailCsvExportConfig = useCallback(
    () => SHORT_VIDEO_TRANSACTION_DETAIL_CSV_CONFIG,
    []
  );
  const getCurrentSummaryCsvExportConfig = useCallback(
    (): CreatorCsvExportConfig<CreatorShortVideoDetailRow> => ({
      headers: SHORT_VIDEO_CURRENT_SUMMARY_CSV_HEADERS,
      fileNamePrefix: 'creator-shortvideo-current-summary',
      buildCells: (row) => buildShortVideoCurrentSummaryCsvCells(row, currentRange),
    }),
    [currentRange]
  );
  const transactionDetailSuccessMessage = useCallback(
    (rowCount: number, fileName: string) => `已导出 ${rowCount} 条成交明细到 ${fileName}`,
    []
  );
  const currentSummarySuccessMessage = useCallback(
    (rowCount: number, fileName: string) => `已导出 ${rowCount} 条当前汇总到 ${fileName}`,
    []
  );

  const transactionDetailExport = useCreatorCsvExport<CreatorShortVideoDetailRow>({
    rows,
    isAuthenticated,
    currentRange,
    messageApi,
    getConfig: getTransactionDetailCsvExportConfig,
    emptyMessage: '当前筛选条件下没有可导出的成交明细。',
    successMessage: transactionDetailSuccessMessage,
  });
  const currentSummaryExport = useCreatorCsvExport<CreatorShortVideoDetailRow>({
    rows: summaryRows,
    isAuthenticated,
    currentRange,
    messageApi,
    getConfig: getCurrentSummaryCsvExportConfig,
    emptyMessage: '当前筛选条件下没有可导出的汇总数据。',
    successMessage: currentSummarySuccessMessage,
  });

  return {
    isExporting: transactionDetailExport.isExporting || currentSummaryExport.isExporting,
    handleExportCsv: transactionDetailExport.handleExportCsv,
    handleExportTransactionDetailCsv: transactionDetailExport.handleExportCsv,
    handleExportCurrentSummaryCsv: currentSummaryExport.handleExportCsv,
  };
}
