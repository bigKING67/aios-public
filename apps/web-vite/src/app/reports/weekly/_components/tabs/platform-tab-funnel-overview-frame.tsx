import type { ReactNode } from 'react';
import {
  WeeklyAttributionGrid,
  WeeklyAttributionTableCard,
  WeeklyDataTable,
  WeeklyFunnelChart,
  type WeeklyFunnelChartProps,
  WeeklyFunnelVisualCard,
} from './weekly-primitives';

export interface FunnelOverviewFrameProps<RowType extends object> {
  badge: string;
  funnelData: WeeklyFunnelChartProps['data'];
  tableProps: Parameters<typeof WeeklyDataTable<RowType>>[0];
  children?: ReactNode;
}

export function FunnelOverviewFrame<RowType extends object>({
  badge,
  funnelData,
  tableProps,
  children,
}: FunnelOverviewFrameProps<RowType>) {
  return (
    <WeeklyAttributionGrid>
      <WeeklyAttributionTableCard>
        <WeeklyFunnelVisualCard badge={badge}>
          <WeeklyFunnelChart data={funnelData} />
        </WeeklyFunnelVisualCard>
      </WeeklyAttributionTableCard>

      <WeeklyAttributionTableCard>
        <WeeklyDataTable<RowType> {...tableProps} />
        {children}
      </WeeklyAttributionTableCard>
    </WeeklyAttributionGrid>
  );
}
