import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContentAssets } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { fetchStudioPresets, type StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import {
  createSegmentSuggestionJobs,
  fetchOwnSegmentSuggestionJobs,
  type StudioSegmentSuggestionJob,
} from '../_lib/segment-suggestion-api';
import { SegmentSuggestPanel } from './segment-suggest-panel';

vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', () => ({ fetchContentAssets: vi.fn() }));
vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioPresets: vi.fn(),
  fetchStudioAssetSegmentSummaries: vi.fn().mockResolvedValue([]),
}));
vi.mock('../_lib/segment-suggestion-api', async (original) => ({
  ...await original<object>(),
  createSegmentSuggestionJobs: vi.fn(),
  fetchOwnSegmentSuggestionJobs: vi.fn(),
}));

const READY = '9f9f9f9f-0000-4000-8000-000000000001';
const NO_HASH = '9f9f9f9f-0000-4000-8000-000000000002';

function capabilities(extra: Partial<StudioCapabilitiesResponse> = {}): StudioCapabilitiesResponse {
  return { enabled: true, openAccess: false, canWrite: true, segmentSuggestEnabled: true, segmentSuggestMaxAssets: 5, remixEnabled: false, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true, ...extra };
}

function asset(assetId: string, title: string, rawSha256: string | null, canEdit = true) {
  return { assetId, title, rawSha256, canEdit, externalOnly: false, assetStatus: 'ready', durationSeconds: 120, productName: '精华' };
}

function job(jobId: string, status: string, extra: Partial<StudioSegmentSuggestionJob> = {}): StudioSegmentSuggestionJob {
  return {
    jobId, status, assetId: READY, assetTitle: '整片-001', ownerUserId: 'u1', sourceContentHash: 'a'.repeat(64), sourceCurrent: true,
    presetKey: 'framework', presetVersion: 1, labelKeys: ['voice', 'demo', 'koc'], stage: '等待切段', attempt: 0, errorCode: null, errorMessage: null, model: null,
    promptVersion: null, usage: null, resultSummary: null, createdAt: '2026-09-29 10:00:00+08', startedAt: null, finishedAt: null, ...extra,
  };
}

function renderPanel(caps: StudioCapabilitiesResponse) {
  // Mirror the app default (mutations retry once) to prove the write opts out.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 1 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SegmentSuggestPanel capabilities={caps} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(fetchStudioPresets).mockResolvedValue([
    {
      presetKey: 'framework', version: 1, status: 'active', dimension: 'framework', name: '框架 v1',
      labels: [
        { key: 'voice', name: '混剪口播', definition: '口播贯穿' },
        { key: 'demo', name: '实拍内容', definition: '同人连续演示' },
        { key: 'koc', name: 'KOC', definition: '' },
      ],
    },
  ]);
  vi.mocked(fetchContentAssets).mockResolvedValue({
    items: [asset(READY, '整片-001', 'a'.repeat(64)), asset(NO_HASH, '整片-002', null)], total: 2, page: 1, pageSize: 10,
  } as never);
  vi.mocked(fetchOwnSegmentSuggestionJobs).mockResolvedValue([]);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function selectAsset() {
  const checkbox = await screen.findByRole('checkbox', { name: '选择原片 整片-001' });
  expect(screen.getByRole('checkbox', { name: '选择原片 整片-002' })).toBeDisabled();
  fireEvent.click(checkbox);
}

async function selectAndTrigger() {
  await selectAsset();
  fireEvent.click(screen.getByRole('button', { name: /^开始分析/ }));
  fireEvent.click(await screen.findByRole('button', { name: /^发\s*起$/ }));
}

