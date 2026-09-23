import { Alert, Button, Empty, Skeleton, Spin } from 'antd';
import { CloudUploadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Badge } from '@/components/atoms/badge';
import type { LineChartData } from '@/components/organisms/line-chart';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  formatAnalysisStatusLabel,
  formatInteger,
  resolveStatusBadge,
} from '../_lib/live-center-formatters';
import type {
  LiveCenterAnalysisJob,
  LiveCenterRecordingSegment,
  LiveCenterSession,
  LiveCenterSessionDetailResponse,
} from '../_lib/live-center-types';
import type { LiveCenterUploadProgress } from '../_lib/live-center-upload';
import {
  findLatestAnalysis,
  findLatestSuccessfulAnalysis,
  isActiveAnalysisStatus,
} from '../_lib/live-center-view-helpers';
import {
  resolveReadinessItems,
  resolveRecordingSegmentStats,
  type ReadinessItem,
  type ReadinessTone,
  type RecordingSegmentStats,
} from '../_lib/live-center-readiness';
import styles from '../live-center.module.css';
import { MinuteTrendPanel } from './live-center-minute-trend-panel';
import {
  RecordingPanel,
  RecordingUploadButton,
  type LiveCenterRecordingFileSelectHandler,
} from './live-center-recording-panel';
import type { LiveCenterPlaybackState } from './live-center-shared';

export function LiveCenterDetailEmptyState() {
  return (
    <div className={styles.panel}>
      <div className={styles.detailEmptyState}>
        <VideoCameraOutlined />
        <div className={styles.detailEmptyCopy}>
          <h2>选择一场直播开始复盘</h2>
          <p>左侧选择 Groland 自播场次后查看录屏、分钟订单和 AI 结果。</p>
        </div>
      </div>
    </div>
  );
}

export function SessionDetail({
  analysisModel,
  analysisMutationLoading,
  cleanupLoadingSegmentId,
  detail,
  detailError,
  isDetailFetching,
  isDetailLoading,
  minuteChartData,
  onAnalysisModelChange,
  onCleanupSegment,
  onCreateAnalysis,
  onPlaySegment,
  onRetryDetail,
  onUploadFiles,
  playback,
  playbackLoadingSegmentId,
  selectedSession,
  uploadProgress,
  uploadRunning,
}: {
  analysisModel: string;
  analysisMutationLoading: boolean;
  cleanupLoadingSegmentId: string | null;
  detail?: LiveCenterSessionDetailResponse;
  detailError: unknown;
  isDetailFetching: boolean;
  isDetailLoading: boolean;
  minuteChartData: LineChartData;
  onAnalysisModelChange: (value: string) => void;
  onCleanupSegment: (segment: LiveCenterRecordingSegment) => void;
  onCreateAnalysis: () => void;
  onPlaySegment: (segment: LiveCenterRecordingSegment) => void;
  onRetryDetail: () => void;
  onUploadFiles: LiveCenterRecordingFileSelectHandler;
  playback: LiveCenterPlaybackState | null;
  playbackLoadingSegmentId: string | null;
  selectedSession: LiveCenterSession | null;
  uploadProgress: LiveCenterUploadProgress | null;
  uploadRunning: boolean;
}) {
  if (isDetailLoading && !detail && !selectedSession) {
    return (
      <div className={styles.panel}>
        <Skeleton active paragraph={{ rows: 6 }} title />
      </div>
    );
  }

  if (detailError && !detail) {
    return (
      <div className={styles.panel}>
        <Alert
          type="error"
          showIcon
          message="场次详情加载失败"
          description={resolveClientErrorMessage(detailError, '请稍后重试或重新选择场次。')}
        />
      </div>
    );
  }

  const session = detail?.session ?? selectedSession;
  if (!session) {
    return (
      <div className={styles.panel}>
        <Empty className={styles.emptyBlock} description="暂无可展示的直播场次详情" />
      </div>
    );
  }

  const recordingSegmentStats = resolveRecordingSegmentStats(session, detail);
  const readinessItems = resolveReadinessItems(session, detail, recordingSegmentStats);
  const analyses = detail?.analyses ?? [];
  const analysisDisplayStatus = resolveAnalysisDisplayStatus(session.analysisStatus, analyses);

  return (
    <>
      {isDetailFetching && detail ? (
        <div className={styles.detailRefreshHint}>
          <Spin size="small" />
          <span>正在刷新当前场次详情</span>
        </div>
      ) : null}
      {detailError && detail ? (
        <Alert
          className={styles.inlineAlert}
          type="warning"
          showIcon
          message="当前场次详情刷新失败，正在保留上一版可用数据"
          description={resolveClientErrorMessage(detailError, '请稍后重试或重新选择场次。')}
          action={(
            <Button size="small" onClick={onRetryDetail}>
              重试
            </Button>
          )}
        />
      ) : null}
      <RecordingPanel
        analyses={analyses}
        analysisModel={analysisModel}
        analysisMutationLoading={analysisMutationLoading}
        header={(
          <SessionReviewHeader
            analysisStatus={analysisDisplayStatus}
            onUploadFile={onUploadFiles}
            readinessItems={readinessItems}
            recordingSegmentStats={recordingSegmentStats}
            session={session}
            uploadRunning={uploadRunning}
          />
        )}
        onAnalysisModelChange={onAnalysisModelChange}
        onCleanupSegment={onCleanupSegment}
        onCreateAnalysis={onCreateAnalysis}
        onPlaySegment={onPlaySegment}
        onUploadFile={onUploadFiles}
        playback={playback}
        cleanupLoadingSegmentId={cleanupLoadingSegmentId}
        playbackLoadingSegmentId={playbackLoadingSegmentId}
        recording={detail?.recording ?? null}
        sessionAnalysisStatus={analysisDisplayStatus}
        sessionId={session.sessionId}
        uploadProgress={uploadProgress}
        uploadRunning={uploadRunning}
      />
      <MinuteTrendPanel
        chartData={minuteChartData}
        liveOrderCount={session.liveOrderCount}
        minuteMetrics={detail?.minuteMetrics ?? []}
      />
    </>
  );
}

