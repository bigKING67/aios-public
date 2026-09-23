import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyPageStackProps {
  children: ReactNode;
}

export function WeeklyPageStack({ children }: WeeklyPageStackProps) {
  return <div className={styles.pageStack}>{children}</div>;
}
