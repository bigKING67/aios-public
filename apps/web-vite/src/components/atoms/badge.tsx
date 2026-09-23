'use client';

import React from 'react';

export type BadgeStatus = 'success' | 'warning' | 'error' | 'danger' | 'info' | 'neutral';

export interface BadgeProps {
  status: BadgeStatus;
  children: React.ReactNode;
  className?: string;
}

const statusClassMap: Record<BadgeStatus, string> = {
  success: 'status-badge-success',
  warning: 'status-badge-warning',
  error: 'status-badge-danger',
  danger: 'status-badge-danger',
  info: 'status-badge-info',
  neutral: 'status-badge-neutral',
};

/**
 * Badge - Atom Component
 * Displays status indicators with semantic color mapping
 */
export const Badge: React.FC<BadgeProps> = ({ status, children, className = '' }) => {
  return (
    <span
      className={`
        status-badge px-3 py-1 text-sm font-medium
        transition-colors duration-200
        ${statusClassMap[status]}
        ${className}
      `}
    >
      {children}
    </span>
  );
};

export default Badge;
