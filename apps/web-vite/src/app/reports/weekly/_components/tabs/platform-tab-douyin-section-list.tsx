import { DouyinCardAttributionSections } from './platform-tab-douyin-card-sections';
import { DouyinLiveAttributionSections } from './platform-tab-douyin-live-sections';
import type {
  DouyinAttributionSectionListProps,
} from './platform-tab-douyin-section-list-contracts';
import { DouyinShortvideoAttributionSections } from './platform-tab-douyin-shortvideo-sections';

export function DouyinAttributionSectionList({
  sectionList,
  liveSectionProps,
  shortvideoSectionProps,
  cardSectionProps,
}: DouyinAttributionSectionListProps) {
  return (
    <>
      {sectionList.map((section) => {
        if (section.kind === 'live') {
          return (
            <DouyinLiveAttributionSections
              key={section.kind}
              {...liveSectionProps}
            />
          );
        }

        if (section.kind === 'shortvideo') {
          return (
            <DouyinShortvideoAttributionSections
              key={section.kind}
              {...shortvideoSectionProps}
            />
          );
        }

        return (
          <DouyinCardAttributionSections
            key={section.kind}
            {...cardSectionProps}
          />
        );
      })}
    </>
  );
}
