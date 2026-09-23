import { Button } from 'antd';
import { ArrowRightOutlined, RobotOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import {
  formatAnalysisStatusLabel,
  formatFullDateTime,
  formatInteger,
  resolveStatusBadge,
} from '../_lib/live-center-formatters';
import type { LiveCenterAnalysisJob } from '../_lib/live-center-types';
import {
  buildLiveCenterAnalysisResultPath,
  findLatestAnalysis,
  findLatestSuccessfulAnalysis,
  isActiveAnalysisStatus,
  resolveAnalysisDisplayId,
  resolveAnalysisMessage,
} from '../_lib/live-center-view-helpers';
import styles from '../live-center.module.css';

export function RecordingAnalysisBar({
  analyses,
  canCreateAnalysis,
  disabledReason,
  model,
  mutationLoading,
  onCreateAnalysis,
  onModelChange,
  sessionAnalysisStatus,
  sessionId,
}: {
  analyses: LiveCenterAnalysisJob[];
  canCreateAnalysis: boolean;
  disabledReason?: string;
  model: string;
  mutationLoading: boolean;
  onCreateAnalysis: () => void;
  onModelChange: (value: string) => void;
  sessionAnalysisStatus?: string | null;
  sessionId: string;
}) {
  const activeCount = analyses.filter((analysis) => isActiveAnalysisStatus(analysis.status)).length;
  const hasActiveJob = activeCount > 0 || isActiveAnalysisStatus(sessionAnalysisStatus);
  const latestSuccessfulAnalysis = findLatestSuccessfulAnalysis(analyses);
  const latestAnalysis = latestSuccessfulAnalysis ?? findLatestAnalysis(analyses);
  const resultAnalysisId = resolveAnalysisDisplayId(latestSuccessfulAnalysis);
  const resultPath = resultAnalysisId
    ? buildLiveCenterAnalysisResultPath(sessionId, resultAnalysisId)
    : null;
  const cannotCreateAnalysis = !canCreateAnalysis && !resultPath && !hasActiveJob;
  const statusForBadge = latestSuccessfulAnalysis?.status ?? (hasActiveJob ? sessionAnalysisStatus : latestAnalysis?.status);
  const statusLabel = latestSuccessfulAnalysis
    ? '任务完成'
    : hasActiveJob
      ? formatAnalysisStatusLabel(sessionAnalysisStatus ?? latestAnalysis?.status)
      : latestAnalysis
        ? formatAnalysisStatusLabel(latestAnalysis.status)
        : '待分析';
  const activeSummaryText = resolveAnalysisMessage({
    status: sessionAnalysisStatus ?? latestAnalysis?.status ?? 'running',
  });
  const summaryText = hasActiveJob && !latestSuccessfulAnalysis
    ? activeSummaryText
    : latestAnalysis
      ? resolveAnalysisMessage(latestAnalysis)
      : cannotCreateAnalysis
        ? disabledReason ?? '录屏上传完成后，才能创建 AI 分析任务。'
      : '录屏可播放后，可创建 AI 分析任务；完成后从这里进入结果页。';
  const resultTime = latestSuccessfulAnalysis
    ? formatFullDateTime(
      latestSuccessfulAnalysis.completedAt
        ?? latestSuccessfulAnalysis.finishedAt
        ?? latestSuccessfulAnalysis.updatedAt
        ?? latestSuccessfulAnalysis.createdAt
    )
    : null;

  return (
    <div className={styles.analysisItem} aria-label="录屏 AI 分析动作">
      <div className={styles.analysisItemHeader}>
        <div>
          <div className={styles.analysisTitleLine}>
            <RobotOutlined />
            <strong>AI 分析</strong>
            <Badge status={resolveStatusBadge(statusForBadge)}>{statusLabel}</Badge>
            {activeCount > 0 ? (
              <span className={styles.analysisJobId}>轮询 {formatInteger(activeCount)}</span>
            ) : null}
            {resultTime && resultTime !== '-' ? (
              <span className={styles.analysisJobId}>完成 {resultTime}</span>
            ) : null}
          </div>
          <p>{summaryText}</p>
        </div>
        <div className={styles.analysisActions}>
          {resultPath ? (
            <Link
              aria-label="查看 AI 分析结果"
              className={styles.analysisResultEntryLink}
              title="查看 AI 分析结果"
              to={resultPath}
            >
              <span>查看 AI 分析结果</span>
              <ArrowRightOutlined />
            </Link>
          ) : (
            <>
              <input
                aria-label="AI 分析模型"
                className={styles.analysisModelInput}
                disabled={mutationLoading || hasActiveJob || cannotCreateAnalysis}
                placeholder="模型（可选）"
                type="text"
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
              />
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={mutationLoading}
                disabled={mutationLoading || hasActiveJob || cannotCreateAnalysis}
                onClick={onCreateAnalysis}
              >
                {cannotCreateAnalysis ? '待录屏完成' : hasActiveJob ? '任务运行中' : 'AI 分析'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
