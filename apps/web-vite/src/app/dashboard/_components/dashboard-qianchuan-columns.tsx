import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';

import {
  formatTableInteger,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { compareNullableNumbers, compareText } from './dashboard-sorters';
import type {
  DashboardQianchuanCommonRow,
  DashboardQianchuanLiveRoomScreenRow,
  DashboardQianchuanLiveVideoRow,
  DashboardQianchuanMaterialTypeMixRow,
} from './dashboard-qianchuan-types';

export interface DashboardQianchuanTableClassNames {
  tableHeaderCell?: string;
  tableBodyCell?: string;
  tableTextHeaderCell?: string;
  tableTextBodyCell?: string;
  tableTextBodyCellLeft?: string;
  tableIdentityCell?: string;
  tableIdentityCellLeft?: string;
  tableIdentityName?: string;
  tableVideoName?: string;
  tableVideoLink?: string;
  tableIdentityMeta?: string;
  tableTypeTag?: string;
  qianchuanHeaderCell?: string;
  qianchuanBodyCell?: string;
}

type QianchuanColumnFormat = 'currency' | 'duration' | 'integer' | 'number' | 'rate' | 'text';

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  live_room_screen: '直播间画面',
  live_video: '视频',
};
const LEGACY_MATERIAL_SUFFIX = '素材';
const LEGACY_LIVE_VIDEO_LABEL_PATTERN = new RegExp(
  `${MATERIAL_TYPE_LABELS.live_video}${LEGACY_MATERIAL_SUFFIX}`,
  'gu'
);

function mergeClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function asRecord(row: object | null | undefined): Record<string, unknown> {
  return (row || {}) as Record<string, unknown>;
}

