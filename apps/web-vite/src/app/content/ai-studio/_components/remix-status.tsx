import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import {
  REMIX_REVIEW_LABELS,
  remixBatchReviewState,
  remixBatchView,
  remixItemReviewState,
  remixItemStatusView,
  type RemixReviewState,
  type StudioRemixBatch,
  type StudioRemixBatchItem,
} from '../_lib/remix-api';
import styles from './remix-outputs.module.css';

const REVIEW_CLASSES: Record<RemixReviewState, string | undefined> = {
  pending: styles.reviewPending,
  approved: styles.reviewApproved,
  rejected: styles.reviewRejected,
};

/**
 * A person's call on AI output, in the compact status shape (dot then word): 待审核 amber,
 * 已通过 green, 已驳回 red. Green is kept for 已通过, so AI finishing alone never reads as done.
 */
export function ReviewStatus({ state }: { state: RemixReviewState }) {
  return (
    <span className={`${styles.review} ${REVIEW_CLASSES[state] ?? ''}`} data-review-state={state}>
      <span className={styles.reviewDot} aria-hidden="true" />
      {REMIX_REVIEW_LABELS[state]}
    </span>
  );
}

/** A batch: by review once it settled with reviewable outputs, otherwise its AI task status. */
export function RemixBatchStatus({ batch }: { batch: StudioRemixBatch }) {
  const review = remixBatchReviewState(batch);
  if (review) return <ReviewStatus state={review} />;
  const view = remixBatchView(batch);
  return <AiTaskStatus compact state={view.state} stateLabel={view.label} />;
}

/** One output: by review when it can be reviewed, otherwise its render status. */
export function RemixItemStatus({ item }: { item: StudioRemixBatchItem }) {
  const review = remixItemReviewState(item);
  if (review) return <ReviewStatus state={review} />;
  const view = remixItemStatusView(item);
  return <AiTaskStatus compact state={view.state} stateLabel={view.label} />;
}
