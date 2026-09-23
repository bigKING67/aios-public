import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('renders an actionable default failure state', () => {
    const onRetry = vi.fn();

    render(<ErrorState data-testid="error-state" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveAttribute('data-testid', 'error-state');
    expect(screen.getByRole('heading', { name: '加载失败' })).toBeInTheDocument();
    expect(screen.getByText('请稍后重试')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('uses the resource-not-found presentation with custom copy', () => {
    render(
      <ErrorState
        status="404"
        title="报告不存在"
        subTitle="当前周期没有可用报告"
      />,
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('未找到资源')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '报告不存在' })).toBeInTheDocument();
    expect(screen.getByText('当前周期没有可用报告')).toBeInTheDocument();
  });

  it('prioritizes the service-unavailable error code', () => {
    render(<ErrorState errorCode="SERVICE_UNAVAILABLE" status="500" />);

    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText('连接失败')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '后端服务不可用' })).toBeInTheDocument();
  });
});