function pickValue(row: object | null | undefined, keys: string[]): unknown {
  const record = asRecord(row);
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

function toNullableText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function readText(row: object | null | undefined, keys: string[]): string {
  return toNullableText(pickValue(row, keys));
}

function buildContentAssetDetailPath(assetId: string): string {
  return `${ROUTE_PATHS.marketingContentAssets}/${encodeURIComponent(assetId)}`;
}

function readNumeric(row: object | null | undefined, keys: string[]): NumericInput {
  const value = pickValue(row, keys);
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return null;
}

function formatText(value: unknown): string {
  return toNullableText(value) || '--';
}

function formatMaterialType(value: unknown): string {
  const key = toNullableText(value);
  return MATERIAL_TYPE_LABELS[key] || key || '--';
}

function normalizeLiveVideoDisplayText(value: string): string {
  return value.replace(LEGACY_LIVE_VIDEO_LABEL_PATTERN, MATERIAL_TYPE_LABELS.live_video);
}

function resolveMaterialTypeLabel(row: DashboardQianchuanMaterialTypeMixRow): string {
  const materialType = readText(row, ['materialType', 'material_type']);
  const materialTypeLabel = readText(row, ['materialTypeLabel', 'material_type_label']);

  if (MATERIAL_TYPE_LABELS[materialType]) {
    return MATERIAL_TYPE_LABELS[materialType];
  }
  const normalizedMaterialTypeLabel = materialTypeLabel.replace(/\s+/g, '');
  if (
    normalizedMaterialTypeLabel.includes(MATERIAL_TYPE_LABELS.live_video) &&
    normalizedMaterialTypeLabel.endsWith(LEGACY_MATERIAL_SUFFIX)
  ) {
    return MATERIAL_TYPE_LABELS.live_video;
  }
  return materialTypeLabel || formatMaterialType(materialType);
}

function formatMaterialTypeMeta(value: unknown): string {
  const key = toNullableText(value);
  if (key === 'live_video') {
    return '视频投放';
  }
  if (key === 'live_room_screen') {
    return '直播间画面投放';
  }
  return key || '--';
}

function formatDateTime(value: unknown): string {
  const normalized = toNullableText(value);
  if (!normalized) {
    return '--';
  }

  const parsed = dayjs(normalized);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : normalized;
}

function formatMetricValue(value: NumericInput, format: QianchuanColumnFormat, digits = 2): string {
  if (format === 'integer') {
    return formatTableInteger(value);
  }
  if (format === 'rate') {
    return formatTableRate(value);
  }
  if (format === 'duration') {
    const formatted = formatTableNumber(value, 1);
    return formatted === '--' ? '--' : `${formatted} 秒`;
  }
  if (format === 'text') {
    return formatText(value);
  }
  return formatTableNumber(value, digits);
}

function getHeaderClassName(classNames: DashboardQianchuanTableClassNames): string {
  return classNames.qianchuanHeaderCell || classNames.tableHeaderCell || '';
}

function getBodyClassName(classNames: DashboardQianchuanTableClassNames): string {
  return classNames.qianchuanBodyCell || classNames.tableBodyCell || '';
}

function buildHeaderCellProps(classNames: DashboardQianchuanTableClassNames) {
  return { className: getHeaderClassName(classNames) };
}

function buildBodyCellProps(classNames: DashboardQianchuanTableClassNames) {
  return { className: getBodyClassName(classNames) };
}

function buildTextHeaderCellProps(classNames: DashboardQianchuanTableClassNames) {
  return {
    className: mergeClassNames(getHeaderClassName(classNames), classNames.tableTextHeaderCell),
  };
}

function buildTextBodyCellProps(classNames: DashboardQianchuanTableClassNames) {
  return {
    className: mergeClassNames(getBodyClassName(classNames), classNames.tableTextBodyCell),
  };
}

function buildMetricColumn<Row extends object>({
  key,
  keys,
  title,
  width,
  format,
  digits,
  isMobile,
  classNames,
}: {
  key: string;
  keys: string[];
  title: string;
  width: number;
  format: QianchuanColumnFormat;
  digits?: number;
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
}): ColumnsType<Row>[number] {
  const headerCellProps = () => buildHeaderCellProps(classNames);
  const bodyCellProps = () => buildBodyCellProps(classNames);

  return {
    title,
    key,
    width: isMobile ? Math.min(Math.max(width - 18, 104), 220) : width,
    align: isMobile ? 'left' : 'right',
    onHeaderCell: headerCellProps,
    onCell: bodyCellProps,
    sorter: (left, right) => compareNullableNumbers(readNumeric(left, keys), readNumeric(right, keys)),
    render: (_value, row) => formatMetricValue(readNumeric(row, keys), format, digits),
  };
}

function buildTextColumn<Row extends object>({
  key,
  keys,
  title,
  width,
  isMobile,
  classNames,
  fixed,
}: {
  key: string;
  keys: string[];
  title: string;
  width: number;
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
  fixed?: 'left';
}): ColumnsType<Row>[number] {
  const headerCellProps = () => buildTextHeaderCellProps(classNames);
  const bodyCellProps = () => buildTextBodyCellProps(classNames);

  return {
    title,
    key,
    width: isMobile ? Math.min(Math.max(width - 20, 112), 260) : width,
    fixed: isMobile ? undefined : fixed,
    ellipsis: true,
    align: 'center',
    onHeaderCell: headerCellProps,
    onCell: bodyCellProps,
    sorter: (left, right) => compareText(readText(left, keys), readText(right, keys)),
    render: (_value, row) => formatText(readText(row, keys)),
  };
}

function buildDateTimeColumn<Row extends object>({
  key,
  keys,
  title,
  width,
  isMobile,
  classNames,
}: {
  key: string;
  keys: string[];
  title: string;
  width: number;
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
}): ColumnsType<Row>[number] {
  const headerCellProps = () => buildTextHeaderCellProps(classNames);
  const bodyCellProps = () => buildTextBodyCellProps(classNames);

  return {
    title,
    key,
    width: isMobile ? Math.min(Math.max(width - 18, 132), 220) : width,
    ellipsis: true,
    align: 'center',
    onHeaderCell: headerCellProps,
    onCell: bodyCellProps,
    sorter: (left, right) => {
      const leftText = readText(left, keys);
      const rightText = readText(right, keys);
      const leftTime = dayjs(leftText).valueOf();
      const rightTime = dayjs(rightText).valueOf();
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime;
      }
      return compareText(leftText, rightText);
    },
    render: (_value, row) => formatDateTime(readText(row, keys)),
  };
}

