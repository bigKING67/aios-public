import { WeeklySummaryCard } from '@/components/organisms/weekly-summary-card';
import type { TmallPlatformContentProps } from './platform-tab-tmall-content-contracts';
import { PlatformTabTmallAttributionSections } from './platform-tab-tmall-attribution-sections';

export function PlatformTabTmallContent({
  summaryCardProps,
  attributionSectionProps,
}: TmallPlatformContentProps) {
  return (
    <>
      <WeeklySummaryCard {...summaryCardProps} />
      <PlatformTabTmallAttributionSections
        {...attributionSectionProps}
      />
    </>
  );
}
