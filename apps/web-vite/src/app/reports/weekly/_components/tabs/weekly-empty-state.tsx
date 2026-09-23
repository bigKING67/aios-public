import { Empty } from 'antd';
import { WeeklyBlockDescription } from './weekly-text';
import styles from './weekly-modern.module.css';

export interface WeeklyEmptyStateProps {
  description: string;
}

export function WeeklyEmptyState({ description }: WeeklyEmptyStateProps) {
  return (
    <div className={styles.emptyStateCard}>
      <Empty description={description} />
    </div>
  );
}

export function WeeklyTextEmptyState({ description }: WeeklyEmptyStateProps) {
  return (
    <div className={styles.emptyStateCard}>
      <WeeklyBlockDescription>{description}</WeeklyBlockDescription>
    </div>
  );
}
