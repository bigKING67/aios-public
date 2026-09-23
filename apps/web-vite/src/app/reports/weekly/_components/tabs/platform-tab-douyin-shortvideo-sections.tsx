import { DouyinShortvideoAnalysisSection } from './platform-tab-douyin-shortvideo-analysis-section';
import { DouyinShortvideoOverviewSection } from './platform-tab-douyin-shortvideo-overview-section';
import type {
  DouyinShortvideoAttributionSectionsProps,
} from './platform-tab-douyin-shortvideo-section-contracts';

export function DouyinShortvideoAttributionSections({
  subsectionList,
  overviewSectionProps,
  analysisSectionProps,
}: DouyinShortvideoAttributionSectionsProps) {
  return (
    <>
      {subsectionList.map((section) => {
        if (section.kind === 'overview') {
          return (
            <DouyinShortvideoOverviewSection
              key={section.kind}
              {...overviewSectionProps}
            />
          );
        }

        return (
          <DouyinShortvideoAnalysisSection
            key={section.kind}
            {...analysisSectionProps}
          />
        );
      })}
    </>
  );
}
