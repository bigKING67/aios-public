import type { ColumnsType } from 'antd/es/table';
import { createIntegerMetricColumn } from './platform-tab-metric-column-builders';

type ChannelCountRow = {
  payBuyerCount: number;
  visitorCount: number;
  cartBuyerCount: number;
};

export function buildChannelCountColumns<
  Row extends ChannelCountRow,
>(): ColumnsType<Row> {
  return [
    createIntegerMetricColumn<Row>('支付人数', 'payBuyerCount', 115),
    createIntegerMetricColumn<Row>('访客数', 'visitorCount', 115),
    createIntegerMetricColumn<Row>('加购人数', 'cartBuyerCount', 115),
  ];
}