function buildSharedMetricColumns<Row extends DashboardQianchuanCommonRow>({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
}): ColumnsType<Row> {
  return [
    buildMetricColumn<Row>({ key: 'overallCost', keys: ['overallCost', 'overall_cost', 'costAmount', 'cost_amount'], title: '消耗(元)', width: 124, format: 'currency', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallGmv', keys: ['overallGmv', 'overall_gmv'], title: 'GMV(元)', width: 124, format: 'currency', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'netGmv', keys: ['netGmv', 'net_gmv'], title: '净GMV(元)', width: 132, format: 'currency', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallOrderCount', keys: ['overallOrderCount', 'overall_order_count', 'orderCount', 'order_count'], title: '订单数', width: 104, format: 'integer', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallImpressionCount', keys: ['overallImpressionCount', 'overall_impression_count', 'impressionCount', 'impression_count'], title: '展现数', width: 118, format: 'integer', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallClickCount', keys: ['overallClickCount', 'overall_click_count', 'clickCount', 'click_count'], title: '点击数', width: 112, format: 'integer', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallPayRoi', keys: ['overallPayRoi', 'overall_pay_roi', 'payRoi', 'pay_roi'], title: '支付ROI', width: 108, format: 'number', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'netGmvRoi', keys: ['netGmvRoi', 'net_gmv_roi'], title: '净GMV ROI', width: 118, format: 'number', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'netOrderCost', keys: ['netOrderCost', 'net_order_cost'], title: '净成交成本(元)', width: 136, format: 'currency', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallClickRate', keys: ['overallClickRate', 'overall_click_rate', 'clickRate', 'click_rate'], title: '点击率', width: 106, format: 'rate', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallConversionRate', keys: ['overallConversionRate', 'overall_conversion_rate', 'conversionRate', 'conversion_rate'], title: '转化率', width: 106, format: 'rate', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'refundRate1h', keys: ['refundRate1h', 'refund_rate_1h'], title: '1h退款率', width: 112, format: 'rate', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'settlementRoi7d', keys: ['settlementRoi7d', 'settlement_roi_7d'], title: '7日结算ROI', width: 124, format: 'number', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'settlementRoi14d', keys: ['settlementRoi14d', 'settlement_roi_14d'], title: '14日结算ROI', width: 132, format: 'number', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'settlementRoi30d', keys: ['settlementRoi30d', 'settlement_roi_30d'], title: '30日结算ROI', width: 132, format: 'number', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallCpm', keys: ['overallCpm', 'overall_cpm'], title: 'CPM', width: 98, format: 'currency', isMobile, classNames }),
    buildMetricColumn<Row>({ key: 'overallCostRatio', keys: ['overallCostRatio', 'overall_cost_ratio'], title: '成本占比', width: 112, format: 'rate', isMobile, classNames }),
  ];
}

export function buildDashboardQianchuanMaterialTypeMixColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
}): ColumnsType<DashboardQianchuanMaterialTypeMixRow> {
  const textHeaderCellProps = () => buildTextHeaderCellProps(classNames);
  const textBodyCellProps = () => buildTextBodyCellProps(classNames);

  return [
    {
      title: '内容类型',
      key: 'materialType',
      width: isMobile ? 172 : 210,
      fixed: isMobile ? undefined : 'left',
      align: 'center',
      onHeaderCell: textHeaderCellProps,
      onCell: textBodyCellProps,
      sorter: (left, right) =>
        compareText(
          resolveMaterialTypeLabel(left),
          resolveMaterialTypeLabel(right)
        ),
      render: (_value, row) => {
        const materialType = readText(row, ['materialType', 'material_type']);
        const label = resolveMaterialTypeLabel(row);
        return (
          <div className={classNames.tableIdentityCell}>
            <Tag className={classNames.tableTypeTag}>{label}</Tag>
            <span className={classNames.tableIdentityMeta}>{formatMaterialTypeMeta(materialType)}</span>
          </div>
        );
      },
    },
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'materialCount', keys: ['materialCount', 'material_count'], title: '内容数', width: 98, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'overallCost', keys: ['overallCost', 'overall_cost', 'costAmount', 'cost_amount'], title: '消耗(元)', width: 124, format: 'currency', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'overallGmv', keys: ['overallGmv', 'overall_gmv'], title: 'GMV(元)', width: 124, format: 'currency', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'netGmv', keys: ['netGmv', 'net_gmv'], title: '净GMV(元)', width: 132, format: 'currency', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'overallOrderCount', keys: ['overallOrderCount', 'overall_order_count', 'orderCount', 'order_count'], title: '订单数', width: 104, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'overallPayRoi', keys: ['overallPayRoi', 'overall_pay_roi', 'payRoi', 'pay_roi'], title: '支付ROI', width: 108, format: 'number', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'netGmvRoi', keys: ['netGmvRoi', 'net_gmv_roi'], title: '净GMV ROI', width: 118, format: 'number', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'overallCostShare', keys: ['overallCostShare', 'overall_cost_share', 'costShare', 'cost_share'], title: '消耗占比', width: 112, format: 'rate', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanMaterialTypeMixRow>({ key: 'overallGmvShare', keys: ['overallGmvShare', 'overall_gmv_share', 'gmvShare', 'gmv_share'], title: 'GMV占比', width: 112, format: 'rate', isMobile, classNames }),
  ];
}