function SessionReviewHeader({
  analysisStatus,
  onUploadFile,
  readinessItems,
  recordingSegmentStats,
  session,
  uploadRunning,
}: {
  analysisStatus: string | null;
  onUploadFile: LiveCenterRecordingFileSelectHandler;
  readinessItems: ReadinessItem[];
  recordingSegmentStats: RecordingSegmentStats;
  session: LiveCenterSession;
  uploadRunning: boolean;
}) {
  return (
    <header className={styles.sessionReviewHeader}>
      <div className={styles.sessionReviewHeaderMain}>
        <div className={styles.sessionReviewTitleBlock}>
          <h2>{session.anchorNickname || '未知主播'}</h2>
        </div>
        <div className={styles.compactStatusStrip} aria-label="复盘状态摘要">
          <Badge status={resolveStatusBadge(analysisStatus)}>
            {formatAnalysisStatusLabel(analysisStatus)}
          </Badge>
          {readinessItems.map((item) => (
            <span
              aria-label={`${item.label}：${item.status}`}
              className={`${styles.readinessToken} ${resolveReadinessTokenClassName(item.tone)}`}
              key={item.label}
              title={`${item.label}：${item.status}。${item.detail}`}
            >
              {item.label} {item.status}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.sessionReviewActions}>
        <span className={styles.recordingInlineMeta} aria-label="录屏分段数">
          <VideoCameraOutlined />
          <span>{recordingSegmentStats.displayLabel}</span>
          <strong>{formatInteger(recordingSegmentStats.displayCount)}</strong>
          <span>段</span>
          {typeof recordingSegmentStats.cleanupCount === 'number' && recordingSegmentStats.cleanupCount > 0 ? (
            <span title={`当前还有 ${formatInteger(recordingSegmentStats.cleanupCount)} 段未上传完成，需要清理或重新上传。`}>
              待清理 {formatInteger(recordingSegmentStats.cleanupCount)}
            </span>
          ) : null}
        </span>
        <RecordingUploadButton
          disabled={uploadRunning}
          icon={<CloudUploadOutlined />}
          loading={uploadRunning}
          onSelectFile={onUploadFile}
          type="primary"
        >
          上传录屏
        </RecordingUploadButton>
      </div>
    </header>
  );
}

function resolveAnalysisDisplayStatus(
  sessionStatus: string | null,
  analyses: LiveCenterAnalysisJob[]
): string | null {
  const latestSuccessfulAnalysis = findLatestSuccessfulAnalysis(analyses);
  if (latestSuccessfulAnalysis?.status) {
    return latestSuccessfulAnalysis.status;
  }

  const activeAnalysis = analyses.find((analysis) => isActiveAnalysisStatus(analysis.status));
  if (activeAnalysis?.status) {
    return activeAnalysis.status;
  }

  const latestAnalysis = findLatestAnalysis(analyses);
  return latestAnalysis?.status ?? sessionStatus;
}

function resolveReadinessTokenClassName(tone: ReadinessTone): string {
  if (tone === 'success') {
    return styles.readinessTokenSuccess;
  }
  if (tone === 'warning') {
    return styles.readinessTokenWarning;
  }
  if (tone === 'danger') {
    return styles.readinessTokenDanger;
  }
  if (tone === 'info') {
    return styles.readinessTokenInfo;
  }
  return styles.readinessTokenNeutral;
}
