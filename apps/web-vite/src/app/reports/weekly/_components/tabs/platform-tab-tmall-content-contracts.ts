import type { WeeklySummaryCardProps } from '@/components/organisms/weekly-summary-card';
import type {
  TmallAttributionSectionPropsBundle,
} from './platform-tab-tmall-attribution-section-contracts';

export interface TmallPlatformContentProps {
  summaryCardProps: WeeklySummaryCardProps;
  attributionSectionProps: TmallAttributionSectionPropsBundle;
}
