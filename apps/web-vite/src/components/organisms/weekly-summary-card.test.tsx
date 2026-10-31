import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import type { SummaryData } from '@/hooks/use-weekly-summary';
import { WeeklySummaryCard } from './weekly-summary-card';

const summaryHooks = vi.hoisted(() => ({
  data: undefined as SummaryData | undefined,
  generateSummary: vi.fn(),
  updateSummary: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-weekly-summary', () => ({
  useWeeklySummary: () => ({
    data: summaryHooks.data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: summaryHooks.refetch,
  }),
  useGenerateSummaryMutation: () => ({ mutate: summaryHooks.generateSummary, isPending: false }),
  useUpdateSummaryMutation: () => ({ mutate: summaryHooks.updateSummary, isPending: false }),
}));

vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => true,
}));

vi.mock('@/config/weekly-summary-ai', () => ({
  getWeeklySummaryAIConfig: () => ({
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    businessFramework: '金字塔结构',
    customPrompt: '',
    factsData: {},
  }),
  hasWeeklySummaryAIConfigOverride: () => false,
  resetWeeklySummaryAIConfig: vi.fn(),
  saveWeeklySummaryAIConfig: vi.fn(),
}));

const SUCCESS_DATA: SummaryData = {
  status: 'SUCCESS',
  content_status: 'AI_DRAFT',
  generated_at: '2026-10-20T08:00:00Z',
  provider: 'deepseek',
  model: 'deepseek-reasoner',
  conclusions: {
    overall: '本周 GMV 环比增长。',
    highlights: ['抖音直播放量'],
    risks: ['天猫转化下滑'],
  },
};

function renderCard() {
  return render(
    <LobeProvider>
      <WeeklySummaryCard reportId="weekly-1" weekPeriod="2026/10/18~2026/10/24" />
    </LobeProvider>,
  );
}

beforeEach(() => {
  summaryHooks.data = undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WeeklySummaryCard', () => {
  it('starts AI generation from the AI action button when there is no summary', async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByText('本周总结')).toBeInTheDocument();
    expect(screen.getByText('未生成')).toBeInTheDocument();
    expect(screen.getByText('暂无本周总结，点击右上角按钮一键生成洞察。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑总结' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '生成本周总结' }));
    expect(summaryHooks.generateSummary).toHaveBeenCalledWith({ forceRegenerate: false });
  });

  it('shows queued and thinking AI task states while the summary is in progress', () => {
    summaryHooks.data = { status: 'PENDING' };
    const { unmount } = renderCard();
    expect(screen.getByText('排队中')).toBeInTheDocument();
    expect(screen.getByText('任务已入队，正在等待工作线程处理...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /生成中/ })).toBeDisabled();
    unmount();

    summaryHooks.data = { status: 'GENERATING' };
    renderCard();
    expect(screen.getByText('思考中')).toBeInTheDocument();
    expect(screen.getByText('AI 正在深度分析本周数据，请稍候...')).toBeInTheDocument();
  });

  it('offers regeneration from the failure alert', async () => {
    const user = userEvent.setup();
    summaryHooks.data = { status: 'FAILED', error_message: '模型超时' };
    renderCard();

    expect(screen.getByText('AI 总结生成失败')).toBeInTheDocument();
    expect(screen.getByText('模型超时')).toBeInTheDocument();
    const retryButtons = screen.getAllByRole('button', { name: '重新生成' });
    await user.click(retryButtons[retryButtons.length - 1]);
    expect(summaryHooks.generateSummary).toHaveBeenCalledWith({ forceRegenerate: true });
  });

  it('edits the summary through labelled fields and a confirm dialog', async () => {
    const user = userEvent.setup();
    summaryHooks.data = SUCCESS_DATA;
    summaryHooks.updateSummary.mockImplementation((_variables, options) => options?.onSuccess?.());
    renderCard();

    expect(screen.getByText('AI草稿')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '编辑总结' }));
    const dialog = await screen.findByRole('dialog', { name: '手动编辑周报总结' });
    const overall = within(dialog).getByLabelText('总体概况');
    expect(overall).toHaveValue('本周 GMV 环比增长。');
    expect(within(dialog).getByLabelText('业务亮点（每行一条）')).toHaveValue('抖音直播放量');

    await user.clear(overall);
    await user.click(within(dialog).getByRole('button', { name: '保存总结' }));
    expect(await within(dialog).findByText('总体概况不能为空')).toBeInTheDocument();

    await user.type(overall, '本周整体平稳');
    await user.click(within(dialog).getByRole('button', { name: '保存总结' }));
    const confirm = await screen.findByRole('dialog', { name: '确认提交总结更新？' });
    await user.click(within(confirm).getByRole('button', { name: '确认提交' }));

    await waitFor(() =>
      expect(summaryHooks.updateSummary).toHaveBeenCalledWith(
        {
          conclusions: {
            overall: '本周整体平稳',
            highlights: ['抖音直播放量'],
            risks: ['天猫转化下滑'],
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  it('switches the provider through a labelled select and validates the model name', async () => {
    const user = userEvent.setup();
    summaryHooks.data = SUCCESS_DATA;
    renderCard();

    await user.click(screen.getByRole('button', { name: 'AI配置' }));
    const dialog = await screen.findByRole('dialog', { name: 'AI 总结配置' });
    const model = within(dialog).getByLabelText('模型名称');
    expect(model).toHaveValue('deepseek-reasoner');

    await user.click(within(dialog).getByRole('combobox', { name: '模型供应商' }));
    await user.click(await screen.findByRole('option', { name: 'Kimi' }));
    expect(model).toHaveValue('kimi-k2.5');

    await user.clear(model);
    await user.click(within(dialog).getByRole('button', { name: '保存配置' }));
    expect(await within(dialog).findByText('模型名称不能为空')).toBeInTheDocument();
  });
});
