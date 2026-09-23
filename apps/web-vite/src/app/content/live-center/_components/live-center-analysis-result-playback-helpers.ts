import { formatDurationSeconds } from '../_lib/live-center-formatters';
import { isLiveCenterRecordingSegmentPlayable } from '../_lib/live-center-recording-segment-helpers';
import type {
  LiveCenterAnalysisTimeAnchor,
} from '../_lib/live-center-view-helpers';
import type {
  LiveCenterRecording,
  LiveCenterRecordingSegment,
} from '../_lib/live-center-types';

const PLAYBACK_SEEK_TOLERANCE_SECONDS = 1.5;

export type PlaybackSeekStatus =
  | 'idle'
  | 'loading_url'
  | 'waiting_metadata'
  | 'seeking'
  | 'positioned'
  | 'seek_failed'
  | 'video_error';

export interface AnalysisResultPlaybackState {
  anchorLabel: string | null;
  contentType: string | null;
  expiresAt: string;
  fileName: string;
  fileSizeBytes: number | null;
  recordingId: string;
  scopeKey: string;
  seekSeconds: number | null;
  segmentId: string;
  segmentLabel: string;
  sourceLabel: string;
  url: string;
}

export interface AnalysisResultPlaybackTarget {
  seekSeconds: number | null;
  segment: LiveCenterRecordingSegment;
}

export interface AnalysisResultPlaybackResolver {
  hasPlayableSegment: (segmentId: string) => boolean;
  isTimeAnchorPlayable: (anchor: LiveCenterAnalysisTimeAnchor) => boolean;
  recordingId: string | null;
  resolveTarget: (anchor: LiveCenterAnalysisTimeAnchor) => AnalysisResultPlaybackTarget | null;
  scopeKey: string;
}

interface PlaybackSegmentWindow {
  endOffsetSeconds: number | null;
  segment: LiveCenterRecordingSegment;
  startOffsetSeconds: number | null;
}

interface PlaybackAnchorOffsets {
  probeOffsetSeconds: number | null;
  seekOffsetSeconds: number | null;
}

const EMPTY_PLAYBACK_RESOLVER: AnalysisResultPlaybackResolver = {
  hasPlayableSegment: () => false,
  isTimeAnchorPlayable: () => false,
  recordingId: null,
  resolveTarget: () => null,
  scopeKey: 'no-recording',
};

export function buildAnalysisResultPlaybackScopeKey(
  recording: LiveCenterRecording | null | undefined
): string {
  if (!recording?.recordingId) {
    return 'no-recording';
  }
  const segmentSignature = recording.segments.map((segment) => [
    segment.segmentId,
    segment.segmentIndex,
    segment.displaySegmentIndex ?? '',
    segment.uploadStatus ?? '',
    segment.processingStatus ?? '',
    segment.startOffsetSeconds ?? '',
    segment.endOffsetSeconds ?? '',
    segment.durationSeconds ?? '',
  ].join('~')).join('|');
  return [
    recording.recordingId,
    recording.status ?? '',
    segmentSignature,
  ].join('::');
}

export function createAnalysisResultPlaybackResolver(
  recording: LiveCenterRecording | null | undefined
): AnalysisResultPlaybackResolver {
  if (!recording?.recordingId) {
    return EMPTY_PLAYBACK_RESOLVER;
  }

  const scopeKey = buildAnalysisResultPlaybackScopeKey(recording);
  const segmentWindows = buildPlaybackSegmentWindows(recording.segments);
  const playableSegmentWindows = segmentWindows.filter((candidate) => (
    isLiveCenterRecordingSegmentPlayable(candidate.segment)
  ));
  const playableSegmentIds = new Set(playableSegmentWindows.map((candidate) => candidate.segment.segmentId));

  const resolveTarget = (anchor: LiveCenterAnalysisTimeAnchor): AnalysisResultPlaybackTarget | null => {
    const offsets = resolvePlaybackAnchorOffsets(anchor);
    const offsetWindow = resolvePlaybackSegmentWindowByOffset(playableSegmentWindows, offsets.probeOffsetSeconds);
    const explicitWindow = anchor.segmentIndex !== null
      ? segmentWindows.find((candidate) => candidate.segment.segmentIndex === anchor.segmentIndex) ?? null
      : null;
    const targetWindow = resolvePlaybackTargetWindow({
      explicitWindow,
      offsetWindow,
      probeOffsetSeconds: offsets.probeOffsetSeconds,
    });
    if (!targetWindow || !isLiveCenterRecordingSegmentPlayable(targetWindow.segment)) {
      return null;
    }

    const segmentStartOffset = isFiniteNumber(targetWindow.startOffsetSeconds)
      ? targetWindow.startOffsetSeconds
      : 0;
    const seekSeconds = offsets.seekOffsetSeconds !== null
      ? Math.max(0, offsets.seekOffsetSeconds - segmentStartOffset)
      : null;
    return {
      seekSeconds,
      segment: targetWindow.segment,
    };
  };

  return {
    hasPlayableSegment: (segmentId: string) => playableSegmentIds.has(segmentId),
    isTimeAnchorPlayable: (anchor: LiveCenterAnalysisTimeAnchor) => Boolean(resolveTarget(anchor)),
    recordingId: recording.recordingId,
    resolveTarget,
    scopeKey,
  };
}

