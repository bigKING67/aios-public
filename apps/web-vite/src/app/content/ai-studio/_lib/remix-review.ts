import type { StudioRemixBatchItem } from './remix-api';
import { isRemixItemReviewable } from './remix-api';
import { formatShortTimestamp } from './studio-time';

type ReviewRecord = Pick<StudioRemixBatchItem, 'review'>;
type PlaybackRecord = Pick<
  StudioRemixBatchItem,
  'delivery' | 'outcome' | 'outputAssetId' | 'outputDeleted' | 'qc' | 'retention' | 'review'
>;

export function isRejectedRemixItem(item: ReviewRecord): boolean {
  return item.review?.decision === 'rejected';
}

/** A rejected archive shows only rejected records; ordinary batch grids omit them. */
export function filterRemixItemsByReviewArchive(
  items: readonly StudioRemixBatchItem[],
  rejectedArchive: boolean,
): StudioRemixBatchItem[] {
  return items.filter((item) => isRejectedRemixItem(item) === rejectedArchive);
}

/** Local playback stays off for cleaned rejections; delivered cleanup can read through Cloud Manager. */
export function isRemixItemPlaybackAvailable(item: PlaybackRecord): boolean {
  if (isRemixItemReviewable(item)) return true;
  return Boolean(
    item.outcome === 'succeeded' &&
    item.outputAssetId &&
    item.outputDeleted &&
    item.review?.decision !== 'rejected' &&
    item.retention?.reason === 'delivered' &&
    item.retention.status === 'completed' &&
    item.delivery?.status === 'succeeded',
  );
}

/** Human-readable retention state without exposing scheduler or storage internals. */
export function remixRetentionText(item: Pick<StudioRemixBatchItem, 'retention' | 'review'>): string | null {
  const retention = item.retention;
  if (!retention) {
    return isRejectedRemixItem(item) ? '这条驳回记录没有可撤回期限，审核原因与来源记录仍会保留。' : null;
  }
  if (retention.reason === 'delivered') {
    if (retention.status === 'completed') return '本地文件已清理，播放已改用云管家；审核与来源记录仍会保留。';
    return null;
  }
  if (retention.reason !== 'rejected') return null;
  if (retention.canRestore) {
    const deadline = retention.cleanupAt ? `（${formatShortTimestamp(retention.cleanupAt)} 前）` : '';
    return `可在 7 天撤回期内${deadline}撤回驳回；恢复后回到待审核，不会自动通过。`;
  }
  if (retention.status === 'deleting') return '本地成片正在清理，已不能撤回；审核原因与来源记录仍会保留。';
  if (retention.status === 'completed' || retention.cleanedAt) {
    return '本地成片已清理，不能撤回；审核原因与来源记录仍会保留。';
  }
  if (retention.status === 'failed') {
    return '本地清理未完成，但当前已不能撤回；审核原因与来源记录仍会保留。';
  }
  return '7 天撤回期已结束，当前不能恢复；审核原因与来源记录仍会保留。';
}
