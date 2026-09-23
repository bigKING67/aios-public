import type {
  DouyinAttributionSectionsProps,
} from './platform-tab-douyin-section-contracts';
import { DouyinChannelAttributionSection } from './platform-tab-douyin-channel-section';
import { DouyinEmptyAttributionSection } from './platform-tab-douyin-empty-attribution-section';
import { DouyinAttributionSectionList } from './platform-tab-douyin-section-list';

export function DouyinAttributionSections({
  channelSectionProps,
  sectionListProps,
  showEmptyAttributionSection,
}: DouyinAttributionSectionsProps) {
  return (
    <>
      <DouyinChannelAttributionSection
        {...channelSectionProps}
      />

      <DouyinAttributionSectionList
        {...sectionListProps}
      />

      {showEmptyAttributionSection ? (
        <DouyinEmptyAttributionSection />
      ) : null}
    </>
  );
}
