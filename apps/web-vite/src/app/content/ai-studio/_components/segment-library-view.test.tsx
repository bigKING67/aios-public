import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStudioSegmentPool,
  fetchStudioSegments,
  type StudioContentSegment,
  type StudioSegmentPreset,
} from '../_lib/ai-studio-api';
import { SegmentLibraryView } from './segment-library-view';

vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioSegmentPool: vi.fn(),
  fetchStudioSegments: vi.fn(),
}));

const PRESET: StudioSegmentPreset = {
  presetKey: 'framework',
  version: 1,
  dimension: 'framework',
  name: '框架 v1',
  status: 'active',
  labels: [{ key: 'voice', name: '混剪口播', definition: '' }],
};

function segment(segmentId: string): StudioContentSegment {
  return {
    segmentId,
    ownerUserId: 'u',
    assetId: `asset-${segmentId}`,
    assetTitle: `整片-${segmentId}`,
    sourceContentHash: 'a'.repeat(64),
    sourceCurrent: true,
    sourceDurationMs: 60_000,
    startMs: 0,
    endMs: 5_000,
    presetKey: 'framework',
    presetVersion: 1,
    labelKey: 'voice',
    labelKeys: ['voice'],
    productName: '散粉',
    continuesPrevious: false,
    origin: 'human',
    status: 'confirmed',
    evidence: null,
    revision: 1,
    confirmedBy: 'u',
    confirmedAt: '2026-10-29T00:00:00Z',
    createdAt: '2026-10-29T00:00:00Z',
    updatedAt: '2026-10-29T00:00:00Z',
    coverUrl: null,
    sourceSpend: { spend30d: 5_000, class: 'qualified', asOf: '2026-10-29', complete: true, syncedDays: 30, windowDays: 30 },
  };
}

function renderLibrary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/content/ai-studio/segments']}>
        <Routes>
          <Route
            path="/content/ai-studio/segments"
            element={<SegmentLibraryView kind="framework" presets={[PRESET]} kindPresets={[PRESET]} preset={PRESET} canWrite={false} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(fetchStudioSegmentPool).mockResolvedValue({ items: [], productCounts: [] } as never);
  vi.mocked(fetchStudioSegments).mockImplementation(async (query) => ({
    items: [segment(query.spendClass ? 'filtered' : query.cursor ? 'page-2' : 'page-1')],
    nextCursor: query.spendClass || query.cursor ? null : 'next-page',
    assets: [],
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('segment library source-spend filter', () => {
  it('sends the class to the server and restarts cursor pagination', async () => {
    renderLibrary();
    expect(await screen.findByText('整片-page-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => expect(fetchStudioSegments).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'next-page' }),
      expect.anything(),
    ));

    fireEvent.mouseDown(screen.getByLabelText('原片消耗'));
    await userEvent.click(await screen.findByRole('option', { name: '达标' }));

    await waitFor(() => expect(fetchStudioSegments).toHaveBeenLastCalledWith(
      expect.objectContaining({ spendClass: 'qualified', cursor: undefined }),
      expect.anything(),
    ));
    expect(await screen.findByText('整片-filtered')).toBeInTheDocument();
    expect(screen.queryByText('整片-page-2')).not.toBeInTheDocument();
  });
});
