import { InboxOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Modal, Progress, Select, Tag, Upload } from 'antd';
import { useState } from 'react';
import { completeContentAssetUpload, createContentAssetUpload } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { contentAssetsQueryKeys } from '@/app/marketing/content-assets/_lib/content-assets-query-keys';
import { calculateFileSha256, uploadFileToTos } from '@/app/marketing/content-assets/_lib/content-assets-upload';
import { aiStudioQueryKeys } from '../_lib/ai-studio-api';
import { enterpriseLabel } from '../_lib/studio-overview';
import { studioProductOptions } from '../_lib/studio-products';
import styles from './studio-upload-modal.module.css';

const MAX_FILES = 10;

interface PendingFile {
  uid: string;
  file: File;
  title: string;
  /** null = waiting; 0–100 while uploading; 'done' or an error message when finished. */
  state: null | number | 'done' | { error: string };
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim().slice(0, 160) || '未命名原片';
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '上传失败，请重试';
}

interface StudioUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** `企业:<name>`: every upload carries it so the original lands in this studio. */
  enterpriseTag: string | null;
  products: readonly string[];
}

/**
 * Uploads originals into the asset library from the studio: the enterprise
 * tag is fixed and a product is required, so uploads are usable for AI 切段
 * and remix without a trip through the library. One file at a time, through
 * the library's own upload contract (sha256, signed PUT, complete).
 */
export function StudioUploadModal({ open, onClose, enterpriseTag, products }: StudioUploadModalProps) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [product, setProduct] = useState<string | undefined>(products.length === 1 ? products[0] : undefined);
  const [running, setRunning] = useState(false);
  const productOptions = studioProductOptions(products);
  const isFailed = (item: PendingFile) => Boolean(item.state && typeof item.state === 'object');
  const failed = files.filter(isFailed).length;
  const allDone = files.length > 0 && files.every((item) => item.state === 'done');
  /** Every file has an outcome (uploaded or failed) and nothing is running. */
  const settled = !running && files.length > 0 && files.every((item) => item.state === 'done' || isFailed(item));

  const patch = (uid: string, change: Partial<PendingFile>) =>
    setFiles((current) => current.map((item) => (item.uid === uid ? { ...item, ...change } : item)));

  const reset = () => {
    setFiles([]);
    setRunning(false);
  };

  const close = () => {
    if (running) return;
    reset();
    onClose();
  };

  const start = async () => {
    if (!product) return;
    setRunning(true);
    for (const item of files) {
      if (item.state === 'done') continue;
      patch(item.uid, { state: 0 });
      try {
        const rawSha256 = await calculateFileSha256(item.file);
        const upload = await createContentAssetUpload({
          fileName: item.file.name,
          contentType: item.file.type || undefined,
          fileSizeBytes: item.file.size,
          rawSha256,
          title: item.title.trim() || titleFromFileName(item.file.name),
          productName: product,
          productNames: [product],
          tags: enterpriseTag ? [enterpriseTag] : [],
        });
        await uploadFileToTos(upload, item.file, (progress) => {
          if (progress.percent !== null) patch(item.uid, { state: progress.percent });
        });
        await completeContentAssetUpload(upload.assetId, { fileSizeBytes: item.file.size, rawSha256 });
        patch(item.uid, { state: 'done' });
      } catch (error) {
        patch(item.uid, { state: { error: errorText(error) } });
      }
    }
    setRunning(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: aiStudioQueryKeys.overview() }),
    ]);
  };

  const canStart = !running && files.some((item) => item.state !== 'done') && Boolean(product);

  return (
    <Modal
      open={open}
      title="上传原片"
      onCancel={close}
      maskClosable={!running}
      closable={!running}
      width={640}
      footer={
        allDone ? (
          <Button type="primary" onClick={close}>完成</Button>
        ) : (
          <>
            <Button onClick={close} disabled={running}>取消</Button>
            <Button type="primary" disabled={!canStart} loading={running} onClick={() => void start()}>
              {failed > 0 ? '重试失败的文件' : `上传${files.length > 0 ? ` ${files.length} 个文件` : ''}`}
            </Button>
          </>
        )
      }
    >
      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.label}>归属企业</span>
          {enterpriseTag ? <Tag className={styles.fixedTag}>{enterpriseLabel(enterpriseTag)}</Tag> : <span className={styles.help}>未配置企业，上传后在全库可见</span>}
        </div>
        <label className={styles.field}>
          <span className={styles.label}>产品（必填）</span>
          <Select
            aria-label="产品"
            showSearch
            placeholder="选择这批原片的产品"
            value={product}
            options={productOptions}
            onChange={(value: string) => setProduct(value)}
            disabled={running || files.some((item) => item.state !== null)}
          />
        </label>
        {!running && files.every((item) => item.state === null) ? (
          <Upload.Dragger
            multiple
            accept="video/*"
            showUploadList={false}
            disabled={running}
            beforeUpload={(file, list) => {
              // Collect only; uploading starts from the button so a product is chosen first.
              if (file === list[0]) {
                setFiles((current) =>
                  [...current, ...list.map((item) => ({ uid: item.uid, file: item, title: titleFromFileName(item.name), state: null }))].slice(0, MAX_FILES),
                );
              }
              return Upload.LIST_IGNORE;
            }}
          >
            <p className={styles.dropIcon}><InboxOutlined /></p>
            <p>点击或拖入视频文件，每次最多 {MAX_FILES} 个</p>
            <p className={styles.help}>上传后自动生成封面和预览，完成后即可在 AI 分析里开始分析</p>
          </Upload.Dragger>
        ) : null}
        {files.length > 0 ? (
          <ul className={styles.fileList} aria-label="待上传文件">
            {files.map((item) => (
              <li key={item.uid}>
                <Input
                  aria-label={`标题：${item.file.name}`}
                  value={item.title}
                  maxLength={160}
                  disabled={running || item.state === 'done'}
                  onChange={(event) => patch(item.uid, { title: event.target.value })}
                />
                <span className={styles.fileMeta}>{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                {typeof item.state === 'number' ? <Progress percent={item.state} size="small" className={styles.progress} /> : null}
                {item.state === 'done' ? <span className={styles.done}>已上传</span> : null}
                {item.state && typeof item.state === 'object' ? <span className={styles.error} title={item.state.error}>{item.state.error}</span> : null}
                {item.state === null && !running ? (
                  <Button type="text" size="small" onClick={() => setFiles((current) => current.filter((other) => other.uid !== item.uid))}>
                    移除
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {settled ? (
          <Alert
            type={failed > 0 ? 'warning' : 'success'}
            showIcon
            title={failed > 0 ? `${files.length - failed} 个已上传，${failed} 个失败` : `${files.length} 个原片已上传`}
            description="封面和预览生成需要几分钟，生成后即可在 AI 分析里开始分析。"
          />
        ) : null}
      </div>
    </Modal>
  );
}
