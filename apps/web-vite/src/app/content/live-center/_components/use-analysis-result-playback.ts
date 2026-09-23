import { useCallback, useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import { resolveClientErrorMessage } from '@/lib/client-error';
import { createLiveCenterPlaybackUrl } from '../_lib/live-center-api';
import type { LiveCenterRecording } from '../_lib/live-center-types';
import type { LiveCenterAnalysisTimeAnchor } from '../_lib/live-center-view-helpers';
import {
  buildAnalysisResultPlaybackScopeKey,
  createAnalysisResultPlaybackResolver,
  isFiniteNumber,
  isPlaybackNearTarget,
  resolveBoundedPlaybackSeekSeconds,
  resolvePlaybackSeekMessage,
  resolvePlaybackSegmentLabel,
  type AnalysisResultPlaybackResolver,
  type AnalysisResultPlaybackState,
  type PlaybackSeekStatus,
} from './live-center-analysis-result-playback-helpers';
import {
  buildTimeAnchorPlaybackKey,
  formatReaderTimeAnchor,
} from './live-center-analysis-result-formatters';

export interface UseAnalysisResultPlaybackReturn {
  clearPlaybackError: () => void;
  closePlayback: () => void;
  handlePlaybackLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  handlePlaybackRetrySeek: () => void;
  handlePlaybackSeekStatusChange: (status: PlaybackSeekStatus) => void;
  handlePlaybackSeeked: (event: SyntheticEvent<HTMLVideoElement>) => void;
  isTimeAnchorPlayable: (anchor: LiveCenterAnalysisTimeAnchor) => boolean;
  playback: AnalysisResultPlaybackState | null;
  playbackError: string | null;
  playbackLoadingKey: string | null;
  playbackSeekMessage: string | null;
  playbackSeekStatus: PlaybackSeekStatus;
  playbackVideoRef: RefObject<HTMLVideoElement | null>;
  playTimeAnchor: (anchor: LiveCenterAnalysisTimeAnchor, sourceLabel: string) => Promise<void>;
}

export function useAnalysisResultPlayback({
  recording,
}: {
  recording?: LiveCenterRecording | null;
}): UseAnalysisResultPlaybackReturn {
  const [playback, setPlayback] = useState<AnalysisResultPlaybackState | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackLoadingKey, setPlaybackLoadingKey] = useState<string | null>(null);
  const [playbackSeekStatus, setPlaybackSeekStatus] = useState<PlaybackSeekStatus>('idle');
  const isMountedRef = useRef(true);
  const playbackRequestSeqRef = useRef(0);
  const playbackResolverCacheRef = useRef<{
    resolver: AnalysisResultPlaybackResolver;
    scopeKey: string;
  } | null>(null);
  const playbackSeekTimerRef = useRef<number | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackScopeKey = buildAnalysisResultPlaybackScopeKey(recording);
  const playbackScopeKeyRef = useRef(playbackScopeKey);
  playbackScopeKeyRef.current = playbackScopeKey;
  if (playbackResolverCacheRef.current?.scopeKey !== playbackScopeKey) {
    playbackResolverCacheRef.current = {
      resolver: createAnalysisResultPlaybackResolver(recording),
      scopeKey: playbackScopeKey,
    };
  }
  const playbackResolver = playbackResolverCacheRef.current.resolver;

  const clearPlaybackSeekTimer = useCallback(() => {
    if (playbackSeekTimerRef.current !== null) {
      window.clearTimeout(playbackSeekTimerRef.current);
      playbackSeekTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    isMountedRef.current = false;
    clearPlaybackSeekTimer();
  }, [clearPlaybackSeekTimer]);

  useEffect(() => {
    playbackRequestSeqRef.current += 1;
    clearPlaybackSeekTimer();
    setPlayback(null);
    setPlaybackError(null);
    setPlaybackLoadingKey(null);
    setPlaybackSeekStatus('idle');
  }, [clearPlaybackSeekTimer, playbackScopeKey]);

  const isPlaybackRequestCurrent = (requestSeq: number, requestScopeKey: string) => (
    isMountedRef.current &&
    playbackRequestSeqRef.current === requestSeq &&
    playbackScopeKeyRef.current === requestScopeKey &&
    playbackResolverCacheRef.current?.scopeKey === requestScopeKey
  );

  const isPlaybackSegmentStillPlayable = (requestScopeKey: string, segmentId: string) => (
    playbackResolverCacheRef.current?.scopeKey === requestScopeKey &&
    playbackResolverCacheRef.current.resolver.hasPlayableSegment(segmentId)
  );

  const isTimeAnchorPlayable = (anchor: LiveCenterAnalysisTimeAnchor) => Boolean(
    playbackResolver.isTimeAnchorPlayable(anchor)
  );

  const playTimeAnchor = async (anchor: LiveCenterAnalysisTimeAnchor, sourceLabel: string) => {
    const requestSeq = playbackRequestSeqRef.current + 1;
    playbackRequestSeqRef.current = requestSeq;
    const requestScopeKey = playbackScopeKey;
    clearPlaybackSeekTimer();
    const target = playbackResolver.resolveTarget(anchor);
    const anchorLabel = formatReaderTimeAnchor(anchor);
    if (!target || !playbackResolver.recordingId) {
      setPlaybackError(anchorLabel
        ? `未找到可播放的已上传录屏分段：${anchorLabel}`
        : '这条证据缺少可定位的录屏时间锚点，无法直接播放。');
      return;
    }

    const loadingKey = buildTimeAnchorPlaybackKey(anchor, sourceLabel);
    setPlaybackError(null);
    setPlaybackLoadingKey(loadingKey);
    setPlaybackSeekStatus('loading_url');
    try {
      const response = await createLiveCenterPlaybackUrl(playbackResolver.recordingId, target.segment.segmentId);
      if (
        !isPlaybackRequestCurrent(requestSeq, requestScopeKey) ||
        !isPlaybackSegmentStillPlayable(requestScopeKey, target.segment.segmentId)
      ) {
        return;
      }
      const segmentLabel = resolvePlaybackSegmentLabel(anchor, target.segment);
      setPlayback({
        anchorLabel,
        contentType: response.contentType,
        expiresAt: response.expiresAt,
        fileName: target.segment.fileName || segmentLabel,
        fileSizeBytes: response.fileSizeBytes,
        recordingId: playbackResolver.recordingId,
        scopeKey: requestScopeKey,
        seekSeconds: target.seekSeconds,
        segmentId: target.segment.segmentId,
        segmentLabel,
        sourceLabel,
        url: response.url,
      });
      setPlaybackSeekStatus(isFiniteNumber(target.seekSeconds) ? 'waiting_metadata' : 'positioned');
    } catch (error) {
      if (!isPlaybackRequestCurrent(requestSeq, requestScopeKey)) {
        return;
      }
      setPlayback(null);
      setPlaybackSeekStatus('idle');
      setPlaybackError(resolveClientErrorMessage(error, '录屏播放地址获取失败，请稍后重试。'));
    } finally {
      if (isPlaybackRequestCurrent(requestSeq, requestScopeKey)) {
        setPlaybackLoadingKey(null);
      }
    }
  };

  const refreshPlaybackUrl = async () => {
    if (!playback) {
      return;
    }
    const requestSeq = playbackRequestSeqRef.current + 1;
    playbackRequestSeqRef.current = requestSeq;
    const requestScopeKey = playback.scopeKey;
    const requestSegmentId = playback.segmentId;
    if (
      playbackScopeKeyRef.current !== requestScopeKey ||
      !isPlaybackSegmentStillPlayable(requestScopeKey, requestSegmentId)
    ) {
      setPlaybackSeekStatus('idle');
      setPlaybackError('该录屏分段状态已变化，请刷新结果页后重新定位。');
      return;
    }

    clearPlaybackSeekTimer();
    setPlaybackError(null);
    setPlaybackSeekStatus('loading_url');
    try {
      const response = await createLiveCenterPlaybackUrl(playback.recordingId, requestSegmentId);
      if (
        !isPlaybackRequestCurrent(requestSeq, requestScopeKey) ||
        !isPlaybackSegmentStillPlayable(requestScopeKey, requestSegmentId)
      ) {
        return;
      }
      setPlayback((currentPlayback) => {
        if (!currentPlayback || currentPlayback.segmentId !== requestSegmentId || currentPlayback.scopeKey !== requestScopeKey) {
          return currentPlayback;
        }
        return {
          ...currentPlayback,
          contentType: response.contentType,
          expiresAt: response.expiresAt,
          fileSizeBytes: response.fileSizeBytes,
          url: response.url,
        };
      });
      setPlaybackSeekStatus(isFiniteNumber(playback.seekSeconds) ? 'waiting_metadata' : 'positioned');
    } catch (error) {
      if (!isPlaybackRequestCurrent(requestSeq, requestScopeKey)) {
        return;
      }
      setPlaybackSeekStatus('video_error');
      setPlaybackError(resolveClientErrorMessage(error, '录屏播放地址刷新失败，请稍后重试。'));
    }
  };

  const closePlayback = () => {
    playbackRequestSeqRef.current += 1;
    clearPlaybackSeekTimer();
    setPlayback(null);
    setPlaybackLoadingKey(null);
    setPlaybackSeekStatus('idle');
  };

  const clearPlaybackError = () => {
    setPlaybackError(null);
  };

  const applyPlaybackSeek = (video: HTMLVideoElement) => {
    if (!playback) {
      return;
    }
    if (!isFiniteNumber(playback.seekSeconds)) {
      setPlaybackSeekStatus('positioned');
      return;
    }
    const targetSeekSeconds = resolveBoundedPlaybackSeekSeconds(playback.seekSeconds, video.duration);
    try {
      clearPlaybackSeekTimer();
      setPlaybackSeekStatus('seeking');
      video.currentTime = targetSeekSeconds;
      playbackSeekTimerRef.current = window.setTimeout(() => {
        playbackSeekTimerRef.current = null;
        if (playbackVideoRef.current !== video) {
          return;
        }
        setPlaybackSeekStatus((currentStatus) => {
          if (currentStatus !== 'seeking') {
            return currentStatus;
          }
          return isPlaybackNearTarget(video.currentTime, targetSeekSeconds)
            ? 'positioned'
            : currentStatus;
        });
      }, 800);
    } catch {
      clearPlaybackSeekTimer();
      setPlaybackSeekStatus('seek_failed');
    }
  };

  const handlePlaybackLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    applyPlaybackSeek(event.currentTarget);
  };

  const handlePlaybackSeeked = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!playback || !isFiniteNumber(playback.seekSeconds)) {
      setPlaybackSeekStatus('positioned');
      return;
    }
    const targetSeekSeconds = resolveBoundedPlaybackSeekSeconds(playback.seekSeconds, event.currentTarget.duration);
    setPlaybackSeekStatus(isPlaybackNearTarget(event.currentTarget.currentTime, targetSeekSeconds)
      ? 'positioned'
      : 'seek_failed');
  };

  const handlePlaybackRetrySeek = () => {
    if (!playback) {
      return;
    }
    if (playbackSeekStatus === 'video_error') {
      void refreshPlaybackUrl();
      return;
    }
    if (!isFiniteNumber(playback.seekSeconds)) {
      return;
    }
    const video = playbackVideoRef.current;
    if (!video || video.readyState < 1) {
      setPlaybackSeekStatus('waiting_metadata');
      video?.load();
      return;
    }
    applyPlaybackSeek(video);
  };

  const handlePlaybackSeekStatusChange = (status: PlaybackSeekStatus) => {
    setPlaybackSeekStatus(status);
  };

  const playbackSeekMessage = playback
    ? resolvePlaybackSeekMessage(playback, playbackSeekStatus)
    : null;

  return {
    clearPlaybackError,
    closePlayback,
    handlePlaybackLoadedMetadata,
    handlePlaybackRetrySeek,
    handlePlaybackSeekStatusChange,
    handlePlaybackSeeked,
    isTimeAnchorPlayable,
    playback,
    playbackError,
    playbackLoadingKey,
    playbackSeekMessage,
    playbackSeekStatus,
    playbackVideoRef,
    playTimeAnchor,
  };
}
