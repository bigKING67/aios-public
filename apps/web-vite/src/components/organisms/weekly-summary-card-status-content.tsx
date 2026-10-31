import { Alert, Button } from '@lobehub/ui';
import { Bot } from 'lucide-react';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import type { SummaryData } from '@/hooks/use-weekly-summary';
import styles from './weekly-summary-card-modern.module.css';

export interface WeeklySummaryErrorContentProps {
  errorMessage: string;
  onRefetch: () => void;
}

export interface WeeklySummaryFailedContentProps {
  data: SummaryData | undefined;
  canGenerateSummary: boolean;
  isBusy: boolean;
  onGenerateSummary: (forceRegenerate: boolean) => void;
}

export interface WeeklySummaryEmptyContentProps {
  summaryLabel: string;
  canGenerateSummary: boolean;
}

export function WeeklySummaryLoadingContent() {
  return (
    <div className={styles.loadingShell} aria-label="加载中">
      <div className={styles.loadingSection}>
        <div className={styles.loadingBadge} />
        <div className={styles.loadingTitle} />
        <div className={styles.loadingLineLong} />
        <div className={styles.loadingLineMedium} />
      </div>
      <div className={styles.loadingSection}>
        <div className={styles.loadingBadge} />
        <div className={styles.loadingTitle} />
        <div className={styles.loadingLineLong} />
        <div className={styles.loadingLineShort} />
      </div>
    </div>
  );
}

export function WeeklySummaryErrorContent({
  errorMessage,
  onRefetch,
}: WeeklySummaryErrorContentProps) {
  return (
    <Alert
      title="获取总结数据失败"
      description={errorMessage}
      type="error"
      showIcon
      action={<Button size="small" onClick={onRefetch}>重试</Button>}
    />
  );
}

export function WeeklySummaryFailedContent({
  data,
  canGenerateSummary,
  isBusy,
  onGenerateSummary,
}: WeeklySummaryFailedContentProps) {
  return (
    <Alert
      title="AI 总结生成失败"
      description={data?.error_message || '可能是由于数据量过大或服务超时，请稍后重试。'}
      type="warning"
      showIcon
      action={
        canGenerateSummary ? (
          <Button
            size="small"
            disabled={isBusy}
            onClick={() => onGenerateSummary(true)}
          >
            重新生成
          </Button>
        ) : undefined
      }
    />
  );
}

export function WeeklySummaryPendingContent() {
  return (
    <div className={styles.statusPanel}>
      <AiTaskStatus state="queued" label="任务已入队，正在等待工作线程处理..." />
    </div>
  );
}

export function WeeklySummaryGeneratingContent() {
  return (
    <div className={styles.statusPanel}>
      <AiTaskStatus state="thinking" label="AI 正在深度分析本周数据，请稍候..." />
    </div>
  );
}

export function WeeklySummaryEmptyContent({
  summaryLabel,
  canGenerateSummary,
}: WeeklySummaryEmptyContentProps) {
  return (
    <div className={styles.statusPanel}>
      <Bot className={styles.emptyIcon} size="1em" strokeWidth={1.8} aria-hidden="true" />
      <p className={styles.emptyText}>
        暂无{summaryLabel}
        {canGenerateSummary ? '，点击右上角按钮一键生成洞察。' : '，当前账号无生成权限，请联系管理员开通。'}
      </p>
    </div>
  );
}
