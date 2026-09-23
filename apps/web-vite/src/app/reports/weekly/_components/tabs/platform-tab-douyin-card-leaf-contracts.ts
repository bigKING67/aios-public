import type { ColumnsType } from 'antd/es/table';
import type { AttributionTableProps } from './platform-tab-attribution-table-props';
import type { AttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import type { DouyinCardSectionData } from './platform-tab-douyin-card-section-types';
import type { QuantTableProps } from './platform-tab-quant-table-props';
import type {
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinMetricDetailRow,
  QuantAttributionRow,
} from './platform-tab-types';
import type { WeeklyDataTableProps, WeeklyFunnelChartProps } from './weekly-primitives';

export interface DouyinCardProductAttributionOverviewSectionProps {
  tableProps: AttributionTableProps<DouyinCardProductRow>;
  waterfallChartProps: AttributionWaterfallChartProps;
}

export interface DouyinCardSourceAttributionOverviewSectionProps {
  tableProps: AttributionTableProps<DouyinCardSourceRow>;
  waterfallChartProps: AttributionWaterfallChartProps;
}

export interface DouyinCardSourceFunnelOverviewSectionProps {
  funnelData: WeeklyFunnelChartProps['data'];
  tableProps: WeeklyDataTableProps<DouyinMetricDetailRow>;
}

export interface DouyinCardSourceQuantSectionProps {
  tableProps: QuantTableProps;
}

export interface DouyinCardProductAttributionLeafPropsBundle {
  overviewSectionProps: DouyinCardProductAttributionOverviewSectionProps;
  summaryText: string;
}

export interface DouyinCardSourceAttributionLeafPropsBundle {
  sourceDescription: string;
  overviewSectionProps: DouyinCardSourceAttributionOverviewSectionProps;
  summaryText: string;
}

export interface DouyinCardSourceFunnelLeafPropsBundle {
  selectedSourceLevelText: string;
  overviewSectionProps: DouyinCardSourceFunnelOverviewSectionProps | null;
  quantSectionProps: DouyinCardSourceQuantSectionProps | null;
}

export interface DouyinCardProductAttributionSectionProps
  extends DouyinCardProductAttributionLeafPropsBundle {}

export interface DouyinCardSourceAttributionSectionProps
  extends DouyinCardSourceAttributionLeafPropsBundle {}

export interface DouyinCardSourceFunnelSectionProps
  extends DouyinCardSourceFunnelLeafPropsBundle {}

export interface BuildDouyinCardProductAttributionLeafPropsInput {
  isMobile: boolean;
  data: Pick<
    DouyinCardSectionData,
    | 'douyinCardAsOfDate'
    | 'douyinCardProductTableRows'
    | 'douyinCardTotalCurrent'
    | 'douyinCardTotalPrev'
    | 'douyinCardTotalDelta'
    | 'douyinCardProductWaterfallSteps'
  >;
  douyinCardProductColumns: ColumnsType<DouyinCardProductRow>;
  waterfallTotalColor: string;
}

export interface BuildDouyinCardSourceAttributionLeafPropsInput {
  isMobile: boolean;
  data: Pick<
    DouyinCardSectionData,
    | 'diagnosisCardProductId'
    | 'diagnosisCardProductName'
    | 'douyinCardSourceTableRows'
    | 'douyinCardSourceTotalCurrent'
    | 'douyinCardSourceTotalPrev'
    | 'douyinCardSourceTotalDelta'
    | 'douyinCardSourceWaterfallSteps'
  >;
  douyinCardSourceColumns: ColumnsType<DouyinCardSourceRow>;
  waterfallTotalColor: string;
}

export interface BuildDouyinCardSourceFunnelLeafPropsInput {
  isMobile: boolean;
  data: Pick<
    DouyinCardSectionData,
    | 'selectedDouyinCardSource'
    | 'selectedDouyinCardSourceStages'
    | 'selectedDouyinCardQuantRows'
    | 'selectedDouyinCardDetailRows'
  >;
  douyinLiveDetailColumns: ColumnsType<DouyinMetricDetailRow>;
  quantColumns: ColumnsType<QuantAttributionRow>;
  resolveFunnelStageColor: (index: number) => string;
}
