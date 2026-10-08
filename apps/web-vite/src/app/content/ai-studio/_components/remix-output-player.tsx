import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, Skeleton } from 'antd';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { resolveContentAssetRequestError } from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';

interface RemixOutputPlayerProps {
  /** Output library asset; null closes the dialog. */
  assetId: string | null;
  title: string;
  onClose: () => void;
}

/** Plays a registered remix output through the library's signed playback URL. */
export function RemixOutputPlayer({ assetId, title, onClose }: RemixOutputPlayerProps) {
  const playback = useQuery({
    queryKey: ['content-ai-studio', 'remix-output-playback', assetId],
    queryFn: () => createContentAssetPlaybackUrl(assetId!, 'raw'),
    enabled: assetId !== null,
    // A refetch would swap `src` and reset playback; the dialog refetches on reopen.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return (
    <Modal open={assetId !== null} title={title} onCancel={onClose} footer={null} destroyOnHidden width={520}>
      {playback.isPending ? <Skeleton.Node active className={styles.playerSkeleton} /> : null}
      {playback.isError ? (
        <Alert type="error" showIcon title="播放地址获取失败" description={resolveContentAssetRequestError(playback.error)} />
      ) : null}
      {playback.data ? (
        <div className={remixStyles.stack}>
          <video className={remixStyles.outputVideo} src={playback.data.url} controls preload="metadata">
            <track kind="captions" />
          </video>
          <a className={styles.tableLink} href={playback.data.url} target="_blank" rel="noreferrer" download>
            下载成片（链接有效期至 {new Date(playback.data.expiresAt).toLocaleTimeString('zh-CN')}）
          </a>
        </div>
      ) : null}
    </Modal>
  );
}
