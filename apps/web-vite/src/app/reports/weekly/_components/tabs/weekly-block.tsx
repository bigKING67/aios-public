import type { ReactNode } from 'react';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-modern.module.css';

export interface WeeklyBlockProps {
  children: ReactNode;
  className?: string;
}

export function WeeklyBlock({ children, className }: WeeklyBlockProps) {
  const blockClassName = mergeWeeklyClassNames(styles.block, className);

  return <section className={blockClassName}>{children}</section>;
}
