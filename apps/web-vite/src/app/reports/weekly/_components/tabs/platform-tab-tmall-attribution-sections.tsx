import type {
  PlatformTabTmallAttributionSectionsProps,
} from './platform-tab-tmall-attribution-section-contracts';
import {
  TmallChannelAttributionSection,
  TmallFunnelDiagnosisSections,
  TmallGoodsAttributionSection,
} from './platform-tab-tmall-sections';

export function PlatformTabTmallAttributionSections({
  goodsSectionProps,
  channelSectionProps,
  funnelSectionProps,
}: PlatformTabTmallAttributionSectionsProps) {
  return (
    <>
      <TmallGoodsAttributionSection {...goodsSectionProps} />

      <TmallChannelAttributionSection {...channelSectionProps} />

      <TmallFunnelDiagnosisSections {...funnelSectionProps} />
    </>
  );
}
