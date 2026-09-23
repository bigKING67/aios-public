'use client';

import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface TrendIndicatorProps {
  /** 趋势数值（百分比），如 3.2 表示 +3.2%，-2.5 表示 -2.5% */
  value: number;
  /** 方向显式指定 */
  direction: TrendDirection;
  /** 显示格式 */
  format?: 'percent' | 'number';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 显示图标 */
  showIcon?: boolean;
  /** 自定义 className */
  className?: string;
}

const directionConfig = {
  up: { color: 'var(--trend-up)', icon: ArrowUpOutlined, prefix: '+' },
  down: { color: 'var(--trend-down)', icon: ArrowDownOutlined, prefix: '-' },
  neutral: { color: 'var(--trend-neutral)', icon: null, prefix: '' },
};

const sizeStyles = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/**
 * 原子组件：趋势指示器
 *
 * 用于展示 KPI 的环比/同比数据
 *
 * @example
 * // 上升 3.2%
 * <TrendIndicator value={3.2} direction="up" format="percent" />
 * // 输出：[↑ +3.2%]
 *
 * // 下降 2.5%
 * <TrendIndicator value={-2.5} direction="down" format="percent" />
 * // 输出：[↓ -2.5%]
 */
export const TrendIndicator: React.FC<TrendIndicatorProps> = ({
  value,
  direction,
  format = 'percent',
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const { color, icon: Icon, prefix } = directionConfig[direction];

  const formattedValue = format === 'percent'
    ? `${prefix}${Math.abs(value).toFixed(2)}%`
    : `${prefix}${Math.abs(value).toFixed(2)}`;

  return (
    <div className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`} style={{ color }}>
      {showIcon && Icon && <Icon className={`${sizeStyles[size]}`} />}
      <span className={`font-medium whitespace-nowrap ${sizeStyles[size]}`}>{formattedValue}</span>
    </div>
  );
};

export default TrendIndicator;
