import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';

export interface PlatformTabProps {
  report: WeeklyReportResponse;
  platform: string;
}

export interface TrendMetricDefinition {
  key: 'gmv' | 'orders' | 'uv';
  label: string;
}
