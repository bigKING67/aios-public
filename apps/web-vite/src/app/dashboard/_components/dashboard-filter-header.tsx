import { HomeOutlined } from '@ant-design/icons';
import { DatePicker, Segmented } from 'antd';
import datePickerZhCN from 'antd/es/date-picker/locale/zh_CN';
import type { Dayjs } from 'dayjs';
import { Link } from 'react-router-dom';

import {
  MAX_DASHBOARD_QUERY_DAYS,
  type DateMode,
  type PlatformTabKey,
} from './dashboard-config';
import type {
  DashboardAvailableDateBounds,
  DashboardDateBoundsStatus,
} from './dashboard-date-bounds-state';
import {
  BUSINESS_WEEK_LOCALE,
  WEEKDAY_LABELS_SUN_FIRST,
  getDateRangeDaySpan,
} from './dashboard-date-range';
import { useDashboardPlatformThumb } from './dashboard-platform-thumb-motion';
import brandStyles from './dashboard-filter-header-brand.module.css';
import filterStyles from './dashboard-filter-header-controls.module.css';
import homeEntryStyles from './dashboard-filter-header-home-entry.module.css';
import tabButtonStyles from './dashboard-filter-header-tab-button.module.css';
import tabStyles from './dashboard-filter-header-tabs.module.css';
import styles from './dashboard-filter-header.module.css';

const { RangePicker } = DatePicker;

const WEEK_PICKER_LOCALE = {
  ...datePickerZhCN,
  lang: {
    ...datePickerZhCN.lang,
    locale: BUSINESS_WEEK_LOCALE,
    shortWeekDays: WEEKDAY_LABELS_SUN_FIRST,
  },
};

type DashboardDatePickerPeriodUnit = 'week' | 'month' | 'year';

type DashboardFilterHeaderTab = {
  key: PlatformTabKey;
  label: string;
};

export type DashboardFilterHeaderProps = {
  activeTab: PlatformTabKey;
  allowedTabs: readonly PlatformTabKey[];
  visibleTabs: readonly DashboardFilterHeaderTab[];
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  dateBounds: DashboardAvailableDateBounds;
  isDateBoundsReady: boolean;
  dateBoundsStatus: DashboardDateBoundsStatus;
  onActiveTabChange: (tab: PlatformTabKey) => void;
  onDateModeChange: (mode: DateMode) => void;
  onDayValueChange: (value: Dayjs) => void;
  onWeekValueChange: (value: Dayjs) => void;
  onMonthValueChange: (value: Dayjs) => void;
  onYearValueChange: (value: Dayjs) => void;
  onCustomRangeChange: (range: [Dayjs, Dayjs]) => void;
  onCustomRangeLimitExceeded: (daySpan: number) => void;
};

