'use client';

import React from 'react';
import { TrendIndicator } from '@/components/atoms/trend-indicator';

export interface TrendMetric {
  value: number;
  direction: 'up' | 'down';
}

export interface KPIMetricProps {
  /** KPI 标签/名称 */
  label: string;
  /** 展示值（格式化后），如 "1.25亿" */
  value: string | number;
  /** 周环比数据 */
  wow?: TrendMetric;
  /** 环比标签文案（默认：环比） */
  wowLabel?: string;
  /** 年同比数据 */
  yoy?: TrendMetric;
  /** 自定义 className */
  className?: string;
}

/**
 * KPIMetric - 分子组件
 *
 * 单个 KPI 指标卡片，包括名称、展示值、环比和同比
 *
 * @example
 * <KPIMetric
 *   label="商品成交额"
 *   value="1.25亿"
 *   wow={{ value: 3.2, direction: 'up' }}
 *   yoy={{ value: 15.5, direction: 'up' }}
 * />
 */
export const KPIMetric: React.FC<KPIMetricProps> = ({
  label,
  value,
  wow,
  wowLabel = '环比',
  yoy,
  className = '',
}) => {
  return (
    <div
      className={`card transition-all duration-200 hover:shadow-base hover:border-border-color-hover ${className}`}
    >
      {/* 标签（二级文字） */}
      <div className="mb-1.5">
        <span className="text-xs font-normal text-text-secondary">
          {label}
        </span>
      </div>

      {/* 主值（核心数据，等宽显示） */}
      <div
        className="data-value mb-2 text-lg font-semibold text-text-primary"
      >
        {value}
      </div>

      {/* 趋势指标（同比/环比） */}
      <div className="flex gap-2 items-center min-w-0">
        {wow && (
          <div className="flex items-center gap-1 min-w-0 whitespace-nowrap">
            <span className="text-xs text-text-tertiary shrink-0 whitespace-nowrap">
              {wowLabel}
            </span>
            <TrendIndicator
              value={wow.value}
              direction={wow.direction}
              format="percent"
              size="sm"
            />
          </div>
        )}
        {yoy && (
          <div className="flex items-center gap-1 min-w-0 whitespace-nowrap">
            <span className="text-xs text-text-tertiary shrink-0 whitespace-nowrap">
              同比
            </span>
            <TrendIndicator
              value={yoy.value}
              direction={yoy.direction}
              format="percent"
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default KPIMetric;
