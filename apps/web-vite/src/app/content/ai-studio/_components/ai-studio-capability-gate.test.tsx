import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStudioCapabilities } from '../_lib/ai-studio-api';
import { AiStudioCapabilityGate } from './ai-studio-capability-gate';

vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioCapabilities: vi.fn(),
}));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiStudioCapabilityGate title="片段素材" purpose="说明">
        {(capabilities) => <button type="button">{capabilities.canWrite ? '可写控件' : '只读内容'}</button>}
      </AiStudioCapabilityGate>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AI studio capability gate', () => {
  it('shows an honest disabled state and never mounts page controls', async () => {
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: false, openAccess: false, canWrite: true, segmentSuggestEnabled: false, segmentSuggestMaxAssets: 5, remixEnabled: false, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'AI 创作中心尚未启用' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '可写控件' })).not.toBeInTheDocument();
  });

  it('passes write capability to enabled pages', async () => {
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: true, openAccess: false, canWrite: false, segmentSuggestEnabled: false, segmentSuggestMaxAssets: 5, remixEnabled: false, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true });
    renderGate();
    expect(await screen.findByRole('button', { name: '只读内容' })).toBeInTheDocument();
  });

  it('surfaces capability failures with a retry', async () => {
    vi.mocked(fetchStudioCapabilities).mockRejectedValue(new Error('网络连接失败'));
    renderGate();
    expect(await screen.findByText('无法读取 AI 创作中心状态')).toBeInTheDocument();
    expect(screen.getByText('网络连接失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument();
  });
});
