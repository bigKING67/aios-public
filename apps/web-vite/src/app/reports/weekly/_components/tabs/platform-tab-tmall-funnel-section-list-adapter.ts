import { buildTmallFunnelChannelLeafProps } from './platform-tab-tmall-funnel-leaf-adapter';
import type {
  BuildTmallFunnelDiagnosisSectionListPropsParams,
  TmallFunnelDiagnosisSectionListPropsBundle,
} from './platform-tab-tmall-funnel-section-list-contracts';

export function buildTmallFunnelDiagnosisSectionListProps({
  isMobile,
  funnelChannelSections,
  quantRows,
  quantRowsByChannel,
  quantColumns,
  funnelDetailColumnsWithClickStage,
  funnelDetailColumnsWithoutClickStage,
  resolveFunnelStageColor,
}: BuildTmallFunnelDiagnosisSectionListPropsParams): TmallFunnelDiagnosisSectionListPropsBundle {
  return {
    channelSectionPropsList: funnelChannelSections.map((channelSection) => ({
      channelKey: channelSection.channelKey,
      channelTitleText: channelSection.titleText,
      ...buildTmallFunnelChannelLeafProps({
        isMobile,
        channelSection,
        quantRows,
        quantRowsByChannel,
        quantColumns,
        funnelDetailColumnsWithClickStage,
        funnelDetailColumnsWithoutClickStage,
        resolveFunnelStageColor,
      }),
    })),
    showEmptyFunnelSection: funnelChannelSections.length === 0,
  };
}
