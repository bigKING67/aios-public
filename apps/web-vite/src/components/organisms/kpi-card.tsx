'use client';

import { Block } from '@lobehub/ui';
import { KPIMetric } from '../molecules/kpi-metric';
import type { KPICard as KPICardType } from '@/types/report';

export interface KPICardProps {
  data: KPICardType;
  className?: string;
}

/**
 * 有机体 - KPI 卡片
 * 由 KPIMetric 分子组成
 * 显示单个关键指标，包含值、趋势信息
 */
export const KPICard: React.FC<KPICardProps> = ({ data, className = '' }) => {
  // 将旧的数据格式转换为新的 KPIMetric 接口
  const wow = typeof data.wow === 'string' && !isNaN(parseFloat(data.wow))
    ? {
        value: parseFloat(data.wow),
        direction: parseFloat(data.wow) >= 0 ? 'up' as const : ('down' as const),
      }
    : undefined;

  return (
    <Block variant="outlined" className={`p-4 ${className}`}>
      <KPIMetric
        label={data.label}
        value={data.value}
        wow={wow}
      />
    </Block>
  );
};

export default KPICard;
