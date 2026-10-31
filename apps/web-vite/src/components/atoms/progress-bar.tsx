'use client';

import React, { type CSSProperties } from 'react';
import styles from './progress-bar.module.css';

export interface ProgressBarProps {
  percent: number;
  height?: number;
  color?:
    | 'primary'
    | 'info'
    | 'success'
    | 'warning'
    | 'danger'
    | 'neutral'
    | 'blue'
    | 'green'
    | 'orange'
    | 'red';
  showLabel?: boolean;
  className?: string;
}

const progressColorMap: Record<NonNullable<ProgressBarProps['color']>, string> = {
  primary: 'var(--lobe-color-primary)',
  info: 'var(--aios-status-info)',
  success: 'var(--aios-status-success)',
  warning: 'var(--aios-status-warning)',
  danger: 'var(--aios-status-danger)',
  neutral: 'var(--lobe-color-text-tertiary)',
  blue: 'var(--lobe-color-primary)',
  green: 'var(--aios-status-success)',
  orange: 'var(--aios-status-warning)',
  red: 'var(--aios-status-danger)',
};

type ProgressBarStyleVars = CSSProperties & {
  '--progress-bar-height': string;
  '--progress-bar-percent': string;
  '--progress-bar-color': string;
};

/**
 * 原子 - 进度条
 * 显示百分比进度
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  height = 8,
  color = 'blue',
  showLabel = false,
  className = '',
}) => {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const styleVars: ProgressBarStyleVars = {
    '--progress-bar-height': `${height}px`,
    '--progress-bar-percent': `${clampedPercent}%`,
    '--progress-bar-color': progressColorMap[color],
  };

  return (
    <div className={`${styles.root} ${className}`} style={styleVars}>
      <div className={styles.track}>
        <div className={styles.fill} />
      </div>
      {showLabel && <span className={styles.label}>{clampedPercent}%</span>}
    </div>
  );
};

export default ProgressBar;
