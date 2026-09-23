import type { ColumnsType } from 'antd/es/table';
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
  quantColumns: ColumnsType<QuantAttributionRow>;
  funnelDetailColumnsWithClickStage: ColumnsType<FunnelChannelRow>;
  funnelDetailColumnsWithoutClickStage: ColumnsType<FunnelChannelRow>;
  resolveFunnelStageColor: (index: number) => string;
}

export interface TmallFunnelDiagnosisSectionListPropsBundle {
  channelSectionPropsList: TmallFunnelChannelSectionProps[];
  showEmptyFunnelSection: boolean;
}

export interface TmallFunnelDiagnosisSectionsProps
  extends TmallFunnelDiagnosisSectionListPropsBundle {}
