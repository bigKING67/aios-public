'use client';

import styles from './creator-status.module.css';

export interface CreatorCooperationStatusRecord {
  cooperation_status: string | null;
  cooperation_status_norm: string;
}

export type CreatorCooperationStatusDisplayOrder = 'raw-first' | 'normalized-first';

export interface CreatorCooperationStatusBadgeProps {
  record: CreatorCooperationStatusRecord;
  displayOrder?: CreatorCooperationStatusDisplayOrder;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

function resolveDisplaySource(
  record: CreatorCooperationStatusRecord,
  displayOrder: CreatorCooperationStatusDisplayOrder
): string | null {
  if (displayOrder === 'normalized-first') {
    return record.cooperation_status_norm || record.cooperation_status;
  }

  return record.cooperation_status || record.cooperation_status_norm;
}

export function CreatorCooperationStatusBadge({
  record,
  displayOrder = 'raw-first',
  resolveStageKey,
  formatDisplay,
}: CreatorCooperationStatusBadgeProps) {
  const displaySource = resolveDisplaySource(record, displayOrder);

  return (
    <span
      className={styles.statusBadge}
      data-stage={resolveStageKey(record.cooperation_status_norm, record.cooperation_status)}
    >
      {formatDisplay(displaySource)}
    </span>
  );
}
