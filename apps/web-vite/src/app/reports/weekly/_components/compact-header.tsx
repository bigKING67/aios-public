'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Button, DatePicker, message } from 'antd';
import datePickerZhCN from 'antd/es/date-picker/locale/zh_CN';
import { DownloadOutlined, HomeOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import zhCnDayjsLocale from 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Link } from 'react-router-dom';
import { useWeeklyPeriods } from '@/hooks/use-weekly-periods';
import { usePermission } from '@/hooks/use-permission';
import { REPORT_EXPORT_PERMISSIONS } from '@/lib/report-permissions';
import styles from './weekly-report-shell.module.css';

interface CompactHeaderProps {
  weekPeriod?: string;
  onWeekPeriodChange?: (period: string) => void;
  middleContent?: ReactNode;
  className?: string;
}

const BUSINESS_WEEK_LOCALE = 'zh-cn-business-week';
const WEEKDAY_LABELS_SUN_FIRST = ['日', '一', '二', '三', '四', '五', '六'];

dayjs.extend(isoWeek);
dayjs.locale(
  {
    ...zhCnDayjsLocale,
    name: BUSINESS_WEEK_LOCALE,
    weekStart: 6,
    weekdaysMin: WEEKDAY_LABELS_SUN_FIRST,
  },
  undefined,
  true
);

const WEEK_PICKER_LOCALE = {
  ...datePickerZhCN,
  lang: {
    ...datePickerZhCN.lang,
    locale: BUSINESS_WEEK_LOCALE,
    shortWeekDays: WEEKDAY_LABELS_SUN_FIRST,
  },
};

type ParsedPeriod = {
  value: string;
  start: Dayjs;
  end: Dayjs;
};

function parsePeriodDate(value: string): Dayjs | null {
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsed = dayjs(new Date(year, month - 1, day)).startOf('day');
  return parsed.isValid() ? parsed : null;
}

function normalizeWeekPeriod(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/～/g, '~').replace(/\s+/g, '');
  if (!normalized.includes('~')) {
    return undefined;
  }
  return normalized;
}

function parseWeekPeriod(value?: string): ParsedPeriod | null {
  const normalized = normalizeWeekPeriod(value);
  if (!normalized) {
    return null;
  }

  const [rawStart, rawEnd] = normalized.split('~');
  if (!rawStart || !rawEnd) {
    return null;
  }

  const start = parsePeriodDate(rawStart);
  const end = parsePeriodDate(rawEnd);
  if (!start || !end) {
    return null;
  }

  return {
    value: normalized,
    start,
    end,
  };
}

function toWeekPeriodByStart(start: Dayjs): string {
  const normalizedStart = start.startOf('day');
  const end = normalizedStart.add(6, 'day');
  return `${normalizedStart.year()}/${normalizedStart.month() + 1}/${normalizedStart.date()}~${end.year()}/${
    end.month() + 1
  }/${end.date()}`;
}

/**
 * 紧凑水平 Header 组件 - 新设计系统
 *
 * 设计：
 * - 背景：var(--bg-card)
 * - 下边界：var(--border-color)
 * - 文字色：var(--text-primary)
 * - 高度：48-56px
 *
 * 布局：左侧品牌 | 右侧操作区（周选择 + PDF导出）
 */
export function CompactHeader({
  weekPeriod,
  onWeekPeriodChange,
  middleContent,
  className,
}: CompactHeaderProps) {
  const { data: periodOptions = [], isLoading: loadingPeriods } = useWeeklyPeriods();
  const canExportReport = usePermission(REPORT_EXPORT_PERMISSIONS, 'any');
  const parsedPeriods = useMemo(() => {
    return periodOptions
      .map((item) => parseWeekPeriod(item.value))
      .filter((item): item is ParsedPeriod => Boolean(item))
      .sort((left, right) => left.start.valueOf() - right.start.valueOf());
  }, [periodOptions]);

  const weekPickerValue = useMemo(() => {
    const parsed = parseWeekPeriod(weekPeriod);
    if (!parsed) {
      return null;
    }
    return parsed.start.locale(BUSINESS_WEEK_LOCALE);
  }, [weekPeriod]);

  const handleExportPDF = () => {
    message.info('PDF 导出功能开发中...');
  };

  const handleWeekChange = (value: Dayjs | null) => {
    if (!value || !onWeekPeriodChange) {
      return;
    }

    const selectedWeekStart = value.locale(BUSINESS_WEEK_LOCALE).startOf('week').startOf('day');
    const selectedTs = selectedWeekStart.valueOf();
    const matchedByRange = parsedPeriods.find((item) => {
      const startTs = item.start.valueOf();
      const endTs = item.end.valueOf();
      return selectedTs >= startTs && selectedTs <= endTs;
    });
    if (matchedByRange) {
      onWeekPeriodChange(matchedByRange.value);
      return;
    }

    if (parsedPeriods.length > 0) {
      const nearest = parsedPeriods.reduce((best, item) => {
        if (!best) {
          return item;
        }
        const bestDistance = Math.abs(best.start.valueOf() - selectedWeekStart.valueOf());
        const currentDistance = Math.abs(item.start.valueOf() - selectedWeekStart.valueOf());
        return currentDistance < bestDistance ? item : best;
      }, parsedPeriods[0]);
      onWeekPeriodChange(nearest.value);
      return;
    }

    onWeekPeriodChange(toWeekPeriodByStart(selectedWeekStart));
  };

  return (
    <div
      className={`compact-header ${styles.compactHeader}${className ? ` ${className}` : ''}`}
    >
      {/* 左侧：品牌区 */}
      <div
        className={`compact-header-brand-wrap ${styles.brandWrap}`}
      >
        <span>Groland Weekly Update</span>
        <Link
          to="/"
          className="compact-header-home-entry"
          aria-label="返回首页"
          title="返回首页"
        >
          <HomeOutlined className="compact-header-home-entry-icon" />
        </Link>
      </div>

      {/* 中部：导航区（用于承载周报 Tab） */}
      <div
        className={`compact-header-middle ${styles.middle}`}
      >
        {middleContent}
      </div>

      {/* 右侧：周期选择 + 导出 */}
      <div
        className={`compact-header-actions ${styles.actions}`}
      >
        {/* 周期选择 */}
        <div className={styles.periodControl}>
          <span className={styles.periodLabel}>
            周：
          </span>
          <DatePicker
            picker="week"
            value={weekPickerValue}
            locale={WEEK_PICKER_LOCALE}
            onChange={handleWeekChange}
            className={styles.weekPicker}
            allowClear={false}
            format="YYYY年WW周"
            disabled={loadingPeriods}
          />
        </div>

        {/* 导出按钮 */}
        {canExportReport ? (
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportPDF}
            className={`font-medium ${styles.exportButton}`}
          >
            导出 PDF
          </Button>
        ) : null}
      </div>
    </div>
  );
}
