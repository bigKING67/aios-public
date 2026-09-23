'use client';

import React from 'react';
import { Card, Row, Col, Skeleton } from 'antd';

export interface ReportSkeletonProps {
  cardCount?: number;
  hasChart?: boolean;
}

/**
 * 有机体 - 报告骨架屏
 * 用于 Suspense 加载状态
 */
export const ReportSkeleton: React.FC<ReportSkeletonProps> = ({
  cardCount = 4,
  hasChart = true,
}) => {
  return (
    <div className="space-y-6">
      {/* KPI 卡片骨架 */}
      <Row gutter={[16, 16]}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <Col key={i} xs={24} sm={12} lg={6}>
            <Card variant="borderless" style={{ borderRadius: '8px' }}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 图表骨架 */}
      {hasChart && (
        <Card variant="borderless" style={{ borderRadius: '8px' }}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      )}
    </div>
  );
};

export default ReportSkeleton;
