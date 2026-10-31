import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStructurePool,
  STRUCTURE_POOL_PRODUCT,
  type StudioStructurePoolResponse,
} from '../_lib/structure-pool-api';
import { StructurePoolPreview } from './structure-pool-preview';

vi.mock('../_lib/structure-pool-api', async (original) => ({
  ...await original<object>(),
  fetchStructurePool: vi.fn(),
}));

function response(extra: Partial<StudioStructurePoolResponse> = {}): StudioStructurePoolResponse {
  return {
    date: '2026-10-30',
    asOf: '2026-10-29',
    windowFrom: '2026-09-30',
    windowTo: '2026-10-29',
    productName: STRUCTURE_POOL_PRODUCT,
    status: 'ready',
    pending: false,
    requestedCount: 100,
    plannedCount: 94,
    shortfall: 6,
    rows: [{
      labels: ['voice', 'demo'],
      labelNames: ['混剪口播', '实拍内容'],
      source: 'both',
      share: 0.236,
      plannedCount: 24,
      availableCombinations: 12,
      availableIsLowerBound: true,
      reason: '素材准入后组合不足',
    }],
    ...extra,
  };
}

function renderPreview(productName: string | null = STRUCTURE_POOL_PRODUCT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StructurePoolPreview productName={productName} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.mocked(fetchStructurePool).mockResolvedValue(response()));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('today structure pool preview', () => {
  it('does not fetch or misapply the fixed 香粉 plan to another product', async () => {
    renderPreview('口红');
    expect(screen.getByText('今日结构池仅用于百雀羚香粉')).toBeInTheDocument();
    expect(screen.getByText('当前选择的是口红，不会套用这份结构计划。')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchStructurePool).not.toHaveBeenCalled();
  });

  it('shows the allocation, shortfall reason and sampled availability lower bound', async () => {
    renderPreview();
    expect(await screen.findByText('94 / 100 条')).toBeInTheDocument();
    expect(screen.getByText('计划少出 6 条')).toBeInTheDocument();
    expect(screen.getAllByText('素材准入后组合不足').length).toBeGreaterThan(0);
    const table = screen.getByRole('table');
    expect(within(table).getByText('混剪口播 → 实拍内容')).toBeInTheDocument();
    expect(within(table).getByText('竞品 + 我方')).toBeInTheDocument();
    expect(within(table).getByText('24%')).toBeInTheDocument();
    expect(within(table).getByText('≥ 12')).toBeInTheDocument();
    expect(within(table).getByText('抽样下限')).toBeInTheDocument();
  });

  it('describes the previous-window fallback without calling it a frozen plan', async () => {
    vi.mocked(fetchStructurePool).mockResolvedValue(response({ status: 'previous_window', pending: true }));
    renderPreview();
    expect(await screen.findByText('沿用前一天统计窗口，素材可用量实时核验')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '今日结构池结构分配' })).toBeInTheDocument();
    expect(screen.getByText('结构统计正在计算')).toBeInTheDocument();
  });

  it.each([
    ['pending', true, '结构统计正在计算'],
    ['no_spend_data', false, '暂无我方消耗数据'],
  ])('owns the %s state', async (status, pending, message) => {
    vi.mocked(fetchStructurePool).mockResolvedValue(response({ status, pending, rows: [], plannedCount: 0, shortfall: 100 }));
    renderPreview();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows loading and a retryable error', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(fetchStructurePool).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    renderPreview();
    expect(screen.getByLabelText('刷新')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    reject(new Error('统计服务暂不可用'));
    expect(await screen.findByText('今日结构池读取失败')).toBeInTheDocument();
    expect(screen.getByText('统计服务暂不可用')).toBeInTheDocument();
    vi.mocked(fetchStructurePool).mockResolvedValue(response());
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(fetchStructurePool).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('94 / 100 条')).toBeInTheDocument();
  });
});
