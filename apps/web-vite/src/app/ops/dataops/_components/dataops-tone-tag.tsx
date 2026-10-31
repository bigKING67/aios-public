import type { ReactNode } from 'react';
import type { DataOpsTagTone } from './dataops-hub-constants';
import styles from './dataops-tone-tag.module.css';

export interface DataOpsToneTagProps {
  tone: DataOpsTagTone;
  children: ReactNode;
}

/** A status chip: the text carries the meaning, the tone colours it (`--aios-status-*`). */
export function DataOpsToneTag({ tone, children }: DataOpsToneTagProps) {
  return (
    <span className={styles.toneTag} data-tone={tone}>
      {children}
    </span>
  );
}
