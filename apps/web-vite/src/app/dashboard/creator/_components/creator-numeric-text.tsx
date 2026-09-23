'use client';

import styles from './creator-live-dashboard.module.css';

export interface CreatorNumericTextProps {
  value?: string | null;
}

export function CreatorNumericText({ value }: CreatorNumericTextProps) {
  if (!value) {
    return '--';
  }

  return <span className={styles.numericValueText}>{value}</span>;
}
