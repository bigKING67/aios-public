'use client';

import React from 'react';
import { Card, Spin } from 'antd';
import styles from './chart-container.module.css';

export interface ChartContainerProps {
  title?: string;
  children: React.ReactNode;
  loading?: boolean;
  height?: number | string;
  className?: string;
}

/**
 * 分子 - 图表容器
 * 包装图表组件，提供统一的样式、加载状态、标题
 */
export const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  children,
  loading = false,
  height = 300,
  className = '',
}) => {
  const cardClassName = className ? `${styles.card} ${className}` : styles.card;
  const bodyStyle = {
    '--chart-container-min-height': resolveChartContainerHeight(height),
  } as React.CSSProperties;

  return (
    <Card
      title={
        title ? (
          <span className={styles.title}>
            {title}
          </span>
        ) : undefined
      }
      variant="borderless"
      className={cardClassName}
    >
      <div className={styles.body} style={bodyStyle}>
        <Spin spinning={loading} description="加载中...">
          {children}
        </Spin>
      </div>
    </Card>
  );
};

export default ChartContainer;

function resolveChartContainerHeight(height: number | string): string {
  return typeof height === 'number' ? `${height}px` : height;
}
