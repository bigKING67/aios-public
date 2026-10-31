import { Alert, Button } from '@lobehub/ui';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { formatShortTimestamp } from '../_lib/studio-time';
import styles from './remix-delivery.module.css';

type RemixDelivery = NonNullable<StudioRemixBatchItem['delivery']>;

type DeliveryView = { label: string; className: string; explanation?: string };

const DELIVERY_ERROR_LABELS: Record<string, string> = {
  source_category_missing: '产品未配置云管家来源分类。',
  source_category_ambiguous: '云管家来源分类配置不唯一，请先确认。',
  label_missing: '产品未配置云管家标签。',
  label_ambiguous: '云管家标签匹配不唯一，请先确认。',
  category_unavailable: '云管家分类当前不可用。',
  approval_changed: '人工审核状态已变化，请刷新后确认。',
  output_unavailable: '成片文件当前不可用。',
  qc_required: '自动质检尚未通过。',
  storage_mismatch: '成片存储校验不一致。',
  vendor_rejected: '云管家拒绝了本次导入。',
  import_failed: '云管家导入失败。',
  submission_unknown: '提交结果待核实，请先在云管家确认。',
  query_failed: '暂时无法查询云管家导入结果。',
  invalid_response: '云管家返回结果无法确认。',
};

function deliveryView(delivery: RemixDelivery): DeliveryView {
  if (!delivery.enabled && delivery.status !== 'succeeded') {
    return { label: '推送未启用', className: styles.neutral, explanation: '当前环境没有启用云管家推送。' };
  }
  if (delivery.status === 'pending') return { label: '待推送', className: styles.neutral };
  if (delivery.status === 'submitting' || delivery.status === 'importing') return { label: '推送中', className: styles.info };
  if (delivery.status === 'succeeded') return { label: '已推送', className: styles.success };
  if (delivery.status === 'failed') return { label: '推送失败', className: styles.danger };
  return {
    label: '结果待核实',
    className: styles.warning,
    explanation: '请先在云管家核实导入结果；结果不明确时禁止重复推送。',
  };
}

function deliveryErrorText(errorCode: string | null): string | null {
  if (!errorCode) return null;
  return DELIVERY_ERROR_LABELS[errorCode] ?? '推送未完成，请核实配置与云管家状态。';
}

/** Cloud-video delivery state. Retry only queues the failed delivery; it never writes the vendor directly. */
export function RemixDeliveryStatus({
  delivery,
  compact = false,
  onRetry,
  retrying = false,
  retryError,
}: {
  delivery?: RemixDelivery | null;
  compact?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  retryError?: string | null;
}) {
  if (!delivery) return null;
  const view = deliveryView(delivery);
  const error = deliveryErrorText(delivery.errorCode);
  const canRetry = delivery.status === 'failed' && delivery.enabled && delivery.canRetry;
  const meta = [
    delivery.attempts > 0 ? `已尝试 ${delivery.attempts} 次` : null,
    delivery.updatedAt ? formatShortTimestamp(delivery.updatedAt) : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className={`${styles.delivery} ${compact ? styles.compact : ''}`} aria-label={`云管家推送：${view.label}`}>
      {!compact ? <h3>云管家推送</h3> : null}
      <div className={styles.head}>
        <span className={`${styles.status} ${view.className}`}>
          <span className={styles.dot} aria-hidden="true" />
          {view.label}
        </span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      {!compact && delivery.status === 'succeeded' ? (
        <dl className={styles.receipt}>
          {delivery.videoName ? <div><dt>视频名称</dt><dd>{delivery.videoName}</dd></div> : null}
          {delivery.cloudVideoId ? <div><dt>云管家 ID</dt><dd>{delivery.cloudVideoId}</dd></div> : null}
        </dl>
      ) : null}
      {!compact && view.explanation ? <p className={styles.explanation}>{view.explanation}</p> : null}
      {!compact && error ? <p className={styles.errorReason}>{error}</p> : null}
      {!compact && canRetry && onRetry ? (
        <div className={styles.retry}>
          <Button loading={retrying} disabled={retrying} onClick={onRetry}>重新排队</Button>
          <span>只重新加入推送队列，不会直接写入云管家。</span>
        </div>
      ) : null}
      {!compact && retryError ? <Alert type="error" showIcon title="重新排队失败" description={retryError} /> : null}
    </section>
  );
}
