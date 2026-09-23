import { Badge, type BadgeStatus } from '@/components/atoms/badge';
import {
  formatFileSize,
  formatInteger,
} from '../_lib/live-center-formatters';
import type {
  LiveCenterUploadProgress,
  LiveCenterUploadQueueItemProgress,
  LiveCenterUploadQueueItemStatus,
} from '../_lib/live-center-upload';
import uploadStyles from './live-center-recording-upload.module.css';

export function RecordingUploadProgressPanel({ progress }: { progress: LiveCenterUploadProgress }) {
  const queue = progress.queue;
  const visibleItems = queue?.items ?? [];

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={
        progress.stage === 'error'
          ? `${uploadStyles.uploadProgress} ${uploadStyles.uploadProgressError}`
          : uploadStyles.uploadProgress
      }
      role="status"
    >
      <div className={uploadStyles.uploadProgressHeader}>
        <strong>{resolveUploadProgressTitle(progress)}</strong>
        <span>{formatUploadProgressMeta(progress)}</span>
      </div>
      <progress
        aria-label="录屏上传队列进度"
        className={uploadStyles.uploadProgressMeter}
        max={100}
        value={progress.percent ?? undefined}
      />
      <span>{progress.message}</span>
      {queue?.currentItemIndex && progress.currentFileName ? (
        <p className={uploadStyles.uploadProgressCurrent} title={progress.currentFileName}>
          当前第 {formatInteger(queue.currentItemIndex)}/{formatInteger(queue.totalItems)} 个文件：
          {progress.currentFileName}
        </p>
      ) : null}
      {visibleItems.length > 0 ? (
        <ol className={uploadStyles.uploadQueueList}>
          {visibleItems.map((item) => {
            const itemDetail = formatUploadQueueItemDetail(item);
            return (
              <li className={uploadStyles.uploadQueueItem} data-status={item.status} key={item.id}>
                <div className={uploadStyles.uploadQueueItemMain}>
                  <strong title={item.fileName}>
                    {item.segmentIndex ? `#${formatInteger(item.segmentIndex)} ` : ''}
                    {item.fileName}
                  </strong>
                  <span title={itemDetail}>{itemDetail}</span>
                </div>
                <Badge status={resolveUploadQueueBadgeStatus(item.status)}>
                  {formatUploadQueueStatusLabel(item.status)}
                </Badge>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function resolveUploadProgressTitle(progress: LiveCenterUploadProgress): string {
  if (progress.stage === 'error') return '录屏队列上传失败';
  if (
    progress.stage === 'done' &&
    (!progress.queue || progress.queue.completedItems >= progress.queue.uploadableItems)
  ) {
    return '录屏队列完成';
  }
  if (progress.stage === 'queued') return '录屏队列已排序';
  return '正在上传录屏队列';
}

function formatUploadProgressMeta(progress: LiveCenterUploadProgress): string {
  const queue = progress.queue;
  const percent = progress.percent == null ? '--' : `${progress.percent}%`;
  if (!queue) return percent;
  if (queue.uploadableItems === 0) {
    return `${percent} · 可上传 0 段 · 跳过 ${formatInteger(queue.skippedItems)}`;
  }
  const uploaded = `${formatInteger(queue.completedItems)}/${formatInteger(queue.uploadableItems)} 段`;
  const skipped = queue.skippedItems > 0 ? ` · 跳过 ${formatInteger(queue.skippedItems)}` : '';
  const failed = queue.failedItems > 0 ? ` · 失败 ${formatInteger(queue.failedItems)}` : '';
  return `${percent} · 已传 ${uploaded}${skipped}${failed}`;
}

function formatUploadQueueItemDetail(item: LiveCenterUploadQueueItemProgress): string {
  const details = [formatFileSize(item.fileSizeBytes)];
  if (typeof item.percent === 'number' && Number.isFinite(item.percent)) {
    details.push(`${formatInteger(item.percent)}%`);
  }
  if (item.message) {
    details.push(item.message);
  }
  return details.join(' · ');
}

function resolveUploadQueueBadgeStatus(status: LiveCenterUploadQueueItemStatus): BadgeStatus {
  switch (status) {
    case 'done':
      return 'success';
    case 'error':
      return 'danger';
    case 'skipped':
      return 'warning';
    case 'uploading':
      return 'info';
    case 'pending':
    default:
      return 'neutral';
  }
}

function formatUploadQueueStatusLabel(status: LiveCenterUploadQueueItemProgress['status']): string {
  const labels: Record<LiveCenterUploadQueueItemStatus, string> = {
    done: '已上传',
    error: '失败',
    pending: '待上传',
    skipped: '已跳过',
    uploading: '上传中',
  };
  return labels[status];
}
