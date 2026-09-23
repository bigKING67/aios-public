import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyPriorityTagProps {
  children: ReactNode;
}

export function WeeklyPriorityTag({ children }: WeeklyPriorityTagProps) {
  return <span className={styles.priorityTag}>{children}</span>;
}