describe('AI 分析 segment suggestion panel', () => {
  it('lets open access analyze assets the account cannot edit, but still needs the raw hash', async () => {
    vi.mocked(fetchContentAssets).mockResolvedValue({
      items: [asset(READY, '整片-001', 'a'.repeat(64), false), asset(NO_HASH, '整片-002', null, false)], total: 2, page: 1, pageSize: 10,
    } as never);
    renderPanel(capabilities({ openAccess: true }));
    expect(await screen.findByRole('checkbox', { name: '选择原片 整片-001' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '选择原片 整片-002' })).toBeDisabled();
    expect(screen.getByText('原片摘要缺失，暂不能分析')).toBeInTheDocument();
  });

  it('folds annotation state and duration under the title on phones', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 680px)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
    }));
    try {
      renderPanel(capabilities());
      expect(await screen.findByRole('checkbox', { name: '选择原片 整片-001' })).toBeEnabled();
      expect(screen.queryByRole('columnheader', { name: '时长' })).not.toBeInTheDocument();
      expect(screen.getAllByText('2:00').length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps assets without edit permission unselectable in scoped access', async () => {
    vi.mocked(fetchContentAssets).mockResolvedValue({
      items: [asset(READY, '整片-001', 'a'.repeat(64), false)], total: 1, page: 1, pageSize: 10,
    } as never);
    renderPanel(capabilities());
    expect(await screen.findByRole('checkbox', { name: '选择原片 整片-001' })).toBeDisabled();
    expect(screen.getByText('无编辑权限或原片摘要缺失')).toBeInTheDocument();
  });

  it('is honest when the capability is off and never loads or triggers jobs', async () => {
    renderPanel(capabilities({ segmentSuggestEnabled: false }));
    expect(screen.getByRole('heading', { name: 'AI 分析未启用' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^开始分析/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去原片人工标注' })).toHaveAttribute('href', '/content/ai-studio/assets');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchOwnSegmentSuggestionJobs).not.toHaveBeenCalled();
    expect(fetchContentAssets).not.toHaveBeenCalled();
  });

  it('triggers only the selected eligible assets with the active preset and every label by default', async () => {
    vi.mocked(createSegmentSuggestionJobs).mockResolvedValue({ items: [job('j1', 'queued')], reusedJobIds: [], labelKeyMismatchJobIds: [] });
    renderPanel(capabilities());
    for (const name of ['混剪口播', '实拍内容', 'KOC']) {
      expect(await screen.findByRole('checkbox', { name })).toBeChecked();
    }
    await selectAsset();
    fireEvent.click(screen.getByRole('button', { name: /^开始分析/ }));
    expect(await screen.findByText(/本次候选框架：混剪口播、实拍内容、KOC。/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^发\s*起$/ }));
    await waitFor(() => expect(createSegmentSuggestionJobs).toHaveBeenCalledTimes(1));
    // The picker lists every non-output asset with its annotation state (no hidden unlabeled-only filter).
    expect(vi.mocked(fetchContentAssets).mock.calls[0][0]).toMatchObject({ segmentPreset: 'framework', studioOutputs: 'exclude' });
    expect(vi.mocked(fetchContentAssets).mock.calls[0][0].segmentStatus).toBeUndefined();
    // With only the framework preset the launch header names the dimension and version.
    expect(screen.getByText(/^框架标签 v1$/)).toBeInTheDocument();
    // Rules and the pending picture analysis live behind the info icon instead of body copy.
    fireEvent.mouseEnter(screen.getByLabelText('分析规则'));
    expect(await screen.findByText(/画面分析（痛点、上妆、美展、街采、产展）将在/)).toBeInTheDocument();
    expect(vi.mocked(createSegmentSuggestionJobs).mock.calls[0][0]).toEqual({
      assetIds: [READY], presetKey: 'framework', presetVersion: 1, labelKeys: ['voice', 'demo', 'koc'],
    });
    expect(await screen.findByText('已提交 1 条分析任务。')).toBeInTheDocument();
  });

  it('sends the chosen label subset in preset order and requires at least one label', async () => {
    vi.mocked(createSegmentSuggestionJobs).mockResolvedValue({
      items: [job('j1', 'queued')], reusedJobIds: ['j1'], labelKeyMismatchJobIds: ['j1'],
    });
    renderPanel(capabilities());
    await selectAsset();
    const trigger = screen.getByRole('button', { name: /^开始分析/ });
    for (const name of ['混剪口播', '实拍内容', 'KOC']) fireEvent.click(await screen.findByRole('checkbox', { name }));
    expect(screen.getByRole('alert')).toHaveTextContent('至少选择 1 个候选框架。');
    expect(trigger).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '实拍内容' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '混剪口播' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(await screen.findByText(/本次候选框架：混剪口播、实拍内容。/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^发\s*起$/ }));
    await waitFor(() => expect(createSegmentSuggestionJobs).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createSegmentSuggestionJobs).mock.calls[0][0]).toMatchObject({ labelKeys: ['voice', 'demo'] });
    expect(await screen.findByText(/1 条进行中的任务候选框架与本次不同，仍按原任务执行/)).toBeInTheDocument();
  });

  it('does not retry a failed trigger', async () => {
    vi.mocked(createSegmentSuggestionJobs).mockRejectedValue(new Error('AI 切段尚未启用'));
    renderPanel(capabilities());
    await selectAndTrigger();
    expect(await screen.findByText('分析任务提交失败')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(createSegmentSuggestionJobs).toHaveBeenCalledTimes(1);
  });

  it('shows job states, failure reasons and a review link for finished jobs', async () => {
    vi.mocked(fetchOwnSegmentSuggestionJobs).mockResolvedValue([
      job('j1', 'succeeded', { promptVersion: 'segment-suggest-v4', resultSummary: { segmentsInserted: 4, supersededSuggestions: 1, dropped: { too_short: 2 } } }),
      job('j2', 'failed', { assetId: 'asset-3', assetTitle: '整片-003', errorMessage: '原片内容已变化，请重新开始分析' }),
      job('j3', 'running', { assetId: 'asset-4', assetTitle: '整片-004', stage: '等待模型结果', labelKeys: ['voice', 'demo'] }),
      job('j4', 'failed', { assetId: 'asset-5', assetTitle: '整片-005', errorCode: 'provider_error', errorMessage: '模型调用失败（ReadTimeout）；调用可能已计费，请检查后手动重新发起' }),
      // An older failed run of 整片-001, superseded by j1 and folded into history.
      job('j0', 'failed', { errorCode: 'lease_expired', errorMessage: 'worker 已中断；模型调用可能已计费，请检查后手动重新发起' }),
    ]);
    renderPanel(capabilities({ canWrite: false }));
    expect(await screen.findByText('新增待确认 4 段，替换旧建议 1 段，丢弃无效输出 2 条')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '审核建议片段' })).toHaveAttribute('href', `/content/ai-studio/segments?assetId=${READY}`);
    // The prompt generation is shown per job, separate from the label-set version.
    expect(screen.getByText(/· 提示词 v4$/)).toBeInTheDocument();
    expect(screen.getByText('原片内容已变化，请重新开始分析')).toBeInTheDocument();
    expect(screen.getByText('等待模型结果')).toBeInTheDocument();
    // Candidate labels only appear for a subset run.
    expect(screen.queryByText('全部 3 类')).not.toBeInTheDocument();
    expect(screen.getByText('不含 KOC')).toBeInTheDocument();
    // Failures read in plain language; the raw message stays reachable.
    expect(screen.getByText('模型没有返回结果，可重新发起（这次调用可能已计费）')).toHaveAttribute('tabindex', '0');
    expect(screen.queryByText(/worker 已中断/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示较早记录（1 条）' }));
    expect(screen.getByText('分析被中断，可重新发起（这次调用可能已计费）')).toBeInTheDocument();
    expect(screen.getByText('当前账号没有素材编辑权限，只能查看分析任务。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^开始分析/ })).toBeDisabled();
  });
});
