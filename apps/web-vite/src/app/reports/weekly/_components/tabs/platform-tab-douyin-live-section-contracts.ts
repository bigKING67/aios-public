import type { TableColumnsType } from '@lobehub/ui';
import type {
  DouyinLiveFunnelAttributionLeafPropsBundle,
  DouyinLiveSessionAttributionLeafPropsBundle,
} from './platform-tab-douyin-live-leaf-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import type {
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
  QuantAttributionRow,
} from './platform-tab-types';

export type DouyinLiveAttributionSubsectionKind = 'session' | 'funnel';

export interface DouyinLiveAttributionSubsectionDescriptor {
  kind: DouyinLiveAttributionSubsectionKind;
}

export interface BuildDouyinLiveAttributionSectionPropsParams {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinLiveColumns: TableColumnsType<DouyinLiveSessionRow>;
  douyinLiveDetailColumns: TableColumnsType<DouyinMetricDetailRow>;
  quantColumns: TableColumnsType<QuantAttributionRow>;
  resolveFunnelStageColor: (index: number) => string;
  waterfallTotalColor: string;
}

export interface DouyinLiveAttributionSectionPropsBundle {
  subsectionList: DouyinLiveAttributionSubsectionDescriptor[];
  sessionSectionProps: DouyinLiveSessionAttributionLeafPropsBundle;
  funnelSectionProps: DouyinLiveFunnelAttributionLeafPropsBundle;
}

export interface DouyinLiveAttributionSectionsProps
  extends DouyinLiveAttributionSectionPropsBundle {}
