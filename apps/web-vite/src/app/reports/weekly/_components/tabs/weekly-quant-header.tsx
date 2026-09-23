import type { ReactNode } from 'react';
import { WeeklyBlockDescription, WeeklyBlockHeader } from './weekly-text';
import styles from './weekly-modern.module.css';

export interface WeeklyQuantBlockProps {
  children: ReactNode;
}

export function WeeklyQuantBlock({ children }: WeeklyQuantBlockProps) {
  return <div className={styles.quantBlock}>{children}</div>;
}

export interface WeeklyQuantHeaderProps {
  title: ReactNode;
  description: ReactNode;
}

export function WeeklyQuantHeader({
  title,
  description,
}: WeeklyQuantHeaderProps) {
  return (
    <WeeklyBlockHeader>
      <h3 className={styles.quantTitle}>{title}</h3>
      <WeeklyBlockDescription>{description}</WeeklyBlockDescription>
    </WeeklyBlockHeader>
  );
}
