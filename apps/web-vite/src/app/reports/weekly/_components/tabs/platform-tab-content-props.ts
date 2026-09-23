import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import type { PlatformTabColumns } from './platform-tab-columns';
import type { PlatformTabViewModel } from './platform-tab-view-model';

export interface PlatformTabContentProps {
  isMobile: boolean;
  report: WeeklyReportResponse;
  platformLabel: string;
  summaryWeekPeriod: string | undefined;
  isTmallPlatform: boolean;
  isDouyinPlatform: boolean;
  columns: PlatformTabColumns;
  viewModel: PlatformTabViewModel;
}
