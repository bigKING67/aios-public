import type { ColumnsType } from 'antd/es/table';
import type {
  DouyinShortvideoAnalysisLeafPropsBundle,
  DouyinShortvideoOverviewLeafPropsBundle,
} from './platform-tab-douyin-shortvideo-leaf-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import type { DouyinShortvideoRow } from './platform-tab-types';

export type DouyinShortvideoAttributionSubsectionKind = 'overview' | 'analysis';

export interface DouyinShortvideoAttributionSubsectionDescriptor {
  kind: DouyinShortvideoAttributionSubsectionKind;
}

export interface BuildDouyinShortvideoAttributionSectionPropsParams {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinShortvideoColumns: ColumnsType<DouyinShortvideoRow>;
  waterfallTotalColor: string;
}

export interface DouyinShortvideoAttributionSectionPropsBundle {
  subsectionList: DouyinShortvideoAttributionSubsectionDescriptor[];
  overviewSectionProps: DouyinShortvideoOverviewLeafPropsBundle;
  analysisSectionProps: DouyinShortvideoAnalysisLeafPropsBundle;
}

export interface DouyinShortvideoAttributionSectionsProps
  extends DouyinShortvideoAttributionSectionPropsBundle {}
