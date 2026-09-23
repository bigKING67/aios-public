import type { LiveCenterRecordingSegment } from './live-center-types';

type SegmentStatusFields = Pick<LiveCenterRecordingSegment, 'processingStatus' | 'uploadStatus'>;

export function normalizeLiveCenterRecordingStatus(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function isLiveCenterRecordingSegmentPlayable(segment: SegmentStatusFields): boolean {
  const uploadStatus = normalizeLiveCenterRecordingStatus(segment.uploadStatus);
  const processingStatus = normalizeLiveCenterRecordingStatus(segment.processingStatus);
  return uploadStatus === 'uploaded' && processingStatus !== 'deleted' && processingStatus !== 'skipped';
}

export function isLiveCenterRecordingSegmentVisibleForReview(segment: SegmentStatusFields): boolean {
  const uploadStatus = normalizeLiveCenterRecordingStatus(segment.uploadStatus);
  const processingStatus = normalizeLiveCenterRecordingStatus(segment.processingStatus);
  return uploadStatus !== 'deleted' && processingStatus !== 'deleted' && processingStatus !== 'skipped';
}
