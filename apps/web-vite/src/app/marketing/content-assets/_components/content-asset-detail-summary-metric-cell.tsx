import type { ReactNode } from 'react';

import workbenchStyles from './content-assets-detail-workbench.module.css';

export function DetailSummaryMetricCell({ label, value }: { label: string; value: ReactNode }) {
  const title = typeof value === 'string' ? value : undefined;

  return (
    <div className={workbenchStyles.metricCell}>
      <span>{label}</span>
      <strong title={title}>{value}</strong>
    </div>
  );
}
