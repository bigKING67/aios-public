'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { createContentAssetPlaybackUrl } from '../_lib/content-assets-api';
import type { ContentAssetItem, PlaybackUrlResponse } from '../_lib/content-assets-types';
import { formatBytes, formatDuration } from '../_lib/content-assets-formatters';
import styles from '../content-assets.module.css';

interface ContentAssetsVideoPlayerProps {
  asset: ContentAssetItem;
  variant?: 'default' | 'rail' | 'hero';
}

export function ContentAssetsVideoPlayer({ asset, variant = 'default' }: ContentAssetsVideoPlayerProps) {
  const [playback, setPlayback] = useState<PlaybackUrlResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const isRail = variant === 'rail';
  const isHero = variant === 'hero';
  const shellClassName = [
    styles.playerShell,
    isRail ? styles.playerShellRail : '',
    isHero ? styles.playerShellHero : '',
  ].filter(Boolean).join(' ');
  const skeletonClassName = [
    styles.playerSkeleton,
    isRail ? styles.playerSkeletonRail : '',
    isHero ? styles.playerSkeletonHero : '',
  ].filter(Boolean).join(' ');
  const videoClassName = [
    styles.video,
    isRail ? styles.videoRail : '',
    isHero ? styles.videoHero : '',
  ].filter(Boolean).join(' ');
  const mediaStats = [
    { label: '时长', value: formatDuration(asset.durationSeconds) },
    { label: '尺寸', value: asset.width && asset.height ? `${asset.width} x ${asset.height}` : '--' },
    { label: '原片', value: formatBytes(asset.fileSizeBytes) },
    { label: '预览', value: formatBytes(asset.previewSizeBytes) },
  ];

  useEffect(() => {
    let ignore = false;
    setPlayback(null);
    setError('');
    if (asset.externalOnly || (!asset.previewObjectKey && !asset.rawObjectKey)) {
      return undefined;
    }
    const variant = asset.previewObjectKey ? 'preview' : 'raw';
    setIsLoading(true);
    createContentAssetPlaybackUrl(asset.assetId, variant)
      .then((response) => {
        if (!ignore) setPlayback(response);
      })
      .catch((requestError) => {
        if (!ignore) setError(resolveRequestError(requestError));
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [asset.assetId, asset.externalOnly, asset.previewObjectKey, asset.rawObjectKey]);

  const downloadRaw = async () => {
    setIsDownloading(true);
    try {
      const response = await createContentAssetPlaybackUrl(asset.assetId, 'raw');
      window.open(response.url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(resolveRequestError(requestError));
    } finally {
      setIsDownloading(false);
    }
  };

  if (asset.externalOnly) {
    return (
      <div className={styles.playerEmpty}>
        <PlayCircleOutlined />
        <p>该素材来自外部链接，尚未补传到 TOS，暂不能在中台直接播放。</p>
        {asset.sourceUrl ? (
          <Button href={asset.sourceUrl} target="_blank" rel="noreferrer">
            打开来源
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      {isLoading ? (
        <Skeleton.Node active className={skeletonClassName} />
      ) : null}
      {!isLoading && playback ? (
        <video
          className={videoClassName}
          src={playback.url}
          poster={asset.coverUrl || undefined}
          controls
          muted
          playsInline
          preload="metadata"
        />
      ) : null}
      {!isLoading && !playback && !error ? (
        <div className={styles.playerEmpty}>
          <PlayCircleOutlined />
          <p>缺少可播放对象，等待上传或处理队列补齐后即可播放。</p>
        </div>
      ) : null}
      {error ? <Alert type="error" showIcon message="播放地址生成失败" description={error} /> : null}
      <div className={styles.playerMetaRow}>
        {isHero ? (
          <dl className={styles.playerMetaList} aria-label="媒体基础指标">
            {mediaStats.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className={styles.playerMetaText}>
            {asset.previewObjectKey
              ? '默认播放预览版，可按需下载原片。'
              : '当前临时播放原片，预览版生成后将自动优先播放。'}
          </span>
        )}
        <Button
          type={isHero ? 'primary' : 'default'}
          className={styles.playerDownloadButton}
          icon={<DownloadOutlined />}
          loading={isDownloading}
          disabled={!asset.rawObjectKey}
          onClick={downloadRaw}
        >
          下载原片 {formatBytes(asset.fileSizeBytes)}
        </Button>
      </div>
    </div>
  );
}

function resolveRequestError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '请求失败');
  }
  return '请求失败';
}
