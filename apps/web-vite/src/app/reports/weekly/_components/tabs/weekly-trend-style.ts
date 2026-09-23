import styles from './weekly-modern.module.css';

export type WeeklyTrendZeroMode = 'up' | 'neutral';

export function resolveWeeklyTrendClassName(
  value: number | undefined,
  zeroMode: WeeklyTrendZeroMode = 'neutral'
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return styles.trendNeutral;
  }

  if (Math.abs(value) < Number.EPSILON) {
    return zeroMode === 'up' ? styles.trendUp : styles.trendNeutral;
  }

  return value > 0 ? styles.trendUp : styles.trendDown;
}
