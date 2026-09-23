import type { ColumnsType } from 'antd/es/table';
import {
  formatDouyinDurationMinutes,
  renderDouyinAccountName,
  renderDouyinMetricTrend,
  renderDouyinTextWithTitle,
  type TrendClassNameResolver,
} from './platform-tab-douyin-renderers';
import type { DouyinLiveSessionRow } from './platform-tab-types';
import { createWeeklyGmvCellProps } from './platform-tab-column-cells';
import { buildDouyinLiveCountColumns } from './platform-tab-douyin-live-count-columns';

export function buildDouyinLiveColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<DouyinLiveSessionRow> {
  return [
    {
      title: '直播开始时间',
      dataIndex: 'liveStartTime',
      key: 'liveStartTime',
      fixed: 'left',
      width: 170,
      render: (value: DouyinLiveSessionRow['liveStartTime']) =>
        renderDouyinTextWithTitle(value),
    },
    {
      title: '主播昵称',
      dataIndex: 'anchorNickname',
      key: 'anchorNickname',
      width: 130,
      render: (value: DouyinLiveSessionRow['anchorNickname'], row) =>
        renderDouyinAccountName(value, row.anchorDouyinId),
    },
    {
      title: '店铺名称',
      dataIndex: 'shopName',
      key: 'shopName',
      width: 150,
      render: (value: DouyinLiveSessionRow['shopName']) =>
        renderDouyinTextWithTitle(value),
    },
    {
      title: '直播时长',
      dataIndex: 'currLiveDurationMinutes',
      key: 'currLiveDurationMinutes',
      width: 100,
      render: (value: DouyinLiveSessionRow['currLiveDurationMinutes']) =>
        formatDouyinDurationMinutes(value),
    },
    {
      title: '直播间成交金额',
      dataIndex: 'currLiveGmv',
      key: 'currLiveGmv',
      width: 190,
      onCell: createWeeklyGmvCellProps,
      render: (_value: DouyinLiveSessionRow['currLiveGmv'], row) =>
        renderDouyinMetricTrend(row.currLiveGmv, row.prevLiveGmv, resolveTrendClassName),
    },
    ...buildDouyinLiveCountColumns(),
  ];
}
