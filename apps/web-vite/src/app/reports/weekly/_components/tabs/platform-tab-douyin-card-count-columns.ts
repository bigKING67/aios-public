import type { ColumnsType } from 'antd/es/table';
import { createIntegerMetricColumn } from './platform-tab-metric-column-builders';

type DouyinCardCountRow = {
  currCardExposureUserCount: number;
  currCardClickUserCount: number;
  currCardBuyerCount: number;
};

export function buildDouyinCardCountColumns<
  Row extends DouyinCardCountRow,
>(): ColumnsType<Row> {
  return [
    createIntegerMetricColumn<Row>('曝光人数', 'currCardExposureUserCount', 120),
    createIntegerMetricColumn<Row>('点击人数', 'currCardClickUserCount', 120),
    createIntegerMetricColumn<Row>('成交人数', 'currCardBuyerCount', 120),
  ];
}