export function resolvePlaybackTarget(
  recording: LiveCenterRecording | null | undefined,
  anchor: LiveCenterAnalysisTimeAnchor
): AnalysisResultPlaybackTarget | null {
  return createAnalysisResultPlaybackResolver(recording).resolveTarget(anchor);
}

function resolvePlaybackTargetWindow({
  explicitWindow,
  offsetWindow,
  probeOffsetSeconds,
}: {
  explicitWindow: PlaybackSegmentWindow | null;
  offsetWindow: PlaybackSegmentWindow | null;
  probeOffsetSeconds: number | null;
}): PlaybackSegmentWindow | null {
  if (!explicitWindow) {
    return offsetWindow;
  }
  if (!isLiveCenterRecordingSegmentPlayable(explicitWindow.segment)) {
    return offsetWindow;
  }
  if (probeOffsetSeconds === null) {
    return explicitWindow;
  }
  if (isOffsetInsidePlaybackSegmentWindow(probeOffsetSeconds, explicitWindow)) {
    return explicitWindow;
  }
  // Cleanup/retry can leave raw segmentIndex stale. Prefer the absolute offset
  // when available so the playback target follows the current recording state.
  return offsetWindow;
}

function buildPlaybackSegmentWindows(segments: LiveCenterRecordingSegment[]): PlaybackSegmentWindow[] {
  const sortedSegments = [...segments].sort((left, right) => left.segmentIndex - right.segmentIndex);
  let rollingOffsetSeconds = 0;
  let canInferFromRollingOffset = true;

  return sortedSegments.map((segment) => {
    const durationSeconds = isFiniteNumber(segment.durationSeconds)
      ? Math.max(0, segment.durationSeconds)
      : null;
    const explicitStartOffset = isFiniteNumber(segment.startOffsetSeconds)
      ? segment.startOffsetSeconds
      : null;
    const explicitEndOffset = isFiniteNumber(segment.endOffsetSeconds)
      ? segment.endOffsetSeconds
      : null;
    const inferredStartFromEnd = explicitEndOffset !== null && durationSeconds !== null
      ? Math.max(0, explicitEndOffset - durationSeconds)
      : null;
    const startOffsetSeconds =
      explicitStartOffset ??
      inferredStartFromEnd ??
      (canInferFromRollingOffset && durationSeconds !== null ? rollingOffsetSeconds : null);
    const endOffsetSeconds =
      explicitEndOffset ??
      (startOffsetSeconds !== null && durationSeconds !== null ? startOffsetSeconds + durationSeconds : null);

    if (endOffsetSeconds !== null) {
      rollingOffsetSeconds = endOffsetSeconds;
      canInferFromRollingOffset = true;
    } else {
      canInferFromRollingOffset = false;
      if (startOffsetSeconds !== null) {
        rollingOffsetSeconds = startOffsetSeconds;
      }
    }

    return {
      endOffsetSeconds,
      segment,
      startOffsetSeconds,
    };
  });
}

function resolvePlaybackSegmentWindowByOffset(
  segmentWindows: PlaybackSegmentWindow[],
  probeOffsetSeconds: number | null
): PlaybackSegmentWindow | null {
  if (probeOffsetSeconds === null) {
    return null;
  }

  return segmentWindows.find((candidate) => (
    isOffsetInsidePlaybackSegmentWindow(probeOffsetSeconds, candidate)
  )) ?? null;
}

function resolvePlaybackAnchorOffsets(anchor: LiveCenterAnalysisTimeAnchor): PlaybackAnchorOffsets {
  if (isFiniteNumber(anchor.offsetStartSeconds)) {
    return {
      probeOffsetSeconds: anchor.offsetStartSeconds,
      seekOffsetSeconds: anchor.offsetStartSeconds,
    };
  }
  if (!isFiniteNumber(anchor.offsetEndSeconds)) {
    return {
      probeOffsetSeconds: null,
      seekOffsetSeconds: null,
    };
  }
  return {
    probeOffsetSeconds: Math.max(0, anchor.offsetEndSeconds - 0.001),
    seekOffsetSeconds: anchor.offsetEndSeconds,
  };
}

