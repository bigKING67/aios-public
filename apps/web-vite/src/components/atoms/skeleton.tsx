'use client';

import React from 'react';

export interface SkeletonProps {
  count?: number;
  width?: string | number;
  height?: string | number;
  className?: string;
  circle?: boolean;
}

/**
 * Skeleton - Atom Component
 * Loading placeholder with animated shimmer effect
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  count = 1,
  width = '100%',
  height = '20px',
  className = '',
  circle = false,
}) => {
  const widthStyle = typeof width === 'number' ? `${width}px` : width;
  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`
            bg-bg-disabled animate-pulse
            ${circle ? 'rounded-full' : 'rounded-md'}
            ${i > 0 ? 'mt-2' : ''}
          `}
          style={{ width: widthStyle, height: heightStyle }}
        />
      ))}
    </div>
  );
};

export default Skeleton;
