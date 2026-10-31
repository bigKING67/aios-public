import { useState } from 'react';
import type { ReactNode } from 'react';
import { getWeeklyReportPanelId, getWeeklyReportTabId } from './weekly-report-tab-ids';

export interface WeeklyReportTabPanelItem {
  key: string;
  label: string;
  children: ReactNode;
}

export interface WeeklyReportTabPanelsProps {
  activeKey: string;
  items: readonly WeeklyReportTabPanelItem[];
  className?: string;
}

/**
 * 周报内容面板：页签条在 CompactHeader 里，这里只渲染面板。
 * 与原 antd Tabs 一致：面板首次激活时才挂载，切走后保持挂载并隐藏，保留图表与表格状态。
 */
export function WeeklyReportTabPanels({ activeKey, items, className }: WeeklyReportTabPanelsProps) {
  const [visitedKeys, setVisitedKeys] = useState<ReadonlySet<string>>(() => new Set([activeKey]));
  if (!visitedKeys.has(activeKey)) {
    setVisitedKeys(new Set(visitedKeys).add(activeKey));
  }

  return (
    <div className={className}>
      {items.map((item) => {
        const isActive = item.key === activeKey;
        if (!isActive && !visitedKeys.has(item.key)) {
          return null;
        }
        return (
          <div
            key={item.key}
            id={getWeeklyReportPanelId(item.key)}
            role="tabpanel"
            aria-labelledby={getWeeklyReportTabId(item.key)}
            hidden={!isActive}
          >
            {item.children}
          </div>
        );
      })}
    </div>
  );
}
