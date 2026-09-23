'use client';

import React from 'react';

export type TextVariant =
  | 'h1' | 'h2' | 'h3' | 'h4'
  | 'body1' | 'body2' | 'caption' | 'code'
  | 'data-lg' | 'data-md' | 'data-sm';  // 新增：数据展示 Variant

export type TextType = 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'disabled';

export interface TypographyProps {
  variant?: TextVariant;
  type?: TextType;
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

const variantMap: Record<TextVariant, string> = {
  h1: 'text-[length:var(--font-size-display)] font-[var(--font-weight-display)] leading-[1.18] tracking-[var(--letter-spacing-tight)]',
  h2: 'text-[length:var(--font-size-section-title)] font-[var(--font-weight-section-title)] leading-[1.25] tracking-[var(--letter-spacing-title)]',
  h3: 'text-lg font-[var(--font-weight-title)] leading-[1.35]',
  h4: 'text-base font-[var(--font-weight-title)] leading-snug',
  body1: 'text-base font-normal leading-relaxed',
  body2: 'text-sm font-normal leading-relaxed',
  caption: 'text-xs font-medium leading-snug',
  code: 'text-sm font-mono leading-normal tabular-nums',
  'data-lg': 'text-[length:var(--font-size-data-lg)] font-[var(--font-weight-data)] font-mono leading-tight tracking-[var(--letter-spacing-data)] tabular-nums',
  'data-md': 'text-[length:var(--font-size-data-md)] font-[var(--font-weight-data)] font-mono leading-tight tracking-[var(--letter-spacing-data)] tabular-nums',
  'data-sm': 'text-[length:var(--font-size-data-sm)] font-semibold font-mono leading-snug tabular-nums',
};

const typeColorMap: Record<TextType, string> = {
  default: 'text-text-primary',
  secondary: 'text-text-secondary',
  success: 'text-status-success',
  warning: 'text-status-warning',
  error: 'text-status-danger',
  disabled: 'text-text-disabled',
};

/**
 * Typography - Atom Component
 * Semantic text rendering with predefined variants
 */
export const Typography: React.FC<TypographyProps> = ({
  variant = 'body1',
  type = 'default',
  children,
  className = '',
  as: Component = 'span',
}) => {
  return (
    <Component className={`${variantMap[variant]} ${typeColorMap[type]} ${className}`}>
      {children}
    </Component>
  );
};

export default Typography;
