import type { ReactNode } from 'react';
import type { Dayjs } from 'dayjs';

import type { DateMode, PlatformTabKey } from './dashboard-config';
import { DashboardDimensionContent } from './dashboard-dimension-content';
import type {
  DashboardDimensionContentKind,
  DashboardDimensionNavItem,
} from './dashboard-dimension-content';
import { DashboardFilterHeader } from './dashboard-filter-header';
import styles from './dashboard-page-shell.module.css';
import type { DashboardDimension } from './dashboard-config';
import type {
  DashboardAvailableDateBounds,
  DashboardDateBoundsStatus,
} from './dashboard-date-bounds-state';

export type DashboardPageShellProps = {
  messageContextHolder: ReactNode;
  activeTab: PlatformTabKey;
  allowedTabs: readonly PlatformTabKey[];
  visibleTabs: readonly { key: PlatformTabKey; label: string }[];
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  dateBounds: DashboardAvailableDateBounds;
  isDateBoundsReady: boolean;
  dateBoundsStatus: DashboardDateBoundsStatus;
  onActiveTabChange: (value: PlatformTabKey) => void;
  onDateModeChange: (value: DateMode) => void;
  onDayValueChange: (value: Dayjs) => void;
  onWeekValueChange: (value: Dayjs) => void;
  onMonthValueChange: (value: Dayjs) => void;
  onYearValueChange: (value: Dayjs) => void;
  onCustomRangeChange: (value: [Dayjs, Dayjs]) => void;
  onCustomRangeLimitExceeded: (daySpan: number) => void;
  isOverviewTab: boolean;
  activeDimension: DashboardDimension;
  effectiveDimension: DashboardDimension;
  activeDimensionItems: DashboardDimensionNavItem[];
  dimensionContentKind: DashboardDimensionContentKind;
  dimensionContent: ReactNode;
  onDimensionChange: (dimension: DashboardDimension) => void;
};

export function DashboardPageShell({
  messageContextHolder,
  activeTab,
  allowedTabs,
  visibleTabs,
  dateMode,
  dayValue,
  weekValue,
  monthValue,
  yearValue,
  customRange,
  dateBounds,
  isDateBoundsReady,
  dateBoundsStatus,
  onActiveTabChange,
  onDateModeChange,
  onDayValueChange,
  onWeekValueChange,
  onMonthValueChange,
  onYearValueChange,
  onCustomRangeChange,
  onCustomRangeLimitExceeded,
  isOverviewTab,
  activeDimension,
  effectiveDimension,
  activeDimensionItems,
  dimensionContentKind,
  dimensionContent,
  onDimensionChange,
}: DashboardPageShellProps) {
  return (
    <div className={styles.pageRoot}>
      <div className={styles.backdropGlow} aria-hidden />
      <div className={styles.surface}>
        {messageContextHolder}
        <DashboardFilterHeader
          activeTab={activeTab}
          allowedTabs={allowedTabs}
          visibleTabs={visibleTabs}
          dateMode={dateMode}
          dayValue={dayValue}
          weekValue={weekValue}
          monthValue={monthValue}
          yearValue={yearValue}
          customRange={customRange}
          dateBounds={dateBounds}
          isDateBoundsReady={isDateBoundsReady}
          dateBoundsStatus={dateBoundsStatus}
          onActiveTabChange={onActiveTabChange}
          onDateModeChange={onDateModeChange}
          onDayValueChange={onDayValueChange}
          onWeekValueChange={onWeekValueChange}
          onMonthValueChange={onMonthValueChange}
          onYearValueChange={onYearValueChange}
          onCustomRangeChange={onCustomRangeChange}
          onCustomRangeLimitExceeded={onCustomRangeLimitExceeded}
        />

        <DashboardDimensionContent
          isOverviewTab={isOverviewTab}
          activeDimension={activeDimension}
          effectiveDimension={effectiveDimension}
          activeDimensionItems={activeDimensionItems}
          contentKind={dimensionContentKind}
          dimensionContent={dimensionContent}
          onDimensionChange={onDimensionChange}
        />
      </div>
    </div>
  );
}
