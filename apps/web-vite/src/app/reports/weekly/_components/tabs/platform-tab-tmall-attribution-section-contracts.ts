import type { TmallPlatformColumns } from './platform-tab-content-columns';
import type {
  TmallFunnelDiagnosisSectionListPropsBundle,
} from './platform-tab-tmall-funnel-section-list-contracts';
import type {
  TmallChannelAttributionLeafPropsBundle,
  TmallGoodsAttributionLeafPropsBundle,
} from './platform-tab-tmall-leaf-contracts';
import type { PlatformAttributionSources } from './platform-tab-chart-sources';
import type { TmallPlatformSectionData } from './platform-tab-tmall-derived-data';

export interface TmallAttributionSectionViewModel {
  attributionSources: Pick<
    PlatformAttributionSources,
    'attributionAsOfDate' | 'channelAttributionAsOfDate'
  >;
  tmallSectionData: TmallPlatformSectionData;
}

export interface BuildTmallAttributionSectionPropsParams {
  isMobile: boolean;
  columns: TmallPlatformColumns;
  viewModel: TmallAttributionSectionViewModel;
}

export interface TmallAttributionSectionPropsBundle {
  goodsSectionProps: TmallGoodsAttributionLeafPropsBundle;
  channelSectionProps: TmallChannelAttributionLeafPropsBundle;
  funnelSectionProps: TmallFunnelDiagnosisSectionListPropsBundle;
}

export interface PlatformTabTmallAttributionSectionsProps
  extends TmallAttributionSectionPropsBundle {}
