import type { LineChartProps } from '@/components/organisms/line-chart';
import type {
  PlatformBaseMetricValues,
  PlatformTrendChartData,
} from './platform-tab-metrics';

export interface PlatformTrendSectionViewModel {
  chartData: PlatformTrendChartData;
  hasChartData: boolean;
  baseMetrics: Pick<PlatformBaseMetricValues, 'prevGmv' | 'gmv' | 'gmvDelta'>;
}

export interface BuildPlatformTrendSectionPropsParams {
  platformLabel: string;
  viewModel: PlatformTrendSectionViewModel;
}

export interface PlatformTrendSectionPropsBundle {
  platformLabel: string;
  lineChartProps: LineChartProps | null;
  summaryText: string;
}

export interface PlatformTrendSectionProps extends PlatformTrendSectionPropsBundle {}