export function buildDashboardQianchuanLiveRoomScreenColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
}): ColumnsType<DashboardQianchuanLiveRoomScreenRow> {
  return [
    {
      title: '抖音账号',
      key: 'douyinAccountName',
      width: isMobile ? 196 : 240,
      fixed: isMobile ? undefined : 'left',
      align: 'center',
      onHeaderCell: () => buildTextHeaderCellProps(classNames),
      onCell: () => buildTextBodyCellProps(classNames),
      sorter: (left, right) =>
        compareText(
          readText(left, ['douyinAccountName', 'douyin_account_name', 'douyinAccountDisplayId', 'douyin_account_display_id']),
          readText(right, ['douyinAccountName', 'douyin_account_name', 'douyinAccountDisplayId', 'douyin_account_display_id'])
        ),
      render: (_value, row) => {
        const accountName = readText(row, ['douyinAccountName', 'douyin_account_name', 'accountName', 'account_name']);
        const accountId = readText(row, ['douyinAccountDisplayId', 'douyin_account_display_id']);
        return (
          <div className={classNames.tableIdentityCell}>
            <strong className={classNames.tableIdentityName} title={accountName || undefined}>
              {accountName || '--'}
            </strong>
            <span className={classNames.tableIdentityMeta}>{accountId || readText(row, ['promotionType', 'promotion_type']) || '--'}</span>
          </div>
        );
      },
    },
    buildTextColumn<DashboardQianchuanLiveRoomScreenRow>({
      key: 'promotionType',
      keys: ['promotionType', 'promotion_type'],
      title: '投放类型',
      width: 118,
      isMobile,
      classNames,
    }),
    buildTextColumn<DashboardQianchuanLiveRoomScreenRow>({
      key: 'materialKey',
      keys: ['materialKey', 'material_key'],
      title: '画面Key',
      width: 220,
      isMobile,
      classNames,
    }),
    ...buildSharedMetricColumns<DashboardQianchuanLiveRoomScreenRow>({ isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveRoomScreenRow>({ key: 'liveCommentCount', keys: ['liveCommentCount', 'live_comment_count'], title: '直播评论数', width: 126, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveRoomScreenRow>({ key: 'liveLikeCount', keys: ['liveLikeCount', 'live_like_count'], title: '直播点赞数', width: 126, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveRoomScreenRow>({ key: 'newFansCount', keys: ['newFansCount', 'new_fans_count'], title: '新增粉丝', width: 112, format: 'integer', isMobile, classNames }),
  ];
}

export const buildDashboardQianchuanLiveRoomColumns = buildDashboardQianchuanLiveRoomScreenColumns;

export function buildDashboardQianchuanLiveVideoColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardQianchuanTableClassNames;
}): ColumnsType<DashboardQianchuanLiveVideoRow> {
  const liveVideoBodyCellProps = () => ({
    className: mergeClassNames(
      getBodyClassName(classNames),
      classNames.tableTextBodyCell,
      classNames.tableTextBodyCellLeft
    ),
  });

  return [
    {
      title: '视频',
      key: 'materialVideoName',
      width: isMobile ? 240 : 300,
      fixed: isMobile ? undefined : 'left',
      align: 'left',
      ellipsis: true,
      onHeaderCell: () => buildTextHeaderCellProps(classNames),
      onCell: liveVideoBodyCellProps,
      sorter: (left, right) =>
        compareText(
          readText(left, [
            'materialVideoName',
            'material_video_name',
            'materialName',
            'material_name',
            'videoName',
            'video_name',
            'videoTitle',
            'video_title',
          ]),
          readText(right, [
            'materialVideoName',
            'material_video_name',
            'materialName',
            'material_name',
            'videoName',
            'video_name',
            'videoTitle',
            'video_title',
          ])
        ),
      render: (_value, row) => {
        const videoName = normalizeLiveVideoDisplayText(
          readText(row, [
            'materialVideoName',
            'material_video_name',
            'materialName',
            'material_name',
            'videoName',
            'video_name',
            'videoTitle',
            'video_title',
          ])
        );
        const contentAssetId = readText(row, [
          'assetId',
          'asset_id',
          'contentAssetId',
          'content_asset_id',
        ]);
        const titleText = videoName || '--';
        const title = contentAssetId ? `新标签页打开素材库视频 ${titleText}` : videoName || undefined;

        return (
          <div className={mergeClassNames(classNames.tableIdentityCell, classNames.tableIdentityCellLeft)}>
            {contentAssetId ? (
              <Link
                className={mergeClassNames(
                  classNames.tableIdentityName,
                  classNames.tableVideoName,
                  classNames.tableVideoLink
                )}
                to={buildContentAssetDetailPath(contentAssetId)}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
              >
                {titleText}
              </Link>
            ) : (
              <span
                className={mergeClassNames(classNames.tableIdentityName, classNames.tableVideoName)}
                title={title}
              >
                {titleText}
              </span>
            )}
          </div>
        );
      },
    },
    buildTextColumn<DashboardQianchuanLiveVideoRow>({
      key: 'materialId',
      keys: ['materialId', 'material_id', 'videoId', 'video_id'],
      title: '素材ID',
      width: 160,
      isMobile,
      classNames,
    }),
    buildTextColumn<DashboardQianchuanLiveVideoRow>({
      key: 'globalMaterialVideoType',
      keys: ['globalMaterialVideoType', 'global_material_video_type'],
      title: '视频类型',
      width: 132,
      isMobile,
      classNames,
    }),
    buildTextColumn<DashboardQianchuanLiveVideoRow>({
      key: 'liveRoomName',
      keys: ['liveRoomName', 'live_room_name'],
      title: '直播间',
      width: 180,
      isMobile,
      classNames,
    }),
    buildTextColumn<DashboardQianchuanLiveVideoRow>({
      key: 'douyinAccountDisplayId',
      keys: ['douyinAccountDisplayId', 'douyin_account_display_id'],
      title: '直播间抖音号',
      width: 148,
      isMobile,
      classNames,
    }),
    buildDateTimeColumn<DashboardQianchuanLiveVideoRow>({
      key: 'materialCreatedAt',
      keys: ['materialCreatedAt', 'material_created_at'],
      title: '视频创建时间',
      width: 172,
      isMobile,
      classNames,
    }),
    ...buildSharedMetricColumns<DashboardQianchuanLiveVideoRow>({ isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'videoPlayCount', keys: ['videoPlayCount', 'video_play_count', 'playCount', 'play_count'], title: '播放次数', width: 112, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'videoCompletePlayRate', keys: ['videoCompletePlayRate', 'video_complete_play_rate'], title: '完播率', width: 106, format: 'rate', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'playRate2s', keys: ['playRate2s', 'play_rate_2s'], title: '2s播放率', width: 108, format: 'rate', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'playRate3s', keys: ['playRate3s', 'play_rate_3s'], title: '3s播放率', width: 108, format: 'rate', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'playRate5s', keys: ['playRate5s', 'play_rate_5s'], title: '5s播放率', width: 108, format: 'rate', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'playRate10s', keys: ['playRate10s', 'play_rate_10s'], title: '10s播放率', width: 112, format: 'rate', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'avgWatchDuration', keys: ['avgWatchDuration', 'avg_watch_duration'], title: '平均观看时长', width: 136, format: 'duration', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'videoLikeCount', keys: ['videoLikeCount', 'video_like_count'], title: '视频点赞数', width: 126, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'videoCommentCount', keys: ['videoCommentCount', 'video_comment_count'], title: '视频评论数', width: 126, format: 'integer', isMobile, classNames }),
    buildMetricColumn<DashboardQianchuanLiveVideoRow>({ key: 'newFansCount', keys: ['newFansCount', 'new_fans_count'], title: '新增粉丝', width: 112, format: 'integer', isMobile, classNames }),
  ];
}
