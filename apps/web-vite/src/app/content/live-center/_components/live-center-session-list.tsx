import type { KeyboardEvent } from 'react';
import type { Dayjs } from 'dayjs';
import { Alert, Button, DatePicker, Empty, Input, Pagination, Segmented } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  LIVE_CENTER_DATE_MODE_OPTIONS,
  LIVE_CENTER_DATE_PICKER_LOCALE,
  LIVE_CENTER_WEEK_LOCALE,
  type LiveCenterAvailableDateBounds,
  type LiveCenterDateBoundsStatus,
  type LiveCenterDateMode,
  type LiveCenterDateRangeValue,
} from '../_lib/live-center-date-range';
import type { LiveCenterSession } from '../_lib/live-center-types';
import filterStyles from '../live-center-filters.module.css';
import styles from '../live-center.module.css';
import { LiveCenterSessionListItem } from './live-center-session-list-item';

const { RangePicker } = DatePicker;

type LiveCenterDatePickerPeriodUnit = 'week' | 'month' | 'year';

export function LiveCenterSessionFilters({
  availableDateBounds,
  classNames,
  customRange,
  dateBoundsStatus,
  dateMode,
  dayValue,
  isDateBoundsReady,
  keywordInput,
  monthValue,
  weekValue,
  yearValue,
  onApplySearch,
  onCustomRangeChange,
  onDateModeChange,
  onDayValueChange,
  onKeywordInputChange,
  onMonthValueChange,
  onResetFilters,
  onWeekValueChange,
  onYearValueChange,
}: {
  availableDateBounds: LiveCenterAvailableDateBounds;
  classNames?: {
    actions?: string;
    controls?: string;
    root?: string;
  };
  customRange: LiveCenterDateRangeValue;
  dateBoundsStatus: LiveCenterDateBoundsStatus;
  dateMode: LiveCenterDateMode;
  dayValue: Dayjs;
  isDateBoundsReady: boolean;
  keywordInput: string;
  monthValue: Dayjs;
  weekValue: Dayjs;
  yearValue: Dayjs;
  onApplySearch: () => void;
  onCustomRangeChange: (value: LiveCenterDateRangeValue) => void;
  onDateModeChange: (value: LiveCenterDateMode) => void;
  onDayValueChange: (value: Dayjs) => void;
  onKeywordInputChange: (value: string) => void;
  onMonthValueChange: (value: Dayjs) => void;
  onResetFilters: () => void;
  onWeekValueChange: (value: Dayjs) => void;
  onYearValueChange: (value: Dayjs) => void;
}) {
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onApplySearch();
    }
  };

  const disabledDayDate = (currentDate: Dayjs) => {
    const normalizedDate = currentDate.startOf('day');
    if (availableDateBounds.minDate && normalizedDate.isBefore(availableDateBounds.minDate, 'day')) {
      return true;
    }
    if (availableDateBounds.maxDate && normalizedDate.isAfter(availableDateBounds.maxDate, 'day')) {
      return true;
    }
    return false;
  };

  const isPeriodDisabled = (currentDate: Dayjs, unit: LiveCenterDatePickerPeriodUnit) => {
    const normalizedDate = currentDate.startOf('day');
    const periodStart = unit === 'week'
      ? normalizedDate.locale(LIVE_CENTER_WEEK_LOCALE).startOf('week').startOf('day')
      : normalizedDate.startOf(unit).startOf('day');
    const periodEnd = unit === 'week'
      ? normalizedDate.locale(LIVE_CENTER_WEEK_LOCALE).endOf('week').startOf('day')
      : normalizedDate.endOf(unit).startOf('day');

    if (availableDateBounds.minDate && periodEnd.isBefore(availableDateBounds.minDate, 'day')) {
      return true;
    }
    if (availableDateBounds.maxDate && periodStart.isAfter(availableDateBounds.maxDate, 'day')) {
      return true;
    }
    return false;
  };

  const dateBoundsStatusText =
    dateBoundsStatus === 'loading'
      ? '正在校准直播日期...'
      : dateBoundsStatus === 'empty'
        ? '当前暂无可用直播日期'
        : dateBoundsStatus === 'error'
          ? '直播日期范围加载失败'
          : null;

  const handleCustomRangePickerChange = (value: [Dayjs | null, Dayjs | null] | null) => {
    const nextStart = value?.[0]?.startOf('day') ?? null;
    const nextEnd = value?.[1]?.startOf('day') ?? null;
    if (!nextStart || !nextEnd || nextStart.isAfter(nextEnd, 'day')) {
      return;
    }
    onCustomRangeChange([nextStart, nextEnd]);
  };

  return (
    <section className={mergeClassNames(filterStyles.filterPanel, classNames?.root)}>
      <div className={mergeClassNames(filterStyles.filterControls, classNames?.controls)}>
        <Input
          allowClear
          aria-label="搜索直播场次"
          className={filterStyles.searchInput}
          prefix={<SearchOutlined />}
          placeholder="搜索主播、店铺或场次"
          value={keywordInput}
          onChange={(event) => onKeywordInputChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <div className={filterStyles.dateRangeControl} data-date-mode={dateMode}>
          <Segmented<LiveCenterDateMode>
            aria-label="直播日期维度"
            className={filterStyles.datePresetRail}
            name="live-center-date-mode"
            options={[...LIVE_CENTER_DATE_MODE_OPTIONS]}
            value={dateMode}
            onChange={onDateModeChange}
          />
          <div className={filterStyles.dateRangePickerShell}>
            {dateMode === 'day' ? (
              <DatePicker
                allowClear={false}
                aria-label="筛选直播日期"
                className={filterStyles.dateRangePicker}
                disabled={!isDateBoundsReady}
                disabledDate={disabledDayDate}
                format="YYYY/MM/DD"
                locale={LIVE_CENTER_DATE_PICKER_LOCALE}
                popupClassName={filterStyles.liveCenterDatePickerPopup}
                value={dayValue}
                onChange={(value) => {
                  if (value) {
                    onDayValueChange(value.startOf('day'));
                  }
                }}
              />
            ) : null}
            {dateMode === 'week' ? (
              <DatePicker
                allowClear={false}
                aria-label="筛选直播周"
                className={filterStyles.dateRangePicker}
                disabled={!isDateBoundsReady}
                disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'week')}
                format="YYYY年WW周"
                locale={LIVE_CENTER_DATE_PICKER_LOCALE}
                picker="week"
                popupClassName={filterStyles.liveCenterDatePickerPopup}
                value={weekValue}
                onChange={(value) => {
                  if (value) {
                    onWeekValueChange(value.locale(LIVE_CENTER_WEEK_LOCALE));
                  }
                }}
              />
            ) : null}
            {dateMode === 'month' ? (
              <DatePicker
                allowClear={false}
                aria-label="筛选直播月份"
                className={filterStyles.dateRangePicker}
                disabled={!isDateBoundsReady}
                disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'month')}
                format="YYYY/MM"
                locale={LIVE_CENTER_DATE_PICKER_LOCALE}
                picker="month"
                popupClassName={filterStyles.liveCenterDatePickerPopup}
                value={monthValue}
                onChange={(value) => {
                  if (value) {
                    onMonthValueChange(value.startOf('month'));
                  }
                }}
              />
            ) : null}
            {dateMode === 'year' ? (
              <DatePicker
                allowClear={false}
                aria-label="筛选直播年份"
                className={filterStyles.dateRangePicker}
                disabled={!isDateBoundsReady}
                disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'year')}
                format="YYYY"
                locale={LIVE_CENTER_DATE_PICKER_LOCALE}
                picker="year"
                popupClassName={filterStyles.liveCenterDatePickerPopup}
                value={yearValue}
                onChange={(value) => {
                  if (value) {
                    onYearValueChange(value.startOf('year'));
                  }
                }}
              />
            ) : null}
            {dateMode === 'custom' ? (
              <RangePicker
                allowClear={false}
                aria-label="自定义筛选直播日期范围"
                className={filterStyles.dateRangePicker}
                disabled={!isDateBoundsReady}
                disabledDate={disabledDayDate}
                format="YYYY/MM/DD"
                locale={LIVE_CENTER_DATE_PICKER_LOCALE}
                placeholder={['开始日期', '结束日期']}
                popupClassName={filterStyles.liveCenterDatePickerPopup}
                separator="→"
                value={customRange}
                onChange={handleCustomRangePickerChange}
              />
            ) : null}
          </div>
          {dateBoundsStatusText ? (
            <span className={filterStyles.dateBoundsStatus} role="status">
              {dateBoundsStatusText}
            </span>
          ) : null}
        </div>
        <div className={mergeClassNames(filterStyles.filterActions, classNames?.actions)}>
          <Button
            aria-label="搜索直播场次"
            type="primary"
            icon={<SearchOutlined />}
            title="搜索直播场次"
            onClick={onApplySearch}
          >
            搜索
          </Button>
          <Button onClick={onResetFilters}>重置</Button>
        </div>
      </div>
    </section>
  );
}

