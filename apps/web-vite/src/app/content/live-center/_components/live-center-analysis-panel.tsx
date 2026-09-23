import { Button, Empty, Input } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { Badge } from '@/components/atoms/badge';
import {
  formatAnalysisStatusLabel,
  formatFullDateTime,
  formatInteger,
  resolveStatusBadge,
} from '../_lib/live-center-formatters';
import type { LiveCenterAnalysisJob } from '../_lib/live-center-types';
import { isActiveAnalysisStatus, resolveAnalysisMessage } from '../_lib/live-center-view-helpers';
import styles from '../live-center.module.css';
import { PanelHeader } from './live-center-shared';

export function AnalysisPanel({
  analyses,
  model,
  mutationLoading,
  onCreateAnalysis,
  onModelChange,
  sessionAnalysisStatus,
}: {
  analyses: LiveCenterAnalysisJob[];
  model: string;
  mutationLoading: boolean;
  onCreateAnalysis: () => void;
  onModelChange: (value: string) => void;
  sessionAnalysisStatus?: string | null;
}) {
  const activeCount = analyses.filter((analysis) => isActiveAnalysisStatus(analysis.status)).length;
  const hasActiveJob = activeCount > 0 || isActiveAnalysisStatus(sessionAnalysisStatus);

  return (
    <section className={styles.panel} aria-label="AI 分析">
      <PanelHeader
        title="AI 分析"
        description="触发后自动轮询任务状态。"
        extra={
          analyses.length > 0 ? (
            <div className={styles.panelMetaStrip}>
              <span>任务 {formatInteger(analyses.length)}</span>
              {activeCount > 0 ? <span>轮询 {formatInteger(activeCount)}</span> : null}
            </div>
          ) : hasActiveJob ? (
            <div className={styles.panelMetaStrip}>
              <span>{formatAnalysisStatusLabel(sessionAnalysisStatus)}</span>
            </div>
          ) : (
            <RobotOutlined className={styles.panelIcon} />
          )
        }
      />
      <div className={styles.analysisActions}>
        <Input
          allowClear
          aria-label="AI 分析模型"
          placeholder="模型（可选，留空使用后端默认）"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
        />
        <Button
          type="primary"
          icon={<RobotOutlined />}
          loading={mutationLoading}
          disabled={mutationLoading || hasActiveJob}
          onClick={onCreateAnalysis}
        >
          {hasActiveJob ? '任务运行中' : '创建分析任务'}
        </Button>
      </div>
      {hasActiveJob ? (
        <p className={styles.analysisActionHint}>任务运行中，结束后可再次触发。</p>
      ) : null}
      {analyses.length === 0 ? (
        <Empty
          className={styles.emptyBlock}
          description={
            hasActiveJob
              ? 'AI 任务运行中。'
              : '暂无 AI 任务。'
          }
        />
      ) : (
        <div className={styles.analysisList}>
          {analyses.map((analysis, index) => (
            <div key={resolveAnalysisKey(analysis, index)} className={styles.analysisItem}>
              <div className={styles.analysisItemHeader}>
                <div className={styles.analysisTitleLine}>
                  <Badge status={resolveStatusBadge(analysis.status)}>
                    {formatAnalysisStatusLabel(analysis.status)}
                  </Badge>
                  <strong>{analysis.model || '默认模型'}</strong>
                </div>
                {resolveAnalysisIdLabel(analysis) ? (
                  <span className={styles.analysisJobId}>{resolveAnalysisIdLabel(analysis)}</span>
                ) : null}
              </div>
              <p className={analysis.errorMessage ? styles.analysisErrorText : undefined}>
                {resolveAnalysisMessage(analysis)}
              </p>
              <div className={styles.analysisMetaGrid}>
                {resolveAnalysisTimeItems(analysis).map((item) => (
                  <span key={item.label}>
                    {item.label} {item.value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function resolveAnalysisIdLabel(analysis: LiveCenterAnalysisJob): string | null {
  const id = analysis.analysisId || analysis.jobId;
  return id ? `ID ${id}` : null;
}

function resolveAnalysisTimeItems(analysis: LiveCenterAnalysisJob): Array<{ label: string; value: string }> {
  return [
    resolveAnalysisTimeItem('创建', analysis.createdAt),
    resolveAnalysisTimeItem('开始', analysis.startedAt),
    resolveAnalysisTimeItem('完成', analysis.completedAt ?? analysis.finishedAt),
    resolveAnalysisTimeItem('更新', analysis.updatedAt),
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function resolveAnalysisTimeItem(label: string, value?: string | null): { label: string; value: string } | null {
  const formatted = formatFullDateTime(value);
  return formatted === '-' ? null : { label, value: formatted };
}

function resolveAnalysisKey(analysis: LiveCenterAnalysisJob, index: number): string {
  return (
    analysis.analysisId ||
    analysis.jobId ||
    `${analysis.status ?? 'unknown'}-${analysis.createdAt ?? 'pending'}-${index}`
  );
}
