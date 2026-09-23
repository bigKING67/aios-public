import { formatAttributionSummary } from './platform-tab-attribution-summary';
import { buildAttributionTableProps } from './platform-tab-attribution-table-props';
import { buildAttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import type {
  BuildTmallChannelAttributionLeafPropsInput,
  BuildTmallGoodsAttributionLeafPropsInput,
  TmallChannelAttributionLeafPropsBundle,
  TmallGoodsAttributionLeafPropsBundle,
} from './platform-tab-tmall-leaf-contracts';

export function buildTmallGoodsAttributionLeafProps({
  isMobile,
  goodsTableRows,
  goodsColumns,
  goodsWaterfallSteps,
  attributionAsOfDate,
  attributionTotalPrevGmv,
  attributionTotalGmv,
  attributionDelta,
  waterfallTotalColor,
}: BuildTmallGoodsAttributionLeafPropsInput): TmallGoodsAttributionLeafPropsBundle {
  return {
    overviewSectionProps: {
      tableProps: buildAttributionTableProps({
        isMobile,
        rows: goodsTableRows,
        columns: goodsColumns,
        rowKey: (record) => record.rowId,
        mobileX: 980,
        desktopX: 1280,
      }),
      waterfallChartProps: buildAttributionWaterfallChartProps({
        title: '商品GMV增量瀑布（对比上周同期）',
        previousValue: attributionTotalPrevGmv,
        currentValue: attributionTotalGmv,
        steps: goodsWaterfallSteps,
        totalColor: waterfallTotalColor,
      }),
    },
    summaryText: formatAttributionSummary({
      asOfDate: attributionAsOfDate,
      previousValue: attributionTotalPrevGmv,
      currentValue: attributionTotalGmv,
      deltaValue: attributionDelta,
    }),
  };
}

export function buildTmallChannelAttributionLeafProps({
  isMobile,
  channelTableRows,
  channelColumns,
  channelWaterfallSteps,
  channelAttributionAsOfDate,
  channelAttributionTotalPrevPayAmount,
  channelAttributionTotalPayAmount,
  channelAttributionDelta,
  waterfallTotalColor,
}: BuildTmallChannelAttributionLeafPropsInput): TmallChannelAttributionLeafPropsBundle {
  return {
    overviewSectionProps: {
      tableProps: buildAttributionTableProps({
        isMobile,
        rows: channelTableRows,
        columns: channelColumns,
        rowKey: (record) => record.rowId,
        mobileX: 920,
        desktopX: 1080,
      }),
      waterfallChartProps: buildAttributionWaterfallChartProps({
        title: '商品·流量渠道GMV瀑布（对比上周同期）',
        previousValue: channelAttributionTotalPrevPayAmount,
        currentValue: channelAttributionTotalPayAmount,
        steps: channelWaterfallSteps,
        totalColor: waterfallTotalColor,
      }),
    },
    summaryText: formatAttributionSummary({
      asOfDate: channelAttributionAsOfDate,
      previousValue: channelAttributionTotalPrevPayAmount,
      currentValue: channelAttributionTotalPayAmount,
      deltaValue: channelAttributionDelta,
    }),
  };
}
