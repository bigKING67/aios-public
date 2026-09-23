'use client';

import styles from './creator-live-dashboard.module.css';

export interface CreatorIdTextProps {
  value?: string | null;
}

export function CreatorIdText({ value }: CreatorIdTextProps) {
  if (!value) {
    return '--';
  }

  return <span className={styles.idMonoText}>{value}</span>;
}
