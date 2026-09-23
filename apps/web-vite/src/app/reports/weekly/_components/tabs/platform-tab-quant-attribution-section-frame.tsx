import type { QuantTableProps } from './platform-tab-quant-table-props';
import {
  WeeklyAttributionTableCard,
  WeeklyDataTable,
  WeeklyEmptyState,
  WeeklyQuantBlock,
  WeeklyQuantHeader,
} from './weekly-primitives';

export interface QuantAttributionSectionFrameProps {
  title: string;
  description: string;
  tableProps: QuantTableProps;
  emptyDescription: string;
}

export function QuantAttributionSectionFrame({
  title,
  description,
  tableProps,
  emptyDescription,
}: QuantAttributionSectionFrameProps) {
  return (
    <WeeklyQuantBlock>
      <WeeklyQuantHeader title={title} description={description} />
      {tableProps ? (
        <WeeklyAttributionTableCard>
          <WeeklyDataTable {...tableProps} />
        </WeeklyAttributionTableCard>
      ) : (
        <WeeklyEmptyState description={emptyDescription} />
      )}
    </WeeklyQuantBlock>
  );
}
