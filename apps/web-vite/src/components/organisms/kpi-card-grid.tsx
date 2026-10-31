'use client';

import React from 'react';
import { KPICard } from './kpi-card';
import type { KPICard as KPICardType } from '@/types/report';

export interface KPICardGridProps {
  cards: KPICardType[];
  span?: number;
}

/**
 * 有机体 - KPI 卡片网格
 * 由多个 KPICard 组成
 * 响应式网格：手机一列、平板两列，桌面按 `span`（24 栅格制）换算列数
 */
const DESKTOP_COLUMNS: Record<number, string> = { 6: 'lg:grid-cols-4', 8: 'lg:grid-cols-3', 12: 'lg:grid-cols-2', 24: 'lg:grid-cols-1' };

export const KPICardGrid: React.FC<KPICardGridProps> = ({ cards, span = 6 }) => {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${DESKTOP_COLUMNS[span] ?? 'lg:grid-cols-4'}`}>
      {cards.map((card) => (
        <KPICard key={card.key} data={card} />
      ))}
    </div>
  );
};

export default KPICardGrid;
