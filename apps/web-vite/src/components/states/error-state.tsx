'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from 'antd';

type ErrorStateStatus = 'error' | '404' | '500' | '503';
type ErrorStateTone = 'danger' | 'info' | 'warning';

interface ErrorStatePresentation {
  code: string;
  defaultSubTitle: string;
  defaultTitle: string;
  label: string;
  tone: ErrorStateTone;
}

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  errorCode?: string;
  onRetry?: () => void;
  status?: ErrorStateStatus;
  subTitle?: ReactNode;
  title?: ReactNode;
}

const ERROR_PRESENTATIONS: Record<ErrorStateStatus, ErrorStatePresentation> = {
  error: {
    code: '!',
    defaultTitle: '加载失败',
    defaultSubTitle: '请稍后重试',
    label: '请求失败',
    tone: 'danger',
  },
  '404': {
    code: '404',
    defaultTitle: '资源不存在',
    defaultSubTitle: '请检查资源是否已被删除或路径是否正确',
    label: '未找到资源',
    tone: 'info',
  },
  '500': {
    code: '500',
    defaultTitle: '服务器错误',
    defaultSubTitle: '服务器处理请求时出错，请稍后重试',
    label: '服务异常',
    tone: 'danger',
  },
  '503': {
    code: '503',
    defaultTitle: '服务不可用',
    defaultSubTitle: '后端服务暂时不可用，请检查服务状态或联系管理员',
    label: '暂时不可用',
    tone: 'warning',
  },
};

const SERVICE_UNAVAILABLE_PRESENTATION: ErrorStatePresentation = {
  code: '503',
  defaultTitle: '后端服务不可用',
  defaultSubTitle: '后端服务未启动或无法访问，请联系管理员启动服务',
  label: '连接失败',
  tone: 'warning',
};

const TONE_CLASS_NAMES: Record<ErrorStateTone, string> = {
  danger: 'status-panel-danger',
  info: 'status-panel-info',
  warning: 'status-panel-warning',
};

function resolvePresentation(
  status: ErrorStateStatus,
  errorCode: string | undefined,
): ErrorStatePresentation {
  return errorCode === 'SERVICE_UNAVAILABLE'
    ? SERVICE_UNAVAILABLE_PRESENTATION
    : ERROR_PRESENTATIONS[status];
}

export function ErrorState({
  title,
  subTitle,
  onRetry,
  className,
  status = 'error',
  errorCode,
  ...containerProps
}: ErrorStateProps) {
  const presentation = resolvePresentation(status, errorCode);
  const containerClassName = className
    ? `flex items-center justify-center px-6 py-12 ${className}`
    : 'flex items-center justify-center px-6 py-12';

  return (
    <div
      {...containerProps}
      aria-live="polite"
      className={containerClassName}
      role="alert"
    >
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <div
          aria-hidden="true"
          className={`mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border font-mono text-data-sm font-semibold tabular-nums ${TONE_CLASS_NAMES[presentation.tone]}`}
        >
          {presentation.code}
        </div>
        <p className="mb-2 text-xs font-semibold text-text-tertiary">
          {presentation.label}
        </p>
        <h2 className="m-0 text-xl font-semibold text-text-primary">
          {title ?? presentation.defaultTitle}
        </h2>
        <p className="mb-5 mt-3 max-w-md text-base text-text-secondary">
          {subTitle ?? presentation.defaultSubTitle}
        </p>
        {onRetry ? (
          <Button type="primary" onClick={onRetry}>
            重新加载
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default ErrorState;
