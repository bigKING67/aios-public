import { PlayCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Skeleton } from 'antd';
import { type RefObject, useEffect, useState } from 'react';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import type { ContentAssetItem, PlaybackVariant } from '@/app/marketing/content-assets/_lib/content-assets-types';
import { resolveContentAssetRequestError } from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';
import styles from './segment-annotation.module.css';

interface SegmentSourcePlayerProps {
  asset: ContentAssetItem;
  videoRef: RefObject<HTMLVideoElement | null>;
  onTimeUpdate: () => void;
  onSeeking: () => void;
  onDurationChange: (durationMs: number | null) => void;
}

/**
 * Segment times are raw-source milliseconds, so the raw file plays by default.
 * The preview proxy is an explicit fallback with a visible timing caveat.
 */
export function SegmentSourcePlayer({ asset, videoRef, onTimeUpdate, onSeeking, onDurationChange }: SegmentSourcePlayerProps) {
  const [variant, setVariant] = useState<PlaybackVariant>(asset.rawObjectKey ? 'raw' : 'preview');
  const [mediaError, setMediaError] = useState(false);
  const canPlay = !asset.externalOnly && Boolean(variant === 'raw' ? asset.rawObjectKey : asset.previewObjectKey);

  useEffect(() => {
    setVariant(asset.rawObjectKey ? 'raw' : 'preview');
  }, [asset.assetId, asset.rawObjectKey]);
  useEffect(() => setMediaError(false), [variant, asset.assetId]);

  const playback = useQuery({
    queryKey: ['content-ai-studio', 'playback', asset.assetId, variant],
    queryFn: () => createContentAssetPlaybackUrl(asset.assetId, variant),
    enabled: canPlay,
    // A refetch would swap `src` and reset the playhead; refresh only on media error.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const alternative: PlaybackVariant | null = variant === 'raw'
    ? (asset.previewObjectKey ? 'preview' : null)
    : (asset.rawObjectKey ? 'raw' : null);

  if (!canPlay) {
    return (
      <div className={styles.playerEmpty}>
        <PlayCircleOutlined aria-hidden />
        <p>
          {asset.externalOnly
            ? '该原片来自外部链接，尚未补传原片，暂不能在线播放。仍可手动输入入点和出点。'
            : '缺少可播放的原片文件。仍可手动输入入点和出点。'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.player}>
      {playback.isPending ? <Skeleton.Node active className={styles.playerSkeleton} /> : null}
      {playback.isError ? (
        <Alert type="error" showIcon title="播放地址生成失败" description={resolveContentAssetRequestError(playback.error)} />
      ) : null}
      {playback.data ? (
        <video
          ref={videoRef}
          className={styles.video}
          src={playback.data.url}
          poster={asset.coverUrl || undefined}
          controls
          playsInline
          preload="metadata"
          aria-label="原片播放器"
          onTimeUpdate={onTimeUpdate}
          onSeeking={onSeeking}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            onDurationChange(Number.isFinite(seconds) ? Math.round(seconds * 1000) : null);
          }}
          onError={() => setMediaError(true)}
        />
      ) : null}
      {mediaError ? (
        <Alert
          type="warning"
          showIcon
          title="浏览器无法播放该文件"
          description={alternative === 'preview' ? '原片编码可能不受浏览器支持，可改用预览版定位时间；播放地址过期时可重新获取。' : '播放地址可能已过期，可重新获取；仍失败请在素材库中检查文件。'}
          action={<Button onClick={() => { setMediaError(false); void playback.refetch(); }}>重新获取</Button>}
        />
      ) : null}
      <div className={styles.playerMeta}>
        <span>
          {variant === 'raw'
            ? '正在播放原片，时间与片段起止一致。'
            : '正在播放预览版：预览为转码副本，时间可能与原片有细微偏差，保存前请核对。'}
        </span>
        {alternative ? (
          <Button className={styles.touchButton} onClick={() => setVariant(alternative)}>
            {alternative === 'raw' ? '改用原片' : '改用预览版'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
