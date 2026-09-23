import { Button } from 'antd';
import type { RefObject, SyntheticEvent } from 'react';
import {
  formatDurationSeconds,
  formatFileSize,
  formatFullDateTime,
} from '../_lib/live-center-formatters';
import playbackStyles from '../live-center-analysis-result-playback.module.css';
import {
  isFiniteNumber,
  type AnalysisResultPlaybackState,
  type PlaybackSeekStatus,
} from './live-center-analysis-result-playback-helpers';

export function AnalysisResultPlaybackPanel({
  onClose,
  onLoadedMetadata,
  onRetrySeek,
  onSeekStatusChange,
  onSeeked,
  playback,
  playbackSeekMessage,
  playbackSeekStatus,
  playbackVideoRef,
}: {
  onClose: () => void;
  onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onRetrySeek: () => void;
  onSeekStatusChange: (status: PlaybackSeekStatus) => void;
  onSeeked: (event: SyntheticEvent<HTMLVideoElement>) => void;
  playback: AnalysisResultPlaybackState;
  playbackSeekMessage: string | null;
  playbackSeekStatus: PlaybackSeekStatus;
  playbackVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  return (
    <section className={playbackStyles.analysisResultPlaybackPanel} aria-label="录屏定位播放">
      <div className={playbackStyles.analysisResultPlaybackHeader}>
        <div>
          <span>录屏定位</span>
          <strong>{playback.sourceLabel}</strong>
        </div>
        <Button size="small" onClick={onClose}>
          收起播放
        </Button>
      </div>
      <video
        key={`${playback.segmentId}:${playback.seekSeconds ?? 'start'}:${playback.expiresAt}`}
        ref={playbackVideoRef}
        className={playbackStyles.analysisResultPlaybackVideo}
        controls
        data-playback-seek-target={playback.seekSeconds ?? undefined}
        onCanPlay={(event) => {
          if (playbackSeekStatus === 'waiting_metadata') {
            onLoadedMetadata(event);
          }
        }}
        onError={() => onSeekStatusChange('video_error')}
        onLoadedMetadata={onLoadedMetadata}
        onSeeked={onSeeked}
        onSeeking={() => {
          if (isFiniteNumber(playback.seekSeconds)) {
            onSeekStatusChange('seeking');
          }
        }}
        preload="metadata"
        src={playback.url}
      />
      {playbackSeekMessage ? (
        <div
          className={playbackStyles.analysisResultPlaybackStatus}
          data-seek-status={playbackSeekStatus}
        >
          <span>{playbackSeekMessage}</span>
          {playbackSeekStatus === 'seek_failed' || playbackSeekStatus === 'video_error' ? (
            <Button
              disabled={playbackSeekStatus !== 'video_error' && !isFiniteNumber(playback.seekSeconds)}
              onClick={onRetrySeek}
              size="small"
            >
              {playbackSeekStatus === 'video_error' ? '刷新播放地址' : '重新定位'}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={playbackStyles.analysisResultPlaybackMeta}>
        <span>{playback.segmentLabel}</span>
        {playback.anchorLabel ? <span>{playback.anchorLabel}</span> : null}
        {typeof playback.seekSeconds === 'number' ? (
          <span>定位 {formatDurationSeconds(playback.seekSeconds)}</span>
        ) : (
          <span>从分段开头播放</span>
        )}
        <span>{playback.fileName}</span>
        <span>{formatFileSize(playback.fileSizeBytes)}</span>
        <span>有效期至 {formatFullDateTime(playback.expiresAt)}</span>
        {playback.contentType ? <span>{playback.contentType}</span> : null}
      </div>
    </section>
  );
}
