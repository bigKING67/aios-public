import { Button } from '@lobehub/ui';
import type { ReactNode } from 'react';
import styles from './ai-grammar.module.css';

export type AiTaskState = 'queued' | 'thinking' | 'generating' | 'done' | 'failed' | 'cancelled';

/** A backend status read as a task state plus the word shown for it. */
export interface AiTaskView {
  state: AiTaskState;
  label: string;
}

const STATE_LABELS: Record<AiTaskState, string> = {
  queued: '排队中',
  thinking: '思考中',
  generating: '生成中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export interface AiTaskStatusProps {
  state: AiTaskState;
  /** Replaces the state word but keeps its color and motion, e.g. 部分完成 or 渲染中. */
  stateLabel?: string;
  /** The task, e.g. 「框架混剪 · 第 3 版」; while thinking, what AI is doing right now. */
  label?: ReactNode;
  /** Trailing detail: queue position, finish time, or the failure reason. */
  detail?: ReactNode;
  /** 0–100, shown while generating. */
  progress?: number;
  /** Offered on failure. */
  onRetry?: () => void;
  /** Replaces the plain retry, e.g. a billable 重新分析 that keeps the AI action grammar. */
  action?: ReactNode;
  retryLabel?: string;
  /** Dot and words only, for table cells, side lists and card heads. */
  compact?: boolean;
  /** Full size without the box, for a status line that already sits under its own heading. */
  framed?: boolean;
}

/**
 * One AI task in the state grammar (DESIGN.md Visual Language v2 › AI Grammar). The sweep
 * and pulse run only while AI works; the state always reads from text.
 */
export function AiTaskStatus({
  state,
  stateLabel,
  label,
  detail,
  progress,
  onRetry,
  retryLabel = '重试',
  action,
  compact = false,
  framed = true,
}: AiTaskStatusProps) {
  const percent = progress === undefined ? undefined : Math.round(Math.min(100, Math.max(0, progress)));
  const showProgress = state === 'generating' && percent !== undefined;
  return (
    <div
      className={[compact ? styles.taskCompact : styles.task, !compact && !framed ? styles.taskBare : null, styles[state]]
        .filter(Boolean)
        .join(' ')}
      data-ai-task-state={state}
    >
      <span className={styles.state}>
        <span className={styles.dot} aria-hidden="true" />
        {stateLabel ?? STATE_LABELS[state]}
      </span>
      {label ? <span className={`${styles.label} ${state === 'thinking' ? styles.shimmer : ''}`}>{label}</span> : null}
      {showProgress && compact ? <span className={styles.percent}>{percent}%</span> : null}
      {showProgress && !compact ? (
        <span className={styles.progress}>
          <span
            className={styles.track}
            role="progressbar"
            aria-label="生成进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className={styles.fill} style={{ width: `${percent}%` }} />
          </span>
          <span className={styles.percent}>{percent}%</span>
        </span>
      ) : null}
      {detail ? <span className={styles.detail}>{detail}</span> : null}
      {action ??
        (state === 'failed' && onRetry ? (
          <Button size="small" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null)}
    </div>
  );
}
