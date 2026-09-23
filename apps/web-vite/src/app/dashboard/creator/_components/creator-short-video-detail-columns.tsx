'use client';

import type { ColumnsType } from 'antd/es/table';
import {
  formatCreatorCurrencyCell,
  formatCreatorIntegerCell,
  formatCreatorTextCell,
} from './creator-formatters';
import {
  CREATOR_SHORT_VIDEO_DETAIL_TABLE_COLUMN_CONFIG,
} from './creator-short-video-detail-column-config';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import {
  formatShortVideoAssetVideoTypeValues,
  readFirstShortVideoDisplayValue,
} from './creator-short-video-array-values';
import {
  buildShortVideoQianchuanMetricTitle,
  buildShortVideoTrafficRoiFormulaTitle,
  renderShortVideoChipListCell,
  renderShortVideoContentAssetLinks,
  renderShortVideoDateCell,
  renderShortVideoGsvCell,
  renderShortVideoInfluencerName,
  renderShortVideoNumericCell,
  renderShortVideoQianchuanMaterialIdsCell,
  renderShortVideoStatusBadge,
  renderShortVideoTitle,
} from './creator-short-video-detail-renderers';
import {
  formatShortVideoRoi,
  resolveShortVideoAdCost,
  resolveShortVideoGsv,
  resolveShortVideoGmv,
  resolveShortVideoOrderCount,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoQianchuanGsv,
  resolveShortVideoQianchuanRoi,
} from './creator-short-video-metrics';
import detailStyles from './creator-short-video-detail-renderers.module.css';
import manualAttrStyles from './creator-short-video-manual-attrs.module.css';

