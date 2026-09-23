'use client';

import React from 'react';
import { Empty, EmptyProps } from 'antd';

/**
 * EmptyState - 空数据状态组件
 *
 * 用于显示没有数据时的状态
 */
export interface EmptyStateProps extends Omit<EmptyProps, 'children'> {
  // 空数据描述文字
  description?: string;

  // 自定义类名
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  description = '暂无数据',
  className = '',
  ...props
}) => (
  <div className={`py-12 ${className}`}>
    <Empty description={description} {...props} />
  </div>
);

export default EmptyState;
