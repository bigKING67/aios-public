import type { ColumnsType } from 'antd/es/table';
import type { AttributionTableProps } from './platform-tab-attribution-table-props';
import type { AttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import type { DouyinLiveSectionData } from './platform-tab-douyin-live-section-types';
import type { QuantTableProps } from './platform-tab-quant-table-props';
import type {
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
  QuantAttributionRow,
} from './platform-tab-types';
import type { WeeklyDataTableProps, WeeklyFunnelChartProps } from './weekly-primitives';

export interface DouyinLiveSessionAttributionOverviewSectionProps {
  tableProps: AttributionTableProps<DouyinLiveSessionRow>;
  waterfallChartProps: AttributionWaterfallChartProps;
}

export interface DouyinLiveFunnelOverviewSectionProps {
  funnelData: WeeklyFunnelChartProps['data'];
  tableProps: WeeklyDataTableProps<DouyinMetricDetailRow>;
  summaryText: string;
}

export interface DouyinLiveQuantSectionProps {
  tableProps: QuantTableProps;
}

export interface DouyinLiveSessionAttributionLeafPropsBundle {
  overviewSectionProps: DouyinLiveSessionAttributionOverviewSectionProps;
  summaryText: string;
}

export interface DouyinLiveFunnelAttributionLeafPropsBundle {
  selectedAnchorNickname: string;
  overviewSectionProps: DouyinLiveFunnelOverviewSectionProps | null;
  quantSectionProps: DouyinLiveQuantSectionProps | null;
}

export interface DouyinLiveSessionAttributionSectionProps
  extends DouyinLiveSessionAttributionLeafPropsBundle {}

export interface DouyinLiveFunnelAttributionSectionProps
  extends DouyinLiveFunnelAttributionLeafPropsBundle {}

export interface BuildDouyinLiveSessionAttributionLeafPropsInput {
  isMobile: boolean;
  data: Pick<
    DouyinLiveSectionData,
    | 'douyinLiveAsOfDate'
    | 'douyinLiveTableRows'
    | 'douyinLiveTotalCurrent'
    | 'douyinLiveTotalPrev'
    | 'douyinLiveTotalDelta'
    | 'douyinLiveWaterfallSteps'
  >;
  douyinLiveColumns: ColumnsType<DouyinLiveSessionRow>;
  waterfallTotalColor: string;
}

export interface BuildDouyinLiveFunnelAttributionLeafPropsInput {
  isMobile: boolean;
  data: Pick<
    DouyinLiveSectionData,
    | 'selectedDouyinLiveRow'
    | 'selectedDouyinLiveStages'
    | 'selectedDouyinLiveDetailRows'
    | 'selectedDouyinLiveQuantRows'
  >;
  douyinLiveDetailColumns: ColumnsType<DouyinMetricDetailRow>;
  quantColumns: ColumnsType<QuantAttributionRow>;
  resolveFunnelStageColor: (index: number) => string;
}
