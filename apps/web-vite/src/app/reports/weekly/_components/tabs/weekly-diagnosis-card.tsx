import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyDiagnosisItem {
  key: string;
  reason: ReactNode;
  action: ReactNode;
}

export interface WeeklyDiagnosisCardProps {
  title: ReactNode;
  items: WeeklyDiagnosisItem[];
}

export function WeeklyDiagnosisCard({
  title,
  items,
}: WeeklyDiagnosisCardProps) {
  return (
    <article className={styles.diagnosisCard}>
      <h3 className={styles.diagnosisTitle}>{title}</h3>
      <ul className={styles.diagnosisList}>
        {items.map((item) => (
          <li key={item.key} className={styles.diagnosisItem}>
            <p className={styles.diagnosisReason}>{item.reason}</p>
            <p className={styles.diagnosisAction}>{item.action}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}
