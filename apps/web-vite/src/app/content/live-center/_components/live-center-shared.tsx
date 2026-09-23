import type { ReactNode } from 'react';
import styles from '../live-center.module.css';

export interface LiveCenterPlaybackState {
  segmentId: string;
  fileName: string;
  url: string;
  expiresAt: string;
  contentType: string | null;
  fileSizeBytes: number | null;
}

export function PanelHeader({
  description,
  extra,
  title,
}: {
  description?: string;
  extra?: ReactNode;
  title: string;
}) {
  return (
    <header className={styles.panelHeader}>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {extra ? <div className={styles.panelHeaderExtra}>{extra}</div> : null}
    </header>
  );
}

export function MetricCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.metricCell}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
