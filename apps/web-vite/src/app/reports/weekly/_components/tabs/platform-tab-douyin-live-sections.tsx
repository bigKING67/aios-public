import { DouyinLiveFunnelAttributionSection } from './platform-tab-douyin-live-funnel-section';
import type {
  DouyinLiveAttributionSectionsProps,
} from './platform-tab-douyin-live-section-contracts';
import { DouyinLiveSessionAttributionSection } from './platform-tab-douyin-live-session-section';

export function DouyinLiveAttributionSections({
  subsectionList,
  sessionSectionProps,
  funnelSectionProps,
}: DouyinLiveAttributionSectionsProps) {
  return (
    <>
      {subsectionList.map((section) => {
        if (section.kind === 'session') {
          return (
            <DouyinLiveSessionAttributionSection
              key={section.kind}
              {...sessionSectionProps}
            />
          );
        }

        return (
          <DouyinLiveFunnelAttributionSection
            key={section.kind}
            {...funnelSectionProps}
          />
        );
      })}
    </>
  );
}
