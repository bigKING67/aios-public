import type { KeyboardEvent } from 'react';
import type {
  LiveCenterRecording,
  LiveCenterRecordingSegment,
} from './live-center-types';

export const LIVE_CENTER_VIDEO_ACCEPT = [
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.avi',
  '.mkv',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
].join(',');

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'] as const;
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
]);
const RECORDING_FILE_TIMESTAMP_PATTERNS = [
  /((?:19|20)\d{2})[-_](\d{2})[-_](\d{2})[\s_-]+(\d{2})[-_:](\d{2})(?:[-_:](\d{2}))?/,
  /((?:19|20)\d{2})(\d{2})(\d{2})[\s_-]?(\d{2})(\d{2})(?:(\d{2}))?/,
  /((?:19|20)\d{2})年(\d{2})月(\d{2})日[\s_]*(\d{2})(?:时|点)(\d{2})(?:分(?:(\d{2})秒?)?)?/,
] as const;

export function resolveAvatarText(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 1) : '直';
}

export function resolveUploadSegmentIndexes(
  recording: LiveCenterRecording | null | undefined,
  fallbackSegmentCount: number | null | undefined,
  count: number
): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];

  const segments = recording?.segments ?? [];
  const requestedCount = Math.floor(count);
  const failedIndexes = segments
    .filter(isRetriableSegment)
    .map((segment) => segment.segmentIndex)
    .filter(isUsableSegmentIndex)
    .sort((left, right) => left - right);
  const occupiedIndexes = new Set(
    segments.filter(isOccupiedSegment).map((segment) => segment.segmentIndex).filter(isUsableSegmentIndex)
  );
  const knownIndexes = segments.map((segment) => segment.segmentIndex).filter(isUsableSegmentIndex);
  const maxKnownIndex = Math.max(
    0,
    typeof fallbackSegmentCount === 'number' && Number.isFinite(fallbackSegmentCount)
      ? Math.floor(fallbackSegmentCount)
      : 0,
    ...knownIndexes
  );
  const segmentIndexes = failedIndexes.slice(0, requestedCount);
  let nextSegmentIndex = Math.max(1, maxKnownIndex + 1);
  while (segmentIndexes.length < requestedCount) {
    if (!occupiedIndexes.has(nextSegmentIndex)) segmentIndexes.push(nextSegmentIndex);
    nextSegmentIndex += 1;
  }
  return segmentIndexes;
}

export function resolveNextSegmentIndex(
  recording?: LiveCenterRecording | null,
  fallbackSegmentCount?: number | null
): number {
  return resolveUploadSegmentIndexes(recording, fallbackSegmentCount, 1)[0] ?? 1;
}

function isUsableSegmentIndex(segmentIndex: number): boolean {
  return Number.isFinite(segmentIndex) && segmentIndex > 0;
}

function isOccupiedSegment(segment: LiveCenterRecordingSegment): boolean {
  const uploadStatus = segment.uploadStatus?.trim().toLowerCase();
  return uploadStatus === 'pending' || uploadStatus === 'uploading' || uploadStatus === 'uploaded';
}

function isRetriableSegment(segment: LiveCenterRecordingSegment): boolean {
  const uploadStatus = segment.uploadStatus?.trim().toLowerCase();
  return uploadStatus === 'failed';
}

export function isAcceptedLiveRecordingFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  if (extension && VIDEO_EXTENSIONS.includes(extension as typeof VIDEO_EXTENSIONS[number])) return true;
  const mimeType = file.type.trim().toLowerCase();
  return mimeType ? VIDEO_MIME_TYPES.has(mimeType) : false;
}

export function sortLiveCenterRecordingFiles(files: File[]): File[] {
  return files
    .map((file, index) => ({ file, index, timestampSortKey: resolveLiveCenterRecordingFileTimestampSortKey(file.name) }))
    .sort((left, right) => {
      if (left.timestampSortKey !== null && right.timestampSortKey !== null) {
        const timestampDiff = left.timestampSortKey - right.timestampSortKey;
        if (timestampDiff !== 0) return timestampDiff;
      } else if (left.timestampSortKey !== null) return -1;
      else if (right.timestampSortKey !== null) return 1;

      const nameDiff = left.file.name.localeCompare(right.file.name, 'zh-CN', {
        numeric: true,
        sensitivity: 'base',
      });
      return nameDiff !== 0 ? nameDiff : left.index - right.index;
    })
    .map((entry) => entry.file);
}

export function resolveLiveCenterRecordingFileTimestampSortKey(fileName: string): number | null {
  for (const pattern of RECORDING_FILE_TIMESTAMP_PATTERNS) {
    const matched = pattern.exec(fileName);
    if (!matched) continue;
    const sortKey = buildRecordingTimestampSortKey(matched);
    if (sortKey !== null) return sortKey;
  }
  return null;
}

export function isActivationKey(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' || event.key === ' ';
}

function buildRecordingTimestampSortKey(matched: RegExpExecArray): number | null {
  const [, year, month, day, hour, minute, second = '00'] = matched;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] = parts;
  if (
    !year || !month || !day || !hour || !minute
    || !isInRange(monthNumber, 1, 12)
    || !isInRange(dayNumber, 1, 31)
    || !isInRange(hourNumber, 0, 23)
    || !isInRange(minuteNumber, 0, 59)
    || !isInRange(secondNumber, 0, 59)
  ) return null;
  const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber, hourNumber, minuteNumber, secondNumber));
  if (
    date.getUTCFullYear() !== yearNumber
    || date.getUTCMonth() !== monthNumber - 1
    || date.getUTCDate() !== dayNumber
    || date.getUTCHours() !== hourNumber
    || date.getUTCMinutes() !== minuteNumber
    || date.getUTCSeconds() !== secondNumber
  ) return null;
  return Number(`${year}${month}${day}${hour}${minute}${second}`);
}

function isInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
