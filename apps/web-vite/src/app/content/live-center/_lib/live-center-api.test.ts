import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import {
  buildLiveCenterSessionParams,
  cleanupLiveCenterRecordingSegment,
  completeLiveCenterRecordingSegment,
  createLiveCenterAnalysisJob,
  createLiveCenterPlaybackUrl,
  createLiveCenterRecordingUpload,
  fetchLiveCenterDateBounds,
  fetchLiveCenterSessionDetail,
  fetchLiveCenterSessions,
  resumeLiveCenterRecordingMultipartUpload,
} from './live-center-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const getMock = vi.mocked(apiClient.get);
const postMock = vi.mocked(apiClient.post);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe('live-center API contract', () => {
  it('maps UI filters to the validated backend query names', () => {
    expect(buildLiveCenterSessionParams({
      keyword: '  serum  ',
      shopId: '  shop-1  ',
      anchorDouyinId: '  anchor-1  ',
      startDate: '2026-07-01',
      endDate: '2026-07-23',
      page: 2,
      pageSize: 50,
    })).toEqual({
      keyword: 'serum',
      shopId: 'shop-1',
      anchorDouyinId: 'anchor-1',
      startDate: '2026-07-01',
      endDate: '2026-07-23',
      page: 2,
      pageSize: 50,
    });
  });

  it('uses generated gateway-relative paths for date bounds and sessions', async () => {
    const dateBounds = { minDate: '2026-07-01', maxDate: '2026-07-23' };
    const sessions = { items: [], total: 0, page: 1, pageSize: 20 };
    const detail = {
      session: {
        sessionId: 'session-1',
        shopId: 'shop-1',
        shopName: 'Shop',
        anchorDouyinId: 'anchor-1',
        anchorNickname: 'Anchor',
        anchorAvatar: null,
        liveStartTime: '2026-07-23T00:00:00',
        liveEndTime: null,
        liveDurationMinutes: 0,
        liveOrderCount: 0,
        liveGmv: 0,
        liveUserPayAmount: 0,
        minuteOrderCount: 0,
        minutePointCount: 0,
        recordingSegmentCount: 0,
        analysisStatus: null,
      },
      minuteMetrics: [],
      recording: null,
      analyses: [],
    };
    getMock
      .mockResolvedValueOnce({ data: dateBounds } as Awaited<ReturnType<typeof apiClient.get>>)
      .mockResolvedValueOnce({ data: sessions } as Awaited<ReturnType<typeof apiClient.get>>)
      .mockResolvedValueOnce({ data: detail } as Awaited<ReturnType<typeof apiClient.get>>);

    await expect(fetchLiveCenterDateBounds()).resolves.toEqual(dateBounds);
    await expect(fetchLiveCenterSessions({ page: 1, pageSize: 20 })).resolves.toEqual(sessions);
    await expect(fetchLiveCenterSessionDetail('session/1')).resolves.toEqual(detail);

    expect(getMock).toHaveBeenNthCalledWith(1, AIOS_API_PATHS.liveCenterDateBounds, {
      signal: undefined,
    });
    expect(getMock).toHaveBeenNthCalledWith(2, AIOS_API_PATHS.liveCenterSessions, {
      params: { page: 1, pageSize: 20 },
      signal: undefined,
    });
    expect(getMock).toHaveBeenNthCalledWith(
      3,
      `${AIOS_API_PATHS.liveCenterSessions}/session%2F1`,
      { signal: undefined },
    );
  });

  it('keeps write adapters on the generated gateway-relative live-center base', async () => {
    postMock.mockResolvedValue({ data: {} } as Awaited<ReturnType<typeof apiClient.post>>);

    await createLiveCenterRecordingUpload('session/1', {
      fileName: 'recording.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 1024,
      segmentIndex: 1,
    });
    await completeLiveCenterRecordingSegment('recording/1', 'segment/1', {
      fileSizeBytes: 1024,
    });
    await resumeLiveCenterRecordingMultipartUpload('recording/1', 'segment/1', {
      sessionId: 'session-1',
      uploadId: 'upload-1',
      fileSizeBytes: 1024,
    });
    await createLiveCenterPlaybackUrl('recording/1', 'segment/1');
    await cleanupLiveCenterRecordingSegment('recording/1', 'segment/1');
    await createLiveCenterAnalysisJob('session/1', { model: 'model-1' });

    expect(postMock.mock.calls.map(([path]) => path)).toEqual([
      `${AIOS_API_PATHS.liveCenter}/sessions/session%2F1/recordings/uploads`,
      `${AIOS_API_PATHS.liveCenter}/recordings/recording%2F1/segments/segment%2F1/complete`,
      `${AIOS_API_PATHS.liveCenter}/recordings/recording%2F1/segments/segment%2F1/multipart/resume`,
      `${AIOS_API_PATHS.liveCenter}/recordings/recording%2F1/segments/segment%2F1/playback-url`,
      `${AIOS_API_PATHS.liveCenter}/recordings/recording%2F1/segments/segment%2F1/cleanup`,
      `${AIOS_API_PATHS.liveCenter}/sessions/session%2F1/analysis`,
    ]);
    expect(postMock.mock.calls[0]?.[1]).toMatchObject({
      fileName: 'recording.mp4',
      segmentIndex: 1,
    });
    expect(postMock.mock.calls[5]?.[1]).toEqual({ model: 'model-1' });
  });
});
