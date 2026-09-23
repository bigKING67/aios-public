import type { ReactNode } from 'react';
import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { OverviewTab } from './tabs/overview-tab';
import { PlatformTab } from './tabs/platform-tab';

export interface WeeklyReportClientProps {
  reportId?: string;
  initialWeekPeriod?: string;
}

interface WeeklyReportTabItem {
  key: string;
  label: string;
  children: ReactNode;
}

export const WEEK_PERIOD_DEBOUNCE_MS = 200;

type DebouncedFunction<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void;
};

type WeeklyReportRequestError = Error & {
  code?: string;
  originalError?: {
    code?: string;
  };
};

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): DebouncedFunction<Args> {
  let timer: number | null = null;

  const debounced = ((...args: Args) => {
    if (timer) {
      window.clearTimeout(timer);
    }

    timer = window.setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  }) as DebouncedFunction<Args>;

  debounced.cancel = () => {
    if (!timer) {
      return;
    }

    window.clearTimeout(timer);
    timer = null;
  };

  return debounced;
}

export function getWeeklyReportRequestError(error: unknown): WeeklyReportRequestError | null {
  return error instanceof Error ? error : null;
}

export function generateTabsFromReport(data: WeeklyReportResponse): WeeklyReportTabItem[] {
  const tabs = [
    {
      key: 'overview',
      label: '概览',
      children: <OverviewTab report={data} />,
    },
  ];

  if (data.charts?.platforms && Array.isArray(data.charts.platforms)) {
    const platformTabs = data.charts.platforms.map((platformData) => ({
      key: platformData.platform,
      label: getPlatformLabel(platformData.platform),
      children: <PlatformTab report={data} platform={platformData.platform} />,
    }));
    tabs.push(...platformTabs);
  }

  return tabs;
}

export function getPlatformLabel(platformKey: string): string {
  const platformLabels: Record<string, string> = {
    douyin: '抖音',
    tmall: '天猫',
    taobao: '天猫',
    xiaohongshu: '小红书',
    xhs: '小红书',
    wechat: '微信',
    wx: '微信',
    jd: '京东',
    pinduoduo: '拼多多',
    suning: '苏宁',
  };
  return platformLabels[platformKey] || platformKey;
}

export function normalizeQueryValue(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null') {
    return undefined;
  }

  return normalized;
}
