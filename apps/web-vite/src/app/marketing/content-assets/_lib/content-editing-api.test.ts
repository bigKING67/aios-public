import { expect, it, vi } from 'vitest';
import captionDocument from './fixtures/caption-candidate-document.json';
import { apiClient } from '@/lib/api-client';
import { adoptEditingCaptionCandidate, fetchEditingRun, type CaptionCandidate, type EditingRun } from './content-editing-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn() } }));
it('keeps a URL-supplied task identifier inside one API path segment', async () => {
  await fetchEditingRun('../projects?scope=all');
  expect(apiClient.get).toHaveBeenCalledWith('/v1/marketing/content-assets/production/runs/..%2Fprojects%3Fscope%3Dall', { signal: undefined });
});

it('adopts with returned plan version and frozen project revision without retries', async () => {
  const run = { runId: 'r', version: 3, planRevision: 1, projectRevision: 2 } as EditingRun;
  const candidate = { expectedVersion: 3, expectedPlanRevision: 1, expectedProjectRevision: 2, planDocument: captionDocument } as CaptionCandidate;
  vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, config: { method: 'post', url: '/fixture', baseURL: '', headers: {} }, data: { run: { ...run, version: 4, planRevision: 2 } } }).mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, config: { method: 'post', url: '/fixture', baseURL: '', headers: {} }, data: { run: { ...run, version: 5 } } });
  await adoptEditingCaptionCandidate(run, candidate);
  expect(apiClient.post).toHaveBeenCalledWith(expect.stringContaining('/plan-revisions'), {
    expectedVersion: 3, expectedPlanRevision: 1, document: candidate.planDocument, unlockClipIds: [],
  }, { retryAttempts: 0 });
  expect(apiClient.post).toHaveBeenLastCalledWith(expect.stringContaining('/adopt-plan'), { expectedVersion: 4, expectedPlanRevision: 2, expectedProjectRevision: 2 }, { retryAttempts: 0 });
  const calls = vi.mocked(apiClient.post).mock.calls.length;
  await expect(adoptEditingCaptionCandidate({ ...run, version: 9 }, candidate)).rejects.toThrow('版本已变化');
  expect(apiClient.post).toHaveBeenCalledTimes(calls);
});
it('reports saved plan separately when adoption fails', async () => {
  const run = { runId: 'r', version: 3, planRevision: 1, projectRevision: 2 } as EditingRun;
  const candidate = { expectedVersion: 3, expectedPlanRevision: 1, expectedProjectRevision: 2, planDocument: {} } as CaptionCandidate;
  vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, config: { method: 'post', url: '/fixture', baseURL: '', headers: {} }, data: { run: { ...run, version: 4, planRevision: 2 } } }).mockRejectedValueOnce(new Error('conflict'));
  await expect(adoptEditingCaptionCandidate(run, candidate)).rejects.toThrow('字幕方案已保存');
});
