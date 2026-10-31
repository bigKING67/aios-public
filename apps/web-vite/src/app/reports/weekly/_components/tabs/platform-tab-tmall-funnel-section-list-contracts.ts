import type { TableColumnsType } from '@lobehub/ui';
import type {
  TmallFunnelChannelSectionProps,
} from './platform-tab-tmall-funnel-channel-section-contracts';
import type {
  FunnelChannelRow,
  FunnelChannelSection,
  QuantAttributionRow,
} from './platform-tab-types';

export interface BuildTmallFunnelDiagnosisSectionListPropsParams {
  isMobile: boolean;
  funnelChannelSections: FunnelChannelSection[];
  quantRows: QuantAttributionRow[];
  quantRowsByChannel: Map<string, QuantAttributionRow[]>;
  quantColumns: TableColumnsType<QuantAttributionRow>;
  funnelDetailColumnsWithClickStage: TableColumnsType<FunnelChannelRow>;
  funnelDetailColumnsWithoutClickStage: TableColumnsType<FunnelChannelRow>;
  resolveFunnelStageColor: (index: number) => string;
}

export interface TmallFunnelDiagnosisSectionListPropsBundle {
  channelSectionPropsList: TmallFunnelChannelSectionProps[];
  showEmptyFunnelSection: boolean;
}

export interface TmallFunnelDiagnosisSectionsProps
  extends TmallFunnelDiagnosisSectionListPropsBundle {}
