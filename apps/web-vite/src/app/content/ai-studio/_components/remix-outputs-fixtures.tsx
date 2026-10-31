/*
 * Test fixtures for the 成片 view tests (remix-outputs-view / remix-outputs-list). Callers mock
 * '../_lib/remix-api' (fetchRemixBatchPage, fetchRemixBatch, cancelRemixBatch) and
 * '../_lib/ai-studio-api' (fetchStudioPresets); the helpers drive those mocks.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { fetchStudioPresets, type StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import {
  fetchRemixBatchPage,
  isRemixBatchWithoutOutputs,
  REMIX_BATCH_PAGE_SIZE,
  remixBatchPendingReviewCount,
  type RemixBatchPageFilter,
  type StudioRemixBatch,
  type StudioRemixBatchItem,
} from '../_lib/remix-api';
import { RemixOutputsView } from './remix-outputs-view';

export const SOURCE = '9f9f9f9f-0000-4000-8000-000000000001';

export function capabilities(extra: Partial<StudioCapabilitiesResponse> = {}): StudioCapabilitiesResponse {
  return {
    enabled: true, openAccess: false, canWrite: true, segmentSuggestEnabled: false, segmentSuggestMaxAssets: 5,
    remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true, ...extra,
  };
}

/** Review counts default to the available outputs, none reviewed yet (待审核). */
export function batch(extra: Partial<StudioRemixBatch> = {}): StudioRemixBatch {
  return {
    qcFailedCount: 0,
    reviewableCount: extra.availableCount ?? 1, approvedCount: 0, rejectedCount: 0,
    batchId: 'b-1', mode: 'framework', ownerUserId: 'u-me', ownerName: null, ownedByCurrentUser: true, presetKey: 'framework', presetVersion: 1, labels: ['voice', 'demo'], sourceAssetId: null,
    productName: '粉底液', requestedCount: 3, plannedCount: 2, seed: 7, status: 'partially_failed',
    shortfallReason: '可用组合只有 2 种', succeededCount: 1, failedCount: 1, runningCount: 0, cancelledCount: 0, availableCount: 1,
    coverUrls: ['https://cdn.invalid/out-1.jpg'], failureReason: 'render_failed',
    createdAt: '2026-09-29T10:00:00+08:00', updatedAt: '2026-09-29T10:05:00+08:00', ...extra,
  };
}

export function item(ordinal: number, extra: Partial<StudioRemixBatchItem> = {}): StudioRemixBatchItem {
  return {
    qc: { status: 'passed', reasons: [], freezeCount: 0, timestampGapCount: 0, duplicatePairCount: 0, maxAvOffsetMs: 12, sourceStatus: 'passed' },
    ordinal, runId: `run-${ordinal}`, combinationHash: 'a'.repeat(64), outcome: 'succeeded', runStatus: 'succeeded',
    runStage: 'delivery', waitingReason: null, jobStatus: 'completed', jobError: null, outputAssetId: `out-${ordinal}`, outputDeleted: false,
    outputCoverUrl: `https://cdn.invalid/out-${ordinal}.jpg`, durationMs: 9500, review: null,
    segments: [
      { segmentId: `s-${ordinal}-1`, assetId: SOURCE, assetTitle: '整片-001', labelKey: 'voice', startMs: 0, endMs: 4500, slot: null, tier: null, fallback: null, sellingPoints: null, segmentIds: null },
      { segmentId: `s-${ordinal}-2`, assetId: SOURCE, assetTitle: '整片-001', labelKey: 'demo', startMs: 10000, endMs: 15000, slot: null, tier: null, fallback: null, sellingPoints: null, segmentIds: null },
    ],
    ...extra,
  };
}

/** Serves `all` the way the API does: filtered by type and outputs, numbered pages as the client asks for them, counts over everything. */
export function serveBatches(all: StudioRemixBatch[]) {
  const tally = (rows: StudioRemixBatch[]) => ({
    all: rows.length,
    framework: rows.filter((row) => row.mode === 'framework').length,
    sellingPoint: rows.filter((row) => row.mode === 'sellingPoint').length,
    edit: rows.filter((row) => row.mode === 'edit').length,
  });
  vi.mocked(fetchRemixBatchPage).mockImplementation(async (filter: RemixBatchPageFilter, page: number) => {
    const allRejected = (row: StudioRemixBatch) => row.reviewableCount > 0 && row.rejectedCount >= row.reviewableCount;
    const matching = all.filter(
      (row) =>
        (!filter.mode || row.mode === filter.mode) &&
        (filter.outputs === null || (!allRejected(row) && (filter.outputs === 'without') === isRemixBatchWithoutOutputs(row))) &&
        (filter.review === null || (filter.review === 'rejected' ? row.rejectedCount > 0 : remixBatchPendingReviewCount(row) > 0)) &&
        (!filter.quality || row.qcFailedCount > 0),
    );
    const start = (page - 1) * REMIX_BATCH_PAGE_SIZE;
    return {
      items: matching.slice(start, start + REMIX_BATCH_PAGE_SIZE),
      nextCursor: null,
      counts: {
        rejected: tally(all.filter((row) => row.rejectedCount > 0)),
        qcFailed: tally(all.filter((row) => row.qcFailedCount > 0)),
        withOutputs: tally(all.filter((row) => !allRejected(row) && !isRemixBatchWithoutOutputs(row))),
        withoutOutputs: tally(all.filter((row) => !allRejected(row) && isRemixBatchWithoutOutputs(row))),
        pendingReview: tally(all.filter((row) => remixBatchPendingReviewCount(row) > 0)),
      },
    };
  });
}

/** Renders 成片 at `entry`; the returned router's `state.location` shows where actions navigated. */
export function renderView(entry: string, caps = capabilities()) {
  // Mirrors the app-wide mutation retry default so a cancel that retried would be caught.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 1 } } });
  const router = createMemoryRouter([{ path: '*', element: <RemixOutputsView capabilities={caps} /> }], { initialEntries: [entry] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** The framework preset the batch labels resolve against. */
export function seedPresets() {
  vi.mocked(fetchStudioPresets).mockResolvedValue([
    {
      presetKey: 'framework', version: 1, status: 'active', dimension: 'framework', name: '框架 v1',
      labels: [{ key: 'voice', name: '混剪口播', definition: '' }, { key: 'demo', name: '实拍内容', definition: '' }],
    },
  ]);
}
