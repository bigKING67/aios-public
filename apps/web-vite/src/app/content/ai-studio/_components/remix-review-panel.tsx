import { Alert, Button, TextArea } from '@lobehub/ui';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  REMIX_REVIEW_REASONS,
  isRemixItemReviewable,
  remixItemReviewState,
  remixReviewReasonLabel,
  type StudioRemixBatchItem,
  type StudioRemixOutputReviewRequest,
} from '../_lib/remix-api';
import { isRejectedRemixItem, remixRetentionText } from '../_lib/remix-review';
import { formatShortTimestamp } from '../_lib/studio-time';
import { ReviewStatus } from './remix-status';
import annotationStyles from './segment-annotation.module.css';
import libraryStyles from './segment-library.module.css';
import outputStyles from './remix-outputs.module.css';
import remixStyles from './remix.module.css';

/**
 * 通过 is the screen's one primary action; 驳回 opens its reasons (at least one) and a note.
 * A reviewed output shows the call, who made it and when, and can be changed or cleared.
 */
export function ReviewPanel({
  item,
  onReview,
  reviewing,
  reviewError,
  onNext,
}: {
  item: StudioRemixBatchItem;
  /** A request approves or rejects; null clears the review. */
  onReview: (request: StudioRemixOutputReviewRequest | null) => void;
  reviewing: boolean;
  reviewError: string | null;
  /** Move to the next output in this batch; omitted on the last output. */
  onNext?: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const state = remixItemReviewState(item);
  const review = item.review;
  const rejected = isRejectedRemixItem(item);
  const canReview = isRemixItemReviewable(item);
  const canRestore = rejected && item.retention?.reason === 'rejected' && item.retention.canRestore;
  const retentionText = remixRetentionText(item);
  const toggle = (key: string) =>
    setReasons((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]));
  const startRejecting = useCallback(() => {
    setReasons(review?.decision === 'rejected' ? review.reasons : []);
    setNote(review?.note ?? '');
    setRejecting(true);
  }, [review]);
  const submit = useCallback((request: StudioRemixOutputReviewRequest | null) => {
    setRejecting(false);
    onReview(request);
  }, [onReview]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))
      ) return;
      // No review shortcuts while a save is in flight. Rejected records allow navigation only;
      // restoration is always the explicit button so A can never turn a rejection into approval.
      if (!state || reviewing) return;
      const key = event.key.toLowerCase();
      if (key === 'n' && onNext) {
        event.preventDefault();
        onNext();
      } else if (rejected || !canReview) {
        return;
      } else if (key === 'a' && state !== 'approved') {
        event.preventDefault();
        submit({ decision: 'approved', reasons: [], note: null });
      } else if (key === 'r') {
        event.preventDefault();
        if (!rejecting) startRejecting();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canReview, onNext, rejected, rejecting, reviewing, startRejecting, state, submit]);
  if (!state) {
    return (
      <p className={annotationStyles.fieldHelp}>
        {item.qc?.status === 'failed' || item.qc?.status === 'incomplete'
          ? '自动质检未通过或未完成，不能人工审核。'
          : '成片生成完成且未删除时才能审核。'}
      </p>
    );
  }
  return (
    <div className={remixStyles.stack}>
      {review ? (
        <div className={outputStyles.reviewResult}>
          <ReviewStatus state={state} />
          <span className={outputStyles.reviewMeta}>
            {review.reviewerName || `用户 ${review.reviewerUserId}`} · {formatShortTimestamp(review.reviewedAt)}
          </span>
          {review.reasons.length > 0 ? (
            <span className={outputStyles.reviewReasons}>{review.reasons.map(remixReviewReasonLabel).join('、')}</span>
          ) : null}
          {review.note ? <p className={outputStyles.reviewNote}>{review.note}</p> : null}
        </div>
      ) : (
        <p className={annotationStyles.fieldHelp}>AI 已合成完，请看完成片后确认是否可用。</p>
      )}
      {retentionText ? <p className={annotationStyles.fieldHelp}>{retentionText}</p> : null}
      {rejected ? (
        canRestore ? (
          <Button loading={reviewing} disabled={reviewing} onClick={() => submit(null)}>
            撤回驳回
          </Button>
        ) : null
      ) : rejecting ? (
        <div className={outputStyles.rejectForm}>
          <div className={libraryStyles.chips} role="group" aria-label="驳回原因">
            {REMIX_REVIEW_REASONS.map((reason) => {
              const checked = reasons.includes(reason.key);
              return (
                <button
                  key={reason.key}
                  type="button"
                  className={`${libraryStyles.chip} ${checked ? libraryStyles.chipActive : ''}`}
                  aria-pressed={checked}
                  onClick={() => toggle(reason.key)}
                >
                  {checked ? <Check size={14} strokeWidth={2} aria-hidden /> : null}
                  <span className={libraryStyles.chipName}>{reason.label}</span>
                </button>
              );
            })}
          </div>
          <TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="备注（选填）：哪一段、什么问题"
            aria-label="驳回备注"
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
          <span className={annotationStyles.rowActions}>
            <Button
              danger
              loading={reviewing}
              disabled={reasons.length === 0}
              onClick={() => submit({ decision: 'rejected', reasons, note: note.trim() || null })}
            >
              确认驳回
            </Button>
            <Button type="text" onClick={() => setRejecting(false)}>
              取消
            </Button>
          </span>
        </div>
      ) : canReview ? (
        <span className={annotationStyles.rowActions}>
          {state !== 'approved' ? (
            <Button type="primary" loading={reviewing} aria-keyshortcuts="A" onClick={() => submit({ decision: 'approved', reasons: [], note: null })}>
              {state === 'rejected' ? '改为通过' : '通过'}
            </Button>
          ) : null}
          <Button disabled={reviewing} aria-keyshortcuts="R" onClick={startRejecting}>
            {state === 'rejected' ? '修改驳回原因' : state === 'approved' ? '改为驳回' : '驳回'}
          </Button>
          {review ? (
            <Button type="text" loading={reviewing} disabled={reviewing} onClick={() => submit(null)}>
              撤销审核
            </Button>
          ) : null}
        </span>
      ) : null}
      <p className={outputStyles.shortcutHelp}>
        {rejected || !canReview ? '快捷键：N 下一条' : '快捷键：A 通过 · R 打开驳回原因 · N 下一条'}
      </p>
      {reviewError ? <Alert type="error" showIcon title="审核没有保存" description={reviewError} /> : null}
    </div>
  );
}
