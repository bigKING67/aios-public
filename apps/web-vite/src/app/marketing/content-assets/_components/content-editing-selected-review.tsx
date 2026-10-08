import { Alert } from 'antd';
import type { EditingRun } from '../_lib/content-editing-api';
import styles from './content-editing.module.css';

const pendingLabels: Record<string, string> = {
  full_video_quality: '整片画面与内容质量',
  audio_visual_sync: '声画同步',
  listening: '声音听检',
  product_identity: '商品身份核对',
  publication_authorization: '发布授权',
};
const titles: Record<string, string> = {
  sampled_checks_passed: '片段采样检查通过',
  needs_revision: '片段检查发现待修订项',
  evidence_required: '片段检查需要补充证据',
};

export function ContentEditingSelectedReview({ summary, run }: { summary: unknown; run: EditingRun }) {
  const value = summary && typeof summary === 'object' ? summary as Record<string, unknown> : null;
  const binding = value?.binding as Record<string, unknown> | undefined;
  const status = typeof value?.status === 'string' ? value.status : '';
  const count = value?.windowCount;
  const passed = value?.passedWindowCount;
  const pending = value?.unverified;
  // This optional receipt is a versioned API boundary. Unknown/inconsistent receipts
  // must not inherit a positive label from an otherwise successful render.
  const valid = value?.schema === 'aios.selected-review-summary.v1'
    && value.scope === 'selected_output_windows_sampled' && value.deliveryApproved === false
    && binding?.runId === run.runId && binding?.jobId === run.renderJobId
    && Object.prototype.hasOwnProperty.call(titles, status)
    && typeof count === 'number' && Number.isSafeInteger(count) && count > 0
    && typeof passed === 'number' && Number.isSafeInteger(passed) && passed >= 0 && passed <= count
    && (status !== 'sampled_checks_passed' || passed === count)
    && Array.isArray(pending) && pending.every((item) => typeof item === 'string');
  if (!valid) return <Alert type="warning" title="片段检查摘要暂不可用" description="请刷新结果重新读取；当前摘要不能作为检查通过的依据。" />;
  return <section className={styles.stack} aria-label="片段检查">
    <Alert type={status === 'sampled_checks_passed' ? 'info' : 'warning'} title={titles[status]}
      description={`已检查 ${count} 个片段，通过 ${passed} 个。仅覆盖选中片段的采样检查，不代表整片可交付。`} />
    <p className={styles.helper}>尚未验证：{pending.length ? pending.map((item: string) => pendingLabels[item] ?? '其他检查项').join('、') : '整片交付资格'}。原片字幕样式与声音是否保留，仍以工程和实际成片检查为准。</p>
  </section>;
}
