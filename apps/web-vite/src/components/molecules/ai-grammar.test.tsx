import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobeProvider } from '@/components/lobe-provider';
import { AiActionButton } from './ai-action-button';
import { AiMark } from './ai-mark';
import { AiTaskStatus } from './ai-task-status';

afterEach(cleanup);

describe('AI grammar', () => {
  it('renders the AI action as a named button that runs its handler', async () => {
    const onClick = vi.fn();
    render(
      <LobeProvider>
        <AiActionButton onClick={onClick}>生成成片</AiActionButton>
      </LobeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '生成成片' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a repeated per-row AI start outlined', () => {
    render(
      <LobeProvider>
        <AiActionButton>生成成片</AiActionButton>
        <AiActionButton quiet>分析</AiActionButton>
      </LobeProvider>,
    );
    expect(screen.getByRole('button', { name: '生成成片' }).className).toMatch(/actionButton(?!Quiet)/);
    expect(screen.getByRole('button', { name: '分析' }).className).toMatch(/actionButtonQuiet/);
  });

  it('marks AI output and turns into 人工确认 once confirmed', () => {
    const { rerender } = render(<AiMark title="doubao · 10/23">AI 标注 · 妆效</AiMark>);
    expect(screen.getByText('AI 标注 · 妆效')).toHaveAttribute('title', 'doubao · 10/23');
    rerender(<AiMark confirmed>AI 标注 · 妆效</AiMark>);
    expect(screen.getByText('人工确认')).toBeInTheDocument();
    expect(screen.queryByText('AI 标注 · 妆效')).not.toBeInTheDocument();
  });

  it('states every task phase in text and shows progress only while generating', () => {
    const { rerender } = render(<AiTaskStatus state="thinking" label="正在理解 12 条原片的卖点" />);
    expect(screen.getByText('思考中')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    rerender(<AiTaskStatus state="generating" label="框架混剪 · 第 3 版" progress={62.4} />);
    expect(screen.getByText('生成中')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '生成进度' })).toHaveAttribute('aria-valuenow', '62');
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('gives a failed task its reason and a retry action', async () => {
    const onRetry = vi.fn();
    render(
      <LobeProvider>
        <AiTaskStatus state="failed" label="字幕对齐" detail="超时" onRetry={onRetry} />
      </LobeProvider>,
    );
    expect(screen.getByText('失败')).toBeInTheDocument();
    expect(screen.getByText('超时')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps a finer backend word on the nearest state, and shows cancelled as neutral', () => {
    const { container, rerender } = render(<AiTaskStatus compact state="generating" stateLabel="出片中" progress={40} />);
    expect(screen.getByText('出片中')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    // Compact shows the percent in words; the bar belongs to the full box.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    rerender(<AiTaskStatus compact state="cancelled" />);
    expect(screen.getByText('已取消')).toBeInTheDocument();
    expect(container.querySelector('[data-ai-task-state="cancelled"]')).not.toBeNull();
  });

  it('lets a failure carry its own action instead of the plain retry', () => {
    render(
      <LobeProvider>
        <AiTaskStatus state="failed" label="下载失败" onRetry={() => {}} action={<button type="button">重新分析</button>} />
      </LobeProvider>,
    );
    expect(screen.getByRole('button', { name: '重新分析' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  });
});
