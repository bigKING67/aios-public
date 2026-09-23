'use client';

import React from 'react';
import { Row, Col } from 'antd';
import { KPICard } from './kpi-card';
import type { KPICard as KPICardType } from '@/types/report';

export interface KPICardGridProps {
  cards: KPICardType[];
  span?: number;
}

/**
 * 有机体 - KPI 卡片网格
 * 由多个 KPICard 组成
 * 使用 Ant Design Grid 系统实现响应式布局
 */
export const KPICardGrid: React.FC<KPICardGridProps> = ({ cards, span = 6 }) => {
  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col key={card.key} xs={24} sm={12} lg={span}>
          <KPICard data={card} />
        </Col>
      ))}
    </Row>
  );
};

export default KPICardGrid;
