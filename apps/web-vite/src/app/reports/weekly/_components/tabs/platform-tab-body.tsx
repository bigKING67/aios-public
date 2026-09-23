import { PlatformTabContent } from './platform-tab-content';
import type { PlatformTabContentProps } from './platform-tab-content-props';
import { buildPlatformTabBodySections } from './platform-tab-content-routing';
import { PlatformKpiSection } from './platform-kpi-section';
import { getTrendClassName } from './platform-tab-visuals';
import { WeeklyPageStack } from './weekly-primitives';

interface PlatformTabBodyProps {
  contentProps: PlatformTabContentProps;
}

export function PlatformTabBody({ contentProps }: PlatformTabBodyProps) {
  const sections = buildPlatformTabBodySections(contentProps, {
    resolveTrendClassName: getTrendClassName,
  });

  return (
    <WeeklyPageStack>
      {sections.map((section) => {
        if (section.kind === 'content') {
          return (
            <PlatformTabContent
              key={`content-${section.placement}`}
              {...section.contentProps}
            />
          );
        }

        return (
          <PlatformKpiSection
            key="kpi"
            {...section.kpiSectionProps}
          />
        );
      })}
    </WeeklyPageStack>
  );
}