export function LiveCenterSessionListPanel({
  classNames,
  currentPage,
  currentPageSize,
  hasInitialListError,
  isFetching,
  isLoading,
  sessions,
  sessionsError,
  selectedSessionId,
  showSessionEmpty,
  totalSessions,
  onPageChange,
  onRetry,
  onSelectSession,
}: {
  classNames?: {
    list?: string;
    pagination?: string;
    root?: string;
  };
  currentPage: number;
  currentPageSize: number;
  hasInitialListError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  sessions: LiveCenterSession[];
  sessionsError: unknown;
  selectedSessionId: string | null;
  showSessionEmpty: boolean;
  totalSessions: number;
  onPageChange: (page: number, pageSize: number) => void;
  onRetry: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  return (
    <section className={mergeClassNames(styles.sessionPanel, classNames?.root)}>
      <header className={styles.sessionQueueHeader}>
        <strong>直播场次</strong>
        <span>Groland 自播</span>
      </header>
      {hasInitialListError ? (
        <Alert
          className={styles.listError}
          type="error"
          showIcon
          message="场次列表加载失败"
          description={resolveClientErrorMessage(sessionsError, '请稍后重试或联系管理员。')}
          action={(
            <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
              重试列表
            </Button>
          )}
        />
      ) : showSessionEmpty ? (
        <Empty
          className={styles.emptyBlock}
          description="当前筛选暂无 Groland 自播场次。"
        />
      ) : (
        <div
          aria-busy={isLoading || isFetching}
          className={mergeClassNames(styles.sessionQueueList, classNames?.list)}
        >
          {isLoading && sessions.length === 0 ? (
            <div className={styles.sessionQueueLoading}>加载直播场次中...</div>
          ) : (
            <div className={styles.sessionQueueItems} role="list">
              {sessions.map((session) => (
                <LiveCenterSessionListItem
                  key={session.sessionId}
                  isSelected={session.sessionId === selectedSessionId}
                  session={session}
                  onSelectSession={onSelectSession}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {!hasInitialListError ? (
        <div className={mergeClassNames(styles.paginationWrap, classNames?.pagination)}>
          <Pagination
            current={currentPage}
            pageSize={currentPageSize}
            responsive
            size="small"
            showLessItems
            total={totalSessions}
            showSizeChanger={false}
            onChange={onPageChange}
          />
        </div>
      ) : null}
    </section>
  );
}

function mergeClassNames(...classNames: Array<string | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}
