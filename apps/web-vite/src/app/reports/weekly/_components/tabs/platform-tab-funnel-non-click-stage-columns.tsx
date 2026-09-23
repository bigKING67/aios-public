import type { ColumnsType } from 'antd/es/table';
import { formatInteger, formatRatioPercent } from './platform-tab-formatters';
import type { FunnelChannelRow } from './platform-tab-types';
import {
  createIntegerMetricColumn,
  createRatioPercentMetricColumn,
} from './platform-tab-metric-column-builders';

export function buildFunnelNonClickStageColumns(): ColumnsType<FunnelChannelRow> {
  return [
    {
      title: '访客数',
      dataIndex: 'currVisitorCount',
      key: 'currVisitorCount',
      width: 120,
      render: (_value: FunnelChannelRow['currVisitorCount'], item) =>
        formatInteger(item.currVisitorCount ?? item.currImpressionCount),
    },
    createIntegerMetricColumn<FunnelChannelRow>('加购人数', 'currCartCount', 120),
    createIntegerMetricColumn<FunnelChannelRow>('支付人数', 'currPayBuyerCount', 120),
    createRatioPercentMetricColumn<FunnelChannelRow>('加购率', 'currClickToCartRate', 120),
    {
      title: '访客支付转化率',
      dataIndex: 'currClickConversionRate',
      key: 'currVisitorPayConversionRate',
      width: 140,
      render: (_value: FunnelChannelRow['currClickConversionRate'], item) => {
        const visitorCount = item.currVisitorCount ?? item.currImpressionCount;
        const visitorPayRate =
          visitorCount > 0 ? item.currPayBuyerCount / visitorCount : undefined;
        return formatRatioPercent(visitorPayRate, 2);
      },
    },
  ];
}
