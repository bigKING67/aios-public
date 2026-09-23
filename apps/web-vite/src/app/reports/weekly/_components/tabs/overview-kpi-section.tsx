import type { OverviewKpiSectionProps } from './overview-kpi-section-contracts';
import {
  WeeklyBlock,
  WeeklyKpiCard,
  WeeklyKpiGrid,
  WeeklySectionHeader,
} from './weekly-primitives';

export function OverviewKpiSection({
  kpiCardPropsList,
}: OverviewKpiSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="核心指标"
        description="按周口径查看经营核心指标的环比与同比变化。"
      />
      <WeeklyKpiGrid>
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
