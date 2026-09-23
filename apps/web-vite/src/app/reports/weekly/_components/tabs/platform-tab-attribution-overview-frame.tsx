import { WaterfallChart } from '@/components/organisms/waterfall-chart';
import type { AttributionTableProps } from './platform-tab-attribution-table-props';
import type { AttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import {
  WeeklyAttributionGrid,
  WeeklyAttributionTableCard,
  WeeklyDataTable,
  WeeklyEmptyState,
  WeeklyWaterfallChartFrame,
} from './weekly-primitives';

interface AttributionOverviewFrameProps<RowType extends object> {
  tableProps: AttributionTableProps<RowType>;
  waterfallChartProps: AttributionWaterfallChartProps;
  tableEmptyDescription: string;
  waterfallEmptyDescription: string;
}

export function AttributionOverviewFrame<RowType extends object>({
  tableProps,
  waterfallChartProps,
  tableEmptyDescription,
  waterfallEmptyDescription,
}: AttributionOverviewFrameProps<RowType>) {
  return (
    <WeeklyAttributionGrid>
      <WeeklyAttributionTableCard>
        {tableProps ? (
          <WeeklyDataTable<RowType>
            {...tableProps}
          />
        ) : (
          <WeeklyEmptyState description={tableEmptyDescription} />
        )}
      </WeeklyAttributionTableCard>

      <WeeklyWaterfallChartFrame>
        {waterfallChartProps ? (
          <WaterfallChart
            {...waterfallChartProps}
          />
        ) : (
          <WeeklyEmptyState description={waterfallEmptyDescription} />
        )}
      </WeeklyWaterfallChartFrame>
    </WeeklyAttributionGrid>
  );
}
