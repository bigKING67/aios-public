import type { WaterfallChartProps } from '@/components/organisms/waterfall-chart';
import type { ColumnsType } from 'antd/es/table';
import type { AttributionTableProps } from './platform-tab-attribution-table-props';
import type { AttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import type { ChannelAttributionRow, GoodsTableRow } from './platform-tab-types';

type WaterfallSteps = WaterfallChartProps['steps'];

export interface TmallGoodsAttributionOverviewSectionProps {
  tableProps: AttributionTableProps<GoodsTableRow>;
  waterfallChartProps: AttributionWaterfallChartProps;
}

export interface TmallChannelAttributionOverviewSectionProps {
  tableProps: AttributionTableProps<ChannelAttributionRow>;
  waterfallChartProps: AttributionWaterfallChartProps;
}

export interface TmallGoodsAttributionLeafPropsBundle {
  overviewSectionProps: TmallGoodsAttributionOverviewSectionProps;
  summaryText: string;
}

export interface TmallChannelAttributionLeafPropsBundle {
  overviewSectionProps: TmallChannelAttributionOverviewSectionProps;
  summaryText: string;
}

export interface TmallGoodsAttributionSectionProps
  extends TmallGoodsAttributionLeafPropsBundle {}

export interface TmallChannelAttributionSectionProps
  extends TmallChannelAttributionLeafPropsBundle {}

export interface BuildTmallGoodsAttributionLeafPropsInput {
  isMobile: boolean;
  goodsTableRows: GoodsTableRow[];
  goodsColumns: ColumnsType<GoodsTableRow>;
  goodsWaterfallSteps: WaterfallSteps;
  attributionAsOfDate: string | undefined;
  attributionTotalPrevGmv: number;
  attributionTotalGmv: number;
  attributionDelta: number;
  waterfallTotalColor: string;
}

export interface BuildTmallChannelAttributionLeafPropsInput {
  isMobile: boolean;
  channelTableRows: ChannelAttributionRow[];
  channelColumns: ColumnsType<ChannelAttributionRow>;
  channelWaterfallSteps: WaterfallSteps;
  channelAttributionAsOfDate: string | undefined;
  channelAttributionTotalPrevPayAmount: number;
  channelAttributionTotalPayAmount: number;
  channelAttributionDelta: number;
  waterfallTotalColor: string;
}
