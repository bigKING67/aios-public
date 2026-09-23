import { FunnelChart } from '@/components/organisms/funnel-chart';
import type { FunnelChartProps } from '@/components/organisms/funnel-chart';
import styles from './weekly-modern.module.css';

export type WeeklyFunnelChartProps = Omit<
  FunnelChartProps,
  'className' | 'height'
> & {
  height?: number;
};

export function WeeklyFunnelChart({
  height = 360,
  ...props
}: WeeklyFunnelChartProps) {
  return (
    <FunnelChart
      {...props}
      className={styles.funnelChartCanvas}
      height={height}
    />
  );
}
