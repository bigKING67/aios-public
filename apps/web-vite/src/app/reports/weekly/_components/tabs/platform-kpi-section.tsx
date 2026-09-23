'use client';

import type { PlatformKpiSectionProps } from './platform-tab-kpi-section-contracts';
import {
  WeeklyBlock,
  WeeklyKpiCard,
  WeeklyKpiGrid,
  WeeklySectionHeader,
} from './weekly-primitives';

export function PlatformKpiSection({
  platformLabel,
  kpiCardPropsList,
}: PlatformKpiSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title={`${platformLabel}核心指标`}
        badge="Platform"
      />
      <WeeklyKpiGrid variant="platform">
        {kpiCardPropsList.map(({ key, ...kpiCardProps }) => (
          <WeeklyKpiCard
            key={key}
            {...kpiCardProps}
          />
        ))}
      </WeeklyKpiGrid>
    </WeeklyBlock>
  );
}
