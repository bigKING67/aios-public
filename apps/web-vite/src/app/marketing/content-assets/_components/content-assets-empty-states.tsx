import { Button, Empty } from 'antd';
import { resolveContentAssetRequestError } from '../_lib/content-assets-ui-helpers';
import styles from '../content-assets.module.css';

export function ContentAssetsListUnavailable({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className={styles.emptySurface}>
      <Empty description={null} />
      <strong>素材库暂时无法加载</strong>
      <p className={styles.detailNote}>{resolveContentAssetRequestError(error)}</p>
      <Button type="primary" onClick={onRetry}>
        重试加载
      </Button>
    </div>
  );
}

export function ContentAssetsEmptyResult({
  canWrite,
  onUploadOpen,
}: {
  canWrite: boolean;
  onUploadOpen: () => void;
}) {
  return (
    <div className={styles.emptySurface}>
      <Empty description={null} />
      <strong>尚未上传素材</strong>
      <p className={styles.detailNote}>
        先直接上传视频源文件到 TOS，再维护平台视频 ID、广告素材 ID、投放表现与 AI 分析。
      </p>
      {canWrite ? (
        <Button type="primary" onClick={onUploadOpen}>
          上传素材
        </Button>
      ) : null}
    </div>
  );
}
