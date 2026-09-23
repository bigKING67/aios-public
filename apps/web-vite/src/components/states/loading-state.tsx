'use client';

import React from 'react';
import { Spin } from 'antd';

/**
 * LoadingState - 加载状态组件
 *
 * 用于显示数据加载中的状态
 */
export interface LoadingStateProps {
  // 加载提示文字
  message?: string;

  // 是否显示旋转图标
  spin?: boolean;

  // 自定义 className
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = '加载中...',
  spin = true,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center py-12 gap-4 ${className}`}>
    {spin && <Spin size="large" />}
    {message && <p className="text-text-secondary">{message}</p>}
  </div>
);

export default LoadingState;