interface BuildCreatorShortVideoDetailColumnsParams {
  manualAttrColumns?: ColumnsType<CreatorShortVideoDetailRow>;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

type CreatorShortVideoColumn = ColumnsType<CreatorShortVideoDetailRow>[number];
type CreatorShortVideoColumnGroup = CreatorShortVideoColumn & {
  children: ColumnsType<CreatorShortVideoDetailRow>;
};

const ASSET_TAXONOMY_COLUMN_CONFIGS = [
  {
    title: '视频类型',
    dataIndex: 'asset_video_types',
    width: 132,
    sourceKeys: ['asset_video_types'],
    formatValues: formatShortVideoAssetVideoTypeValues,
  },
  {
    title: '场景类型',
    dataIndex: 'asset_content_scenes',
    width: 144,
    sourceKeys: ['asset_content_scenes'],
    formatValues: undefined,
  },
  {
    title: '大场景',
    dataIndex: 'asset_content_scene_groups',
    width: 144,
    sourceKeys: ['asset_content_scene_groups'],
    formatValues: undefined,
  },
  {
    title: '细分场景',
    dataIndex: 'asset_content_scene_subtypes',
    width: 160,
    sourceKeys: ['asset_content_scene_subtypes'],
    formatValues: undefined,
  },
] as const;

function groupColumns(title: string, children: ColumnsType<CreatorShortVideoDetailRow>): CreatorShortVideoColumnGroup {
  return {
    title,
    children,
  };
}

function mergeColumnClassName(...classNames: unknown[]): string {
  return classNames
    .filter((className): className is string => typeof className === 'string' && className.trim().length > 0)
    .join(' ');
}

function withoutFixedColumn<T extends { fixed?: unknown }>(column: T): Omit<T, 'fixed'> {
  const { fixed: _fixed, ...rest } = column;
  return rest;
}

function withManualAttrColumnTone(
  columns: ColumnsType<CreatorShortVideoDetailRow>
): ColumnsType<CreatorShortVideoDetailRow> {
  return columns.map((column) => ({
    ...column,
    className: mergeColumnClassName(column.className, manualAttrStyles.manualAttrColumnCell),
    onHeaderCell: () => ({ className: manualAttrStyles.manualAttrColumnHeader }),
  }));
}

function buildAssetTaxonomyColumns(): ColumnsType<CreatorShortVideoDetailRow> {
  return ASSET_TAXONOMY_COLUMN_CONFIGS.map(({ sourceKeys, formatValues, ...column }) => ({
    ...column,
    align: 'center',
    ellipsis: true,
    render: (_value: unknown, row) => {
      const displayValue = readFirstShortVideoDisplayValue(row, sourceKeys);
      return renderShortVideoChipListCell(formatValues ? formatValues(displayValue) : displayValue);
    },
  }));
}

function buildQianchuanGmvColumn(): CreatorShortVideoColumn {
  return {
    title: '千川GMV',
    key: 'qianchuan_gmv',
    dataIndex: 'qianchuan_overall_gmv',
    align: 'right',
    width: 128,
    sorter: (left, right) => resolveShortVideoQianchuanGmv(left) - resolveShortVideoQianchuanGmv(right),
    render: (_value: unknown, row) => {
      const formattedValue = formatCreatorCurrencyCell(resolveShortVideoQianchuanGmv(row));
      return renderShortVideoNumericCell(
        formattedValue,
        buildShortVideoQianchuanMetricTitle(row, '千川GMV', formattedValue)
      );
    },
  };
}

function buildPerformanceColumns(): ColumnsType<CreatorShortVideoDetailRow> {
  return [
    buildQianchuanGmvColumn(),
    {
      title: '千川GSV',
      key: 'qianchuan_gsv',
      dataIndex: 'qianchuan_net_gmv',
      align: 'right',
      width: 128,
      onHeaderCell: () => ({ className: detailStyles.detailHeaderNoWrap }),
      sorter: (left, right) => resolveShortVideoQianchuanGsv(left) - resolveShortVideoQianchuanGsv(right),
      render: (_value: unknown, row) => {
        const formattedValue = formatCreatorCurrencyCell(resolveShortVideoQianchuanGsv(row));
        return renderShortVideoNumericCell(
          formattedValue,
          buildShortVideoQianchuanMetricTitle(row, '千川GSV', formattedValue)
        );
      },
    },
    {
      title: '千川消耗',
      key: 'shortvideo_ad_cost',
      dataIndex: 'qianchuan_overall_cost',
      align: 'right',
      width: 128,
      sorter: (left, right) => resolveShortVideoAdCost(left) - resolveShortVideoAdCost(right),
      render: (_value: unknown, row) => renderShortVideoNumericCell(formatCreatorCurrencyCell(resolveShortVideoAdCost(row))),
    },
    {
      title: '千川ROI',
      key: 'qianchuan_roi',
      align: 'right',
      width: 112,
      sorter: (left, right) =>
        (resolveShortVideoQianchuanRoi(left) ?? -1) - (resolveShortVideoQianchuanRoi(right) ?? -1),
      render: (_value: unknown, row) =>
        renderShortVideoNumericCell(formatShortVideoRoi(resolveShortVideoQianchuanRoi(row)), buildShortVideoTrafficRoiFormulaTitle(row)),
    },
    {
      title: '订单数量',
      key: 'shortvideo_order_count',
      dataIndex: 'qianchuan_overall_order_count',
      align: 'right',
      width: 112,
      sorter: (left, right) => resolveShortVideoOrderCount(left) - resolveShortVideoOrderCount(right),
      render: (_value: unknown, row) => renderShortVideoNumericCell(formatCreatorIntegerCell(resolveShortVideoOrderCount(row))),
    },
    {
      title: '挂车GMV',
      key: 'shortvideo_gmv',
      dataIndex: 'user_pay_amount',
      align: 'right',
      width: 128,
      sorter: (left, right) => resolveShortVideoGmv(left) - resolveShortVideoGmv(right),
      render: (_value: unknown, row) => renderShortVideoNumericCell(formatCreatorCurrencyCell(resolveShortVideoGmv(row))),
    },
    {
      title: '挂车GSV',
      key: 'shortvideo_gsv',
      align: 'right',
      width: 128,
      onHeaderCell: () => ({ className: detailStyles.detailHeaderNoWrap }),
      sorter: (left, right) => resolveShortVideoGsv(left) - resolveShortVideoGsv(right),
      render: (_value: unknown, row) => renderShortVideoGsvCell(row),
    },
  ];
}

export function buildCreatorShortVideoDetailColumns({
  manualAttrColumns = [],
  resolveStageKey,
  formatDisplay,
}: BuildCreatorShortVideoDetailColumnsParams): ColumnsType<CreatorShortVideoDetailRow> {
  const columns = CREATOR_SHORT_VIDEO_DETAIL_TABLE_COLUMN_CONFIG.columns;
  const groupedColumns: ColumnsType<CreatorShortVideoDetailRow> = [
    groupColumns('达人与挂车视频', [
      {
        ...columns.assetProductNames,
        align: 'center',
        ellipsis: true,
        render: (value: unknown) => renderShortVideoChipListCell(value),
      },
      {
        ...columns.contentAssetVideo,
        align: 'center',
        render: (value: unknown, row) => renderShortVideoContentAssetLinks(value, row),
      },
      {
        ...columns.qianchuanMaterialIds,
        align: 'center',
        ellipsis: true,
        render: renderShortVideoQianchuanMaterialIdsCell,
      },
      {
        ...withoutFixedColumn(columns.influencerName),
        align: 'center',
        ellipsis: true,
        render: (value: string | null, row) => renderShortVideoInfluencerName(value, row),
      },
      {
        ...columns.videoTitle,
        align: 'center',
        ellipsis: true,
        render: (value: string | null, row) => renderShortVideoTitle(value, row),
      },
      {
        ...columns.videoId,
        align: 'center',
        ellipsis: true,
        render: formatCreatorTextCell,
      },
      ...buildAssetTaxonomyColumns(),
      {
        ...columns.assetOwnerNames,
        align: 'center',
        ellipsis: true,
        render: (value: unknown) => renderShortVideoChipListCell(value, 1),
      },
      {
        ...columns.publishTime,
        align: 'center',
        sorter: (left, right) => String(left.publish_time ?? '').localeCompare(String(right.publish_time ?? '')),
        render: renderShortVideoDateCell,
      },
      {
        ...columns.cooperationStatus,
        align: 'center',
        render: (_value: string | null, row) =>
          renderShortVideoStatusBadge({ row, resolveStageKey, formatDisplay }),
      },
    ]),
  ];

  groupedColumns.push(groupColumns('效率转化', buildPerformanceColumns()));

  if (manualAttrColumns.length) {
    groupedColumns.push({
      ...groupColumns('人工维护字段', withManualAttrColumnTone(manualAttrColumns)),
      onHeaderCell: () => ({ className: manualAttrStyles.manualAttrColumnGroupHeader }),
    });
  }

  return groupedColumns;
}
