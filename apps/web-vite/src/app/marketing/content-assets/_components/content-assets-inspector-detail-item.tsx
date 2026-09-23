import type { ReactNode } from 'react';
import styles from '../content-assets.module.css';

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.detailItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
