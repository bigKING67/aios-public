import type { ColumnsType } from 'antd/es/table';
import type { AttributionTableProps } from './platform-tab-attribution-table-props';
import type { AttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import type { DouyinShortvideoRow } from './platform-tab-types';
import type {
  WeeklyDataTableProps,
  WeeklyDiagnosisCardProps,
} from './weekly-primitives';

export interface DouyinShortvideoAttributionOverviewSectionProps {
  tableProps: AttributionTableProps<DouyinShortvideoRow>;
  waterfallChartProps: AttributionWaterfallChartProps;
}

export interface DouyinShortvideoOverviewLeafPropsBundle {
  overviewSectionProps: DouyinShortvideoAttributionOverviewSectionProps;
  summaryText: string;
}

export interface DouyinShortvideoAnalysisLeafPropsBundle {
  selectedAuthorNickname: string;
  diagnosisCardProps: WeeklyDiagnosisCardProps | null;
  tableProps: WeeklyDataTableProps<DouyinShortvideoRow> | null;
}

export interface DouyinShortvideoOverviewSectionProps
  extends DouyinShortvideoOverviewLeafPropsBundle {}

export interface DouyinShortvideoAnalysisSectionProps
  extends DouyinShortvideoAnalysisLeafPropsBundle {}

export interface BuildDouyinShortvideoOverviewLeafPropsInput {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinShortvideoColumns: ColumnsType<DouyinShortvideoRow>;
  waterfallTotalColor: string;
}

export interface BuildDouyinShortvideoAnalysisLeafPropsInput {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinShortvideoColumns: ColumnsType<DouyinShortvideoRow>;
}
