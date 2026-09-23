'use client';

import { type MouseEvent, type SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { CaretRightFilled, LoadingOutlined } from '@ant-design/icons';
import { createContentAssetPlaybackUrl } from '../_lib/content-assets-api';
import { resolveContentAssetProductText } from '../_lib/content-assets-display';
import type { ContentAssetItem, PlaybackUrlResponse } from '../_lib/content-assets-types';
import { formatBytes, formatDuration } from '../_lib/content-assets-formatters';
import { contentAssetPlatformNamesLabel } from '../_lib/content-assets-platforms';
import { resolveContentAssetRequestError } from '../_lib/content-assets-ui-helpers';
import styles from './content-assets-preview-media.module.css';

function canPreviewContentAsset(asset: ContentAssetItem): boolean {
  return !asset.externalOnly && Boolean(asset.previewObjectKey || asset.rawObjectKey);
}

interface ContentAssetPreviewMediaProps {
  asset: ContentAssetItem;
  displayTitle?: string;
  isActive: boolean;
  onActivate: (assetId: string) => void;
  onDeactivate: (assetId: string) => void;
}

interface PropagationBoundaryEvent {
  stopPropagation?: () => void;
}

const PLAYBACK_URL_REFRESH_MARGIN_MS = 30_000;

function requestVideoPlayback(video: HTMLVideoElement) {
  if (!video.paused) return;
  void video.play().catch(() => {
    // 原生 controls 已展示；若浏览器拦截自动播放，用户仍可在大窗播放器内手动播放。
  });
}

function isPlaybackUrlFresh(playback: PlaybackUrlResponse) {
  const expiresAtMs = Date.parse(playback.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return expiresAtMs - Date.now() > PLAYBACK_URL_REFRESH_MARGIN_MS;
}

export function ContentAssetPreviewMedia({
  asset,
  displayTitle = asset.title,
  isActive,
  onActivate,
  onDeactivate,
}: ContentAssetPreviewMediaProps) {
  const requestTokenRef = useRef(0);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackUrlResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const canPreview = canPreviewContentAsset(asset);
  const playbackVariant = playback?.variant ?? (asset.previewObjectKey ? 'preview' : 'raw');
  const playbackVariantLabel = playbackVariant === 'raw' ? '原片播放' : '预览播放';

  useEffect(() => {
    setPlayback(null);
    setIsLoading(false);
    setIsMuted(true);
    setError('');
    setIsModalOpen(false);
    requestTokenRef.current += 1;
  }, [asset.assetId, asset.previewObjectKey, asset.rawObjectKey]);

  useEffect(() => {
    if (!isActive && isModalOpen) {
      setIsModalOpen(false);
    }
  }, [isActive, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || !playback) return undefined;

    const animationFrame = window.requestAnimationFrame(() => {
      if (modalVideoRef.current) {
        requestVideoPlayback(modalVideoRef.current);
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isModalOpen, playback]);

  const ensurePlaybackUrl = useCallback(async () => {
    if (playback) {
      if (isPlaybackUrlFresh(playback)) return playback.url;
      setPlayback(null);
    }
    if (!canPreview) {
      setError('缺少可播放对象');
      return null;
    }

    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;
    setIsLoading(true);
    setError('');

    try {
      const response = await createContentAssetPlaybackUrl(
        asset.assetId,
        asset.previewObjectKey ? 'preview' : 'raw',
      );
      if (requestTokenRef.current !== requestToken) return null;
      setPlayback(response);
      return response.url;
    } catch (requestError) {
      if (requestTokenRef.current === requestToken) {
        setError(resolveContentAssetRequestError(requestError));
      }
      return null;
    } finally {
      if (requestTokenRef.current === requestToken) {
        setIsLoading(false);
      }
    }
  }, [asset.assetId, asset.previewObjectKey, canPreview, playback]);

  const openFullPreview = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canPreview) {
      setError('缺少可播放对象');
      return;
    }

    onActivate(asset.assetId);
    setIsMuted(true);
    setIsModalOpen(true);
    void ensurePlaybackUrl();
  };

  const closeFullPreview = (event?: PropagationBoundaryEvent) => {
    event?.stopPropagation?.();
    setIsModalOpen(false);
    setIsMuted(true);
    onDeactivate(asset.assetId);
  };

  const retryPlayback = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void ensurePlaybackUrl();
  };

  const handleMediaError = () => {
    setPlayback(null);
    setIsLoading(false);
    setError('播放加载失败，请重新加载播放地址');
  };

  const handleModalCanPlay = (event: SyntheticEvent<HTMLVideoElement>) => {
    requestVideoPlayback(event.currentTarget);
  };

  return (
    <>
      {asset.coverUrl ? <img className={styles.coverImage} src={asset.coverUrl} alt="" loading="lazy" /> : null}

      {canPreview ? (
        <button
          className={styles.primaryControl}
          type="button"
          aria-haspopup="dialog"
          aria-label={`大窗播放：${displayTitle}`}
          aria-pressed={isModalOpen}
          disabled={isLoading}
          onClick={openFullPreview}
        >
          {isLoading ? <LoadingOutlined /> : <CaretRightFilled />}
        </button>
      ) : null}

      {error && !isModalOpen ? <span className={styles.previewError}>{error}</span> : null}

      {isModalOpen ? (
        <Modal
          open={isModalOpen}
          title={(
            <div className={styles.modalTitle}>
              <span>大窗播放</span>
              <strong>{displayTitle}</strong>
            </div>
          )}
          footer={null}
          centered
          width="min(1180px, calc(100vw - 40px))"
          destroyOnHidden
          className={styles.previewModal}
          transitionName=""
          maskTransitionName=""
          onCancel={closeFullPreview}
          modalRender={(node) => (
            <div
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {node}
            </div>
          )}
        >
          <div className={styles.modalLayout}>
            <div className={styles.modalVideoShell}>
              {playback ? (
                <video
                  ref={modalVideoRef}
                  className={styles.modalVideo}
                  src={playback.url}
                  poster={asset.coverUrl ?? undefined}
                  controls
                  autoPlay
                  muted={isMuted}
                  playsInline
                  preload="metadata"
                  onCanPlay={handleModalCanPlay}
                  onError={handleMediaError}
                  onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
                />
              ) : (
                <div className={`${styles.modalVideoState} ${error ? styles.modalVideoStateError : ''}`}>
                  {isLoading ? <LoadingOutlined /> : <CaretRightFilled />}
                  <strong>{isLoading ? '正在打开播放器' : '播放地址生成失败'}</strong>
                  <span>{isLoading ? '正在生成短时播放地址，稍后会自动播放。' : error || '请重新加载播放地址。'}</span>
                  {!isLoading ? (
                    <button type="button" onClick={retryPlayback}>
                      重新加载
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <aside className={styles.modalMeta}>
              <div className={styles.modalMetaHeader}>
                <span>{playbackVariantLabel}</span>
                <strong>{isMuted ? '默认静音' : '已开声音'}</strong>
              </div>
              <dl>
                <div>
                  <dt>平台</dt>
                  <dd>{contentAssetPlatformNamesLabel(asset.platformNames, asset.platform)}</dd>
                </div>
                <div>
                  <dt>时长</dt>
                  <dd>{formatDuration(asset.durationSeconds)}</dd>
                </div>
                <div>
                  <dt>文件</dt>
                  <dd>{formatBytes(playback?.fileSizeBytes ?? asset.fileSizeBytes)}</dd>
                </div>
                <div>
                  <dt>产品</dt>
                  <dd>{resolveContentAssetProductText(asset) || '--'}</dd>
                </div>
                <div>
                  <dt>达人</dt>
                  <dd>{asset.creatorName || '--'}</dd>
                </div>
                <div>
                  <dt>来源</dt>
                  <dd>{asset.sourceSheetName || '--'}</dd>
                </div>
                <div>
                  <dt>AI</dt>
                  <dd>{asset.aiScore == null ? '待分析' : asset.aiScore}</dd>
                </div>
              </dl>
              {asset.tags.length > 0 || asset.aiSuggestedTags.length > 0 ? (
                <div className={styles.modalTagList}>
                  {(asset.tags.length > 0 ? asset.tags : asset.aiSuggestedTags).slice(0, 4).map((tag) => (
                    <span className={asset.tags.length === 0 ? styles.aiTag : ''} key={tag}>
                      {asset.tags.length === 0 ? 'AI ' : ''}{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </aside>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