function isOffsetInsidePlaybackSegmentWindow(
  offsetSeconds: number,
  segmentWindow: PlaybackSegmentWindow
): boolean {
  if (
    !isFiniteNumber(segmentWindow.startOffsetSeconds) ||
    !isFiniteNumber(segmentWindow.endOffsetSeconds) ||
    segmentWindow.endOffsetSeconds < segmentWindow.startOffsetSeconds
  ) {
    return false;
  }
  return offsetSeconds >= segmentWindow.startOffsetSeconds && offsetSeconds < segmentWindow.endOffsetSeconds;
}

export function resolvePlaybackSegmentLabel(
  anchor: LiveCenterAnalysisTimeAnchor,
  segment: LiveCenterRecordingSegment
): string {
  const segmentDisplayLabel = formatPlaybackSegmentDisplayLabel(segment.displaySegmentIndex ?? null);
  if (anchor.segmentLabel) {
    const sanitizedLabel = sanitizePlaybackSegmentLabel(anchor.segmentLabel);
    if (
      sanitizedLabel &&
      (!segmentDisplayLabel || resolvePlaybackSegmentLabelNumber(sanitizedLabel) === segment.displaySegmentIndex)
    ) {
      return sanitizedLabel;
    }
  }
  if (segmentDisplayLabel) {
    return segmentDisplayLabel;
  }
  if (anchor.displaySegmentIndex !== null) {
    return `录屏 #${anchor.displaySegmentIndex}`;
  }
  return `录屏 #${segment.segmentIndex}`;
}

function sanitizePlaybackSegmentLabel(value: string): string | null {
  const normalized = value
    .replace(/\s*\/\s*slice\s*\d+/gi, '')
    .replace(/\bslice\s*[:#-]?\s*\d+\b/gi, '')
    .replace(/\bsegment\s*[:#-]?\s*(\d+)\b/gi, '录屏 #$1')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function formatPlaybackSegmentDisplayLabel(displaySegmentIndex: number | null): string | null {
  return displaySegmentIndex !== null && Number.isFinite(displaySegmentIndex)
    ? `录屏 #${displaySegmentIndex}`
    : null;
}

function resolvePlaybackSegmentLabelNumber(label: string): number | null {
  const match = /录屏\s*#?\s*(\d+)/i.exec(label);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function resolveBoundedPlaybackSeekSeconds(seekSeconds: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, seekSeconds);
  }
  return Math.max(0, Math.min(seekSeconds, Math.max(duration - 0.25, 0)));
}

export function isPlaybackNearTarget(currentTime: number, targetSeekSeconds: number): boolean {
  return Number.isFinite(currentTime)
    && Math.abs(currentTime - targetSeekSeconds) <= PLAYBACK_SEEK_TOLERANCE_SECONDS;
}

export function resolvePlaybackSeekMessage(
  playback: AnalysisResultPlaybackState,
  status: PlaybackSeekStatus
): string | null {
  const targetLabel = isFiniteNumber(playback.seekSeconds)
    ? formatDurationSeconds(playback.seekSeconds)
    : null;
  switch (status) {
    case 'loading_url':
      return '正在准备录屏播放地址...';
    case 'waiting_metadata':
      return targetLabel
        ? `正在读取视频元数据，准备定位到 ${targetLabel}；若长时间不动，可先手动拖到该时间点。`
        : '正在读取视频元数据，准备从分段开头播放。';
    case 'seeking':
      return targetLabel
        ? `正在定位到 ${targetLabel}...`
        : '正在打开分段开头...';
    case 'positioned':
      return targetLabel
        ? `已定位到 ${targetLabel}；开始播放前可先核对画面与话术。`
        : '已打开分段开头；开始播放前可先核对画面与话术。';
    case 'seek_failed':
      return targetLabel
        ? `自动定位失败，可手动拖到 ${targetLabel}，或点击“重新定位”。`
        : '自动定位失败，可从分段开头手动播放。';
    case 'video_error':
      return targetLabel
        ? `视频加载失败，可刷新播放地址后重试，或在有效期内手动定位到 ${targetLabel}。`
        : '视频加载失败，可刷新播放地址后重试。';
    case 'idle':
    default:
      return null;
  }
}
