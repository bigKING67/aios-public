'use client';

import type { CreatorCooperationStatusRecord } from './creator-cooperation-status-badge';
import type { NumericInput } from './creator-formatters';
import {
  CreatorStatusTableDescriptionCell,
  CreatorStatusTableIdentityCells,
  type CreatorStatusTableIdentityRecord,
  CreatorStatusTableMetricCells,
  CreatorStatusTableStageCell,
} from './creator-status-table-cells';

export interface CreatorStatusTableRowRecord
  extends CreatorStatusTableIdentityRecord,
    CreatorCooperationStatusRecord {
  cooperation_desc: string | null;
}

export interface CreatorStatusTableRowMetrics {
  gmv: NumericInput;
  gsv: NumericInput;
  refundRate: NumericInput;
}

export interface CreatorStatusTableRowProps {
  record: CreatorStatusTableRowRecord;
  metrics?: CreatorStatusTableRowMetrics | null;
  normalizePlatform: (value: string | null) => string;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

export function CreatorStatusTableRow({
  record,
  metrics,
  normalizePlatform,
  resolveStageKey,
  formatDisplay,
}: CreatorStatusTableRowProps) {
  return (
    <tr>
      <CreatorStatusTableIdentityCells record={record} normalizePlatform={normalizePlatform} />
      <CreatorStatusTableStageCell
        record={record}
        resolveStageKey={resolveStageKey}
        formatDisplay={formatDisplay}
      />
      <CreatorStatusTableDescriptionCell value={record.cooperation_desc} />
      {metrics ? (
        <CreatorStatusTableMetricCells
          gmv={metrics.gmv}
          gsv={metrics.gsv}
          refundRate={metrics.refundRate}
        />
      ) : null}
    </tr>
  );
}
