import type { ColumnsType } from 'antd/es/table';
import {
  calcChangePercent,
  formatSignedPercent,
} from './platform-tab-formatters';
import type { DouyinMetricDetailRow } from './platform-tab-types';

export {
  buildDouyinCardProductColumns,
  buildDouyinCardSourceColumns,
} from './platform-tab-douyin-card-columns';
export { buildDouyinLiveColumns } from './platform-tab-douyin-live-columns';
export { buildDouyinShortvideoColumns } from './platform-tab-douyin-shortvideo-columns';

export function buildDouyinMetricDetailColumns(): ColumnsType<DouyinMetricDetailRow> {
  return [
    {
      title: '指标',
      dataIndex: 'metric',
      key: 'metric',
      fixed: 'left',
      width: 170,
    },
    {
      title: '本周',
      dataIndex: 'curr',
      key: 'curr',
      width: 130,
      render: (_value, row) => row.formatter(row.curr),
    },
    {
      title: '上周同期',
      dataIndex: 'prev',
      key: 'prev',
      width: 130,
      render: (_value, row) => row.formatter(row.prev),
    },
    {
      title: '变化率',
      key: 'wow',
      width: 120,
      render: (_value, row) => formatSignedPercent(calcChangePercent(row.curr, row.prev), 1),
    },
  ];
}
