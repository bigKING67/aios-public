import type { ColumnsType } from 'antd/es/table';
import type { QuantTableProps } from './platform-tab-quant-table-props';
import type {
  FunnelChannelRow,
  FunnelChannelSection,
  QuantAttributionRow,
} from './platform-tab-types';
import type { WeeklyDataTableProps, WeeklyFunnelChartProps } from './weekly-primitives';

export interface TmallFunnelChannelOverviewSectionProps {
  funnelData: WeeklyFunnelChartProps['data'];
  tableProps: WeeklyDataTableProps<FunnelChannelRow>;
}

export interface TmallFunnelChannelQuantSectionProps {
  title: string;
  tableProps: QuantTableProps;
}

export interface BuildTmallFunnelChannelLeafPropsParams {
  isMobile: boolean;
  channelSection: FunnelChannelSection;
  quantRows: QuantAttributionRow[];
  quantRowsByChannel: Map<string, QuantAttributionRow[]>;
  quantColumns: ColumnsType<QuantAttributionRow>;
  funnelDetailColumnsWithClickStage: ColumnsType<FunnelChannelRow>;
  funnelDetailColumnsWithoutClickStage: ColumnsType<FunnelChannelRow>;
  resolveFunnelStageColor: (index: number) => string;
}

export interface TmallFunnelChannelLeafPropsBundle {
  overviewSectionProps: TmallFunnelChannelOverviewSectionProps;
  summaryText: string;
  quantSectionProps: TmallFunnelChannelQuantSectionProps;
}
