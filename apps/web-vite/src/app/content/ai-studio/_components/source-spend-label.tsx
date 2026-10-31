import { Badge, type BadgeStatus } from '@/components/atoms/badge';
import {
  readSourceSpendClass,
  sourceSpendCoverage,
  sourceSpendLabel,
  type SourceSpendSnapshot,
} from '../_lib/source-spend';
import styles from './source-spend-label.module.css';

const TONES: Record<'qualified' | 'low' | 'unknown', BadgeStatus> = {
  qualified: 'success',
  low: 'warning',
  unknown: 'neutral',
};

/** Source original's admission class, with explicit partial-window coverage. */
export function SourceSpendLabel({ spend, compact = false }: { spend?: SourceSpendSnapshot | null; compact?: boolean }) {
  const classification = readSourceSpendClass(spend?.class) ?? 'unknown';
  const coverage = sourceSpendCoverage(spend, compact);
  return (
    <span className={`${styles.stack} ${compact ? styles.compact : ''}`}>
      <Badge className={styles.label} status={TONES[classification]}>{sourceSpendLabel(spend)}</Badge>
      {coverage ? <span className={styles.coverage}>{coverage}</span> : null}
    </span>
  );
}
