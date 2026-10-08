import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  createSegmentSuggestionJobs,
  describeSuggestionLabels,
  fetchOwnSegmentSuggestionJobs,
  isSuggestionJobActive,
  readSuggestionJobOutcome,
  suggestionJobStatusView,
} from './segment-suggestion-api';
import { nextSuggestionPollInterval, SUGGESTION_POLL_INTERVAL_MS, SUGGESTION_POLL_WINDOW_MS } from '../_components/use-segment-suggestions';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

describe('segment suggestion API client', () => {
  it('creates jobs without automatic retries', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { items: [], reusedJobIds: [], labelKeyMismatchJobIds: [] } } as never);
    await createSegmentSuggestionJobs({ assetIds: ['a'], presetKey: 'framework', presetVersion: 1, labelKeys: ['x'] });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/marketing/content-assets/studio/segment-suggestions',
      { assetIds: ['a'], presetKey: 'framework', presetVersion: 1, labelKeys: ['x'] },
      { retryAttempts: 0 },
    );
  });

  it('lists the caller own recent jobs', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [{ jobId: 'j' }] } } as never);
    await expect(fetchOwnSegmentSuggestionJobs()).resolves.toEqual([{ jobId: 'j' }]);
    expect(apiClient.get).toHaveBeenCalledWith('/marketing/content-assets/studio/segment-suggestions', {
      params: { limit: 20 },
      signal: undefined,
    });
  });

  it('reads summaries defensively', () => {
    expect(readSuggestionJobOutcome({ segmentsInserted: 4, supersededSuggestions: 2, dropped: { unknown_label: 1, too_short: 2 }, skippedConfirmedDuplicates: 3 }))
      .toEqual({ inserted: 4, superseded: 2, dropped: 3, confirmedDuplicates: 3 });
    expect(readSuggestionJobOutcome({ segmentsInserted: -1, dropped: { a: 'x' } }))
      .toEqual({ inserted: null, superseded: null, dropped: null, confirmedDuplicates: null });
    expect(readSuggestionJobOutcome(null)).toBeNull();
    expect(readSuggestionJobOutcome([])).toBeNull();
  });

  it('summarizes candidate labels compactly', () => {
    const preset = {
      presetKey: 'framework', version: 1, status: 'active', dimension: 'framework', name: '框架 v1',
      labels: ['a', 'b', 'c', 'd'].map((key) => ({ key, name: key.toUpperCase(), definition: '' })),
    };
    expect(describeSuggestionLabels(['a', 'b', 'c', 'd'], preset)).toEqual({ short: '全部 4 类', full: 'A、B、C、D' });
    expect(describeSuggestionLabels(['a', 'c'], preset)).toEqual({ short: 'A、C', full: 'A、C' });
    expect(describeSuggestionLabels(['a', 'b', 'c'], preset)).toEqual({ short: 'A、B 等 3 类', full: 'A、B、C' });
    expect(describeSuggestionLabels(['a', 'zz'], undefined)).toEqual({ short: 'a、zz', full: 'a、zz' });
    expect(describeSuggestionLabels([], preset)).toEqual({ short: '--', full: '--' });
  });

  it('maps statuses', () => {
    expect(isSuggestionJobActive({ status: 'queued' })).toBe(true);
    expect(isSuggestionJobActive({ status: 'running' })).toBe(true);
    expect(isSuggestionJobActive({ status: 'failed' })).toBe(false);
    expect(suggestionJobStatusView('failed')).toEqual({ label: '失败', tone: 'danger' });
    expect(suggestionJobStatusView('unknown')).toEqual({ label: 'unknown', tone: 'neutral' });
  });
});

describe('suggestion polling', () => {
  it('polls only while a job is active and within the window', () => {
    const now = 1_000_000;
    expect(nextSuggestionPollInterval(undefined, now, now)).toBe(false);
    expect(nextSuggestionPollInterval([{ status: 'succeeded' }], now, now)).toBe(false);
    expect(nextSuggestionPollInterval([{ status: 'running' }], now, now + 1000)).toBe(SUGGESTION_POLL_INTERVAL_MS);
    expect(nextSuggestionPollInterval([{ status: 'queued' }], now, now + SUGGESTION_POLL_WINDOW_MS)).toBe(false);
  });
});
