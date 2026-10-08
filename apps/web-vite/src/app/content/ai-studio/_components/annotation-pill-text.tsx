import type { AssetCardPill } from '@/app/marketing/content-assets/_components/content-assets-asset-intelligence';
import styles from './annotation-pill-text.module.css';

/** Compact text form of annotation pills for table cells. */
export function AnnotationPillText({ pills }: { pills: readonly AssetCardPill[] }) {
  return (
    <span className={styles.pills}>
      {pills.map((pill) => (
        <span
          key={pill.label}
          className={`${styles.pill} ${pill.state === 'active' ? styles.active : pill.state === 'ready' ? styles.ready : ''}`}
        >
          {pill.label}
        </span>
      ))}
    </span>
  );
}
