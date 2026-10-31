'use client';

import React from 'react';
import { Block, SkeletonText } from '@lobehub/ui';

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cardCount }).map((_, i) => (
          <Block key={i} variant="outlined" className="p-4">
            <SkeletonText rows={3} />
          </Block>
        ))}
      </div>

      {/* 图表骨架 */}
      {hasChart && (
        <Block variant="outlined" className="p-4">
          <SkeletonText rows={10} />
        </Block>
      )}
    </div>
  );
};

export default ReportSkeleton;
