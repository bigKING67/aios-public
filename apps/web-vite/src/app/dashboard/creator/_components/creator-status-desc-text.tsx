'use client';

import styles from './creator-status.module.css';

export interface CreatorStatusDescTextProps {
  value?: string | null;
  preserveEmptyContainer?: boolean;
}

export function CreatorStatusDescText({ value, preserveEmptyContainer }: CreatorStatusDescTextProps) {
  if (!value && !preserveEmptyContainer) {
    return '--';
  }

  return (
    <span className={styles.statusDescText} title={value || undefined}>
      {value || '--'}
    </span>
  );
}
