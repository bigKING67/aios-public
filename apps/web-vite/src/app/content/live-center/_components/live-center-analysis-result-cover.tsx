import { Badge } from '@/components/atoms/badge';
import {
  formatAnalysisStatusLabel,
  formatFullDateTime,
  resolveStatusBadge,
} from '../_lib/live-center-formatters';
import type {
  LiveCenterAnalysisJob,
} from '../_lib/live-center-types';
import {
  resolveAnalysisConfidenceBadge,
  type LiveCenterAnalysisReviewTaskItem,
} from '../_lib/live-center-view-helpers';
import resultStyles from '../live-center-analysis-result.module.css';
import {
  formatReaderPayloadStatusLabel,
} from './live-center-analysis-result-card-helpers';
import {
  formatReviewPriorityLabel,
  formatVerdictLabel,
  resolveVerdictBadge,
} from './live-center-analysis-result-formatters';

export function AnalysisResultCover({
  analysisStatus,
  confidence,
  coverReason,
  evidenceRefs,
  generatedAt,
  oneSentenceConclusion,
  payloadStatusLabel,
  pinnedActionDetail,
  topActionItem,
  verdict,
}: {
  analysisStatus: LiveCenterAnalysisJob['status'];
  confidence: string | null;
  coverReason: string | null;
  evidenceRefs: string | null;
  generatedAt: string | null;
  oneSentenceConclusion: string;
  payloadStatusLabel: string;
  pinnedActionDetail: string | null;
  topActionItem: LiveCenterAnalysisReviewTaskItem | null;
  verdict: string | null;
}) {
  return (
    <div className={resultStyles.reviewCover}>
      <div className={resultStyles.reviewCoverMain}>
        <div className={resultStyles.analysisResultStatusLine}>
          <Badge status={resolveStatusBadge(analysisStatus)}>
            {formatAnalysisStatusLabel(analysisStatus)}
          </Badge>
          <Badge status={resolveVerdictBadge(verdict)}>
            {formatVerdictLabel(verdict)}
          </Badge>
          {confidence ? (
            <Badge status={resolveAnalysisConfidenceBadge(confidence)}>
              置信度 {confidence}
            </Badge>
          ) : null}
        </div>
        <span className={resultStyles.reviewEyebrow}>抖音直播录屏 AI 运营复盘</span>
        <h2>{oneSentenceConclusion}</h2>
        {coverReason ? <p>{coverReason}</p> : null}
        <div className={resultStyles.reviewEvidenceLine}>
          <span>{formatReaderPayloadStatusLabel(payloadStatusLabel)}</span>
          {evidenceRefs ? <span>证据见追溯材料</span> : null}
          {generatedAt ? <span>生成 {formatFullDateTime(generatedAt)}</span> : null}
        </div>
      </div>
      <aside className={resultStyles.reviewCoverAside} aria-label="最高优先级动作">
        <span>现在最该做</span>
        {topActionItem ? (
          <>
            <strong>{topActionItem.title}</strong>
            {pinnedActionDetail ? <p>{pinnedActionDetail}</p> : null}
            <div className={resultStyles.analysisResultTaskMeta}>
              {topActionItem.priority ? <span>优先级 {formatReviewPriorityLabel(topActionItem.priority)}</span> : null}
              {topActionItem.owner ? <span>负责人 {topActionItem.owner}</span> : null}
            </div>
          </>
        ) : (
          <>
            <strong>等待运营复核动作</strong>
            <p>当前分析没有返回 actionPlan / reviewTasks；页面不伪造执行建议。</p>
          </>
        )}
      </aside>
    </div>
  );
}