export function DashboardFilterHeader({
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
}: DashboardFilterHeaderProps) {
  const disabledDayDate = (currentDate: Dayjs) => {
    const normalizedDate = currentDate.startOf('day');
    if (dateBounds.minDate && normalizedDate.isBefore(dateBounds.minDate, 'day')) {
      return true;
    }
    if (dateBounds.maxDate && normalizedDate.isAfter(dateBounds.maxDate, 'day')) {
      return true;
    }
    return false;
  };
  const isPeriodDisabled = (currentDate: Dayjs, unit: DashboardDatePickerPeriodUnit) => {
    const normalizedDate = currentDate.startOf('day');
    const periodStart = unit === 'week'
      ? normalizedDate.locale(BUSINESS_WEEK_LOCALE).startOf('week').startOf('day')
      : normalizedDate.startOf(unit).startOf('day');
    const periodEnd = unit === 'week'
      ? normalizedDate.locale(BUSINESS_WEEK_LOCALE).endOf('week').startOf('day')
      : normalizedDate.endOf(unit).startOf('day');

    if (dateBounds.minDate && periodEnd.isBefore(dateBounds.minDate, 'day')) {
      return true;
    }
    if (dateBounds.maxDate && periodStart.isAfter(dateBounds.maxDate, 'day')) {
      return true;
    }
    return false;
  };
  const dateBoundsStatusText =
    dateBoundsStatus === 'loading'
      ? '正在校准数据日期...'
      : dateBoundsStatus === 'empty'
        ? '当前维度暂无可用数据日期'
        : dateBoundsStatus === 'error'
          ? '数据日期范围加载失败'
          : null;
  const {
    platformRailRef,
    platformThumbRef,
    platformRailStyle,
    registerPlatformButton,
    isPlatformThumbReady,
  } = useDashboardPlatformThumb({ activeTab, visibleTabs });

  const platformRailClassName = [
    tabStyles.tabRail,
    isPlatformThumbReady ? tabStyles.tabRailMotionReady : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={styles.topBarDock}>
      <div className={styles.topBar}>
        <div className={brandStyles.brandBlock}>
          <Link
            to="/"
            className={homeEntryStyles.homeEntryLink}
            aria-label="返回首页"
            title="返回首页"
          >
            <HomeOutlined className={homeEntryStyles.homeEntryIcon} />
          </Link>
          <div className={brandStyles.brand}>Groland Dashboard</div>
        </div>
        <nav
          ref={platformRailRef}
          className={platformRailClassName}
          style={platformRailStyle}
          aria-label="平台切换"
        >
          <span ref={platformThumbRef} className={tabStyles.tabRailThumb} aria-hidden="true" />
          {visibleTabs.map((item) => {
            const isActive = item.key === activeTab;
            return (
              <button
                key={item.key}
                ref={registerPlatformButton(item.key)}
                type="button"
                className={[
                  tabButtonStyles.tabButton,
                  isActive ? tabButtonStyles.tabButtonActive : undefined,
                  isActive && isPlatformThumbReady ? tabButtonStyles.tabButtonActiveWithThumb : undefined,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (!allowedTabs.includes(item.key)) {
                    return;
                  }
                  onActiveTabChange(item.key);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className={filterStyles.filters}>
          <Segmented<DateMode>
            className={filterStyles.dateModeSegmented}
            name="dashboard-date-mode"
            value={dateMode}
            onChange={(value) => onDateModeChange(value)}
            options={[
              { label: '月', value: 'month' },
              { label: '周', value: 'week' },
              { label: '日', value: 'day' },
              { label: '年', value: 'year' },
              { label: '自定义', value: 'custom' },
            ]}
          />

          <div className={filterStyles.pickerShell}>
            {dateMode === 'day' ? (
              <DatePicker
                value={dayValue}
                onChange={(value) => {
                  if (value) {
                    onDayValueChange(value);
                  }
                }}
                allowClear={false}
                format="YYYY/MM/DD"
                disabled={!isDateBoundsReady}
                disabledDate={disabledDayDate}
              />
            ) : null}

            {dateMode === 'week' ? (
              <DatePicker
                picker="week"
                value={weekValue}
                locale={WEEK_PICKER_LOCALE}
                onChange={(value) => {
                  if (value) {
                    onWeekValueChange(value);
                  }
                }}
                allowClear={false}
                format="YYYY年WW周"
                disabled={!isDateBoundsReady}
                disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'week')}
              />
            ) : null}

            {dateMode === 'month' ? (
              <DatePicker
                picker="month"
                value={monthValue}
                onChange={(value) => {
                  if (value) {
                    onMonthValueChange(value);
                  }
                }}
                allowClear={false}
                format="YYYY/MM"
                disabled={!isDateBoundsReady}
                disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'month')}
              />
            ) : null}

            {dateMode === 'year' ? (
              <DatePicker
                picker="year"
                value={yearValue}
                onChange={(value) => {
                  if (value) {
                    onYearValueChange(value);
                  }
                }}
                allowClear={false}
                format="YYYY"
                disabled={!isDateBoundsReady}
                disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'year')}
              />
            ) : null}

            {dateMode === 'custom' ? (
              <RangePicker
                value={customRange}
                allowClear={false}
                format="YYYY/MM/DD"
                disabled={!isDateBoundsReady}
                disabledDate={disabledDayDate}
                onChange={(value) => {
                  const nextStart = value?.[0];
                  const nextEnd = value?.[1];
                  if (!nextStart || !nextEnd) {
                    return;
                  }
                  const normalizedRange: [Dayjs, Dayjs] = [
                    nextStart.startOf('day'),
                    nextEnd.startOf('day'),
                  ];
                  const daySpan = getDateRangeDaySpan(normalizedRange[0], normalizedRange[1]);
                  if (daySpan > MAX_DASHBOARD_QUERY_DAYS) {
                    onCustomRangeLimitExceeded(daySpan);
                    return;
                  }
                  onCustomRangeChange(normalizedRange);
                }}
              />
            ) : null}
          </div>
          {dateBoundsStatusText ? (
            <span className={filterStyles.dateBoundsStatus} role="status">
              {dateBoundsStatusText}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
