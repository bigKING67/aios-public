import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyBlockHeaderProps {
  children: ReactNode;
  className?: string;
}

export function WeeklyBlockHeader({
  children,
  className,
}: WeeklyBlockHeaderProps) {
  const headerClassName = className
    ? `${styles.blockHeader} ${className}`
    : styles.blockHeader;

  return <header className={headerClassName}>{children}</header>;
}

export interface WeeklyBlockDescriptionProps {
  children: ReactNode;
}

export function WeeklyBlockDescription({
  children,
}: WeeklyBlockDescriptionProps) {
  return <p className={styles.blockDescription}>{children}</p>;
}
