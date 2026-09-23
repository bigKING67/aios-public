import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyInlineSummaryProps {
  children: ReactNode;
}

export function WeeklyInlineSummary({ children }: WeeklyInlineSummaryProps) {
  return <p className={styles.inlineSummary}>{children}</p>;
}
