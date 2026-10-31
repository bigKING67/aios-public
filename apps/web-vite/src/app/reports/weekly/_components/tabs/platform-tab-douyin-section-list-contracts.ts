import type { TableColumnsType } from '@lobehub/ui';
import type {
  DouyinCardAttributionSectionPropsBundle,
} from './platform-tab-douyin-card-section-contracts';
import type {
  DouyinLiveAttributionSectionPropsBundle,
} from './platform-tab-douyin-live-section-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import type {
  DouyinShortvideoAttributionSectionPropsBundle,
} from './platform-tab-douyin-shortvideo-section-contracts';
import type {
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
  DouyinShortvideoRow,
  QuantAttributionRow,
} from './platform-tab-types';

export type DouyinAttributionSectionKind = 'live' | 'shortvideo' | 'card';

export interface DouyinAttributionSectionDescriptor {
  kind: DouyinAttributionSectionKind;
}

export interface BuildDouyinAttributionSectionListPropsParams {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinLiveColumns: TableColumnsType<DouyinLiveSessionRow>;
  douyinLiveDetailColumns: TableColumnsType<DouyinMetricDetailRow>;
  douyinShortvideoColumns: TableColumnsType<DouyinShortvideoRow>;
  douyinCardProductColumns: TableColumnsType<DouyinCardProductRow>;
  douyinCardSourceColumns: TableColumnsType<DouyinCardSourceRow>;
  quantColumns: TableColumnsType<QuantAttributionRow>;
  resolveFunnelStageColor: (index: number) => string;
  waterfallTotalColor: string;
}

export interface DouyinAttributionSectionListPropsBundle {
  sectionList: DouyinAttributionSectionDescriptor[];
  liveSectionProps: DouyinLiveAttributionSectionPropsBundle;
  shortvideoSectionProps: DouyinShortvideoAttributionSectionPropsBundle;
  cardSectionProps: DouyinCardAttributionSectionPropsBundle;
}

export interface DouyinAttributionSectionListProps
  extends DouyinAttributionSectionListPropsBundle {}
