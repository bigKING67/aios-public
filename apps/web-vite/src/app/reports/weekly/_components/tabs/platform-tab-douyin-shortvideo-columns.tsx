import type { ColumnsType } from 'antd/es/table';
import {
  renderDouyinAccountName,
  type TrendClassNameResolver,
} from './platform-tab-douyin-renderers';
import type { DouyinShortvideoRow } from './platform-tab-types';
import {
  renderWeeklyPlainTextCell,
} from './platform-tab-column-cells';
import { buildDouyinShortvideoAmountColumns } from './platform-tab-douyin-shortvideo-amount-columns';
import { createIntegerMetricColumn } from './platform-tab-metric-column-builders';

export function buildDouyinShortvideoColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<DouyinShortvideoRow> {
  return [
    {
      title: '视频标题',
      dataIndex: 'videoTitle',
      key: 'videoTitle',
      fixed: 'left',
      width: 260,
      render: (value: DouyinShortvideoRow['videoTitle']) =>
        renderWeeklyPlainTextCell(value),
    },
    {
      title: '达人昵称',
      dataIndex: 'authorNickname',
      key: 'authorNickname',
      width: 130,
      render: (value: DouyinShortvideoRow['authorNickname'], row) =>
        renderDouyinAccountName(value, row.authorDouyinId),
    },
    {
      title: '发布时间',
      dataIndex: 'publishTime',
      key: 'publishTime',
      width: 170,
    },
    createIntegerMetricColumn<DouyinShortvideoRow>(
      '视频观看次数',
      'currVideoViewCount',
      130
    ),
    ...buildDouyinShortvideoAmountColumns(resolveTrendClassName),
  ];
}
