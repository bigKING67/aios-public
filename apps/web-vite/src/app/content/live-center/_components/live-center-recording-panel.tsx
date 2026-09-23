import type { ChangeEvent, ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import { Button, Popconfirm, Table } from 'antd';
import type { ButtonProps, TableProps } from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { Badge } from '@/components/atoms/badge';
import {
  formatDateTime,
  formatDurationSeconds,
  formatFileSize,
  formatFullDateTime,
  formatInteger,
  formatStatusLabel,
  resolveStatusBadge,
} from '../_lib/live-center-formatters';
import { isLiveCenterRecordingSegmentPlayable } from '../_lib/live-center-recording-segment-helpers';
import type {
  LiveCenterAnalysisJob,
  LiveCenterRecording,
  LiveCenterRecordingSegment,
} from '../_lib/live-center-types';
import type { LiveCenterUploadProgress } from '../_lib/live-center-upload';
import { LIVE_CENTER_VIDEO_ACCEPT } from '../_lib/live-center-view-helpers';
import styles from '../live-center.module.css';
import { RecordingAnalysisBar } from './live-center-recording-analysis-bar';
import recordingStyles from './live-center-recording-panel.module.css';
import { RecordingUploadProgressPanel } from './live-center-recording-upload-progress';
import type { LiveCenterPlaybackState } from './live-center-shared';

export type LiveCenterRecordingFileSelectHandler = (files: File[]) => void;

const segmentTableColumnCellProps = {
  className: recordingStyles.segmentTableBodyCell,
  onHeaderCell: () => ({
    className: recordingStyles.segmentTableHeaderCell,
  }),
};

export function RecordingPanel({
  analyses,
  analysisModel,
  analysisMutationLoading,
  cleanupLoadingSegmentId,
  header,
  onAnalysisModelChange,
  onCleanupSegment,
  onCreateAnalysis,
  onPlaySegment,
  onUploadFile,
  playback,
  playbackLoadingSegmentId,
  recording,
  sessionAnalysisStatus,
  sessionId,
  uploadProgress,
  uploadRunning,
}: {
  analyses: LiveCenterAnalysisJob[];
  analysisModel: string;
  analysisMutationLoading: boolean;
  header: ReactNode;
  onAnalysisModelChange: (value: string) => void;
  onCleanupSegment: (segment: LiveCenterRecordingSegment) => void;
  onCreateAnalysis: () => void;
  onPlaySegment: (segment: LiveCenterRecordingSegment) => void;
  onUploadFile: LiveCenterRecordingFileSelectHandler;
  playback: LiveCenterPlaybackState | null;
  playbackLoadingSegmentId: string | null;
  recording: LiveCenterRecording | null;
  sessionAnalysisStatus?: string | null;
  sessionId: string;
  uploadProgress: LiveCenterUploadProgress | null;
  uploadRunning: boolean;
  cleanupLoadingSegmentId: string | null;
}) {
  const segments = recording?.segments ?? [];
  const hasPlayableSegments = segments.some(isLiveCenterRecordingSegmentPlayable);
  const segmentColumns = useMemo<TableProps<LiveCenterRecordingSegment>['columns']>(
    () => [
      {
        ...segmentTableColumnCellProps,
        dataIndex: 'segmentIndex',
        key: 'segment',
        title: '分段',
        width: 56,
        render: (value: LiveCenterRecordingSegment['segmentIndex']) => (
          <span className={styles.numericText}>#{formatInteger(value)}</span>
        ),
      },
      {
        ...segmentTableColumnCellProps,
        dataIndex: 'fileName',
        key: 'fileName',
        title: '文件',
        render: (value: LiveCenterRecordingSegment['fileName'], segment) => (
          <div className={recordingStyles.fileCell}>
            <strong title={value || `录屏分段 ${segment.segmentIndex}`}>
              {value || `录屏分段 ${segment.segmentIndex}`}
            </strong>
            <span>{formatFileSize(segment.fileSizeBytes)} · {formatDurationSeconds(segment.durationSeconds)}</span>
          </div>
        ),
      },
      {
        ...segmentTableColumnCellProps,
        dataIndex: 'uploadStatus',
        key: 'uploadStatus',
        title: '上传',
        width: 76,
        render: (value: LiveCenterRecordingSegment['uploadStatus']) => (
          <Badge status={resolveStatusBadge(value)}>{formatStatusLabel(value)}</Badge>
        ),
      },
      {
        ...segmentTableColumnCellProps,
        dataIndex: 'processingStatus',
        key: 'processingStatus',
        title: '处理',
        width: 76,
        render: (value: LiveCenterRecordingSegment['processingStatus']) => (
          <Badge status={resolveStatusBadge(value)}>{formatStatusLabel(value)}</Badge>
        ),
      },
      {
        ...segmentTableColumnCellProps,
        dataIndex: 'uploadedAt',
        key: 'uploadedAt',
        title: '上传时间',
        width: 104,
        render: (value: LiveCenterRecordingSegment['uploadedAt']) => (
          <span className={styles.mutedMono}>{formatDateTime(value)}</span>
        ),
      },
      {
        ...segmentTableColumnCellProps,
        key: 'action',
        title: '操作',
        width: 72,
        render: (_value, segment) => (
          <RecordingSegmentAction
            cleanupLoadingSegmentId={cleanupLoadingSegmentId}
            cleanupDisabled={uploadRunning || Boolean(cleanupLoadingSegmentId)}
            playbackLoadingSegmentId={playbackLoadingSegmentId}
            segment={segment}
            onCleanupSegment={onCleanupSegment}
            onPlaySegment={onPlaySegment}
          />
        ),
      },
    ],
    [cleanupLoadingSegmentId, onCleanupSegment, onPlaySegment, playbackLoadingSegmentId, uploadRunning]
  );

  const hasSegments = segments.length > 0;

  return (
    <section className={`${styles.panel} ${styles.sessionEvidencePanel} ${recordingStyles.sessionEvidencePanel}`} aria-label="录屏复盘">
      {header}
      {uploadProgress ? <RecordingUploadProgressPanel progress={uploadProgress} /> : null}
      {!hasSegments && !playback && !uploadProgress ? (
        <div className={styles.detailEmptyState}>
          <VideoCameraOutlined />
          <div className={styles.detailEmptyCopy}>
            <h2>等待录屏证据</h2>
            <p>可一次选择多段录屏，系统会按文件名时间顺序排队上传；片段不需要覆盖完整直播。</p>
          </div>
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
      ) : null}
      {hasSegments || playback ? (
        <div className={recordingStyles.recordingGrid}>
          <div className={`${recordingStyles.playerBox} ${!playback ? recordingStyles.playerBoxEmpty : ''}`}>
            {playback ? (
              <>
                <video className={recordingStyles.videoPlayer} controls preload="metadata" src={playback.url} />
                <div className={recordingStyles.playerMeta}>
                  <strong>{playback.fileName}</strong>
                  <span>
                    播放地址有效期至 {formatFullDateTime(playback.expiresAt)} ·{' '}
                    {formatFileSize(playback.fileSizeBytes)}
                  </span>
                </div>
              </>
            ) : (
              <div className={recordingStyles.playerEmpty}>
                <VideoCameraOutlined />
                <p>{hasPlayableSegments ? '选择已上传分段后播放。' : '当前分段尚未上传完成，请先清理残留或重新上传。'}</p>
              </div>
            )}
          </div>
          <div className={recordingStyles.segmentList}>
            <Table<LiveCenterRecordingSegment>
              columns={segmentColumns}
              dataSource={segments}
              pagination={false}
              rowKey="segmentId"
              scroll={{ x: 560 }}
              size="small"
            />
            <ol className={recordingStyles.segmentCards} aria-label="录屏分段列表">
              {segments.map((segment) => {
                const fileName = segment.fileName || `录屏分段 ${segment.segmentIndex}`;
                return (
                  <li className={recordingStyles.segmentCard} key={segment.segmentId}>
                    <div className={recordingStyles.segmentCardHeader}>
                      <div className={recordingStyles.segmentCardTitle}>
                        <span className={styles.numericText}>#{formatInteger(segment.segmentIndex)}</span>
                        <strong title={fileName}>{fileName}</strong>
                        <span>
                          {formatFileSize(segment.fileSizeBytes)} · {formatDurationSeconds(segment.durationSeconds)}
                        </span>
                      </div>
                      <RecordingSegmentAction
                        cleanupLoadingSegmentId={cleanupLoadingSegmentId}
                        cleanupDisabled={uploadRunning || Boolean(cleanupLoadingSegmentId)}
                        playbackLoadingSegmentId={playbackLoadingSegmentId}
                        segment={segment}
                        onCleanupSegment={onCleanupSegment}
                        onPlaySegment={onPlaySegment}
                      />
                    </div>
                    <div className={recordingStyles.segmentCardMeta}>
                      <Badge status={resolveStatusBadge(segment.uploadStatus)}>
                        上传 {formatStatusLabel(segment.uploadStatus)}
                      </Badge>
                      <Badge status={resolveStatusBadge(segment.processingStatus)}>
                        处理 {formatStatusLabel(segment.processingStatus)}
                      </Badge>
                      <span>{formatDateTime(segment.uploadedAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : null}
      {hasSegments ? (
        <RecordingAnalysisBar
          analyses={analyses}
          canCreateAnalysis={hasPlayableSegments}
          disabledReason="需要至少 1 段已上传且未被清理/跳过的录屏，才能创建 AI 分析任务。"
          model={analysisModel}
          mutationLoading={analysisMutationLoading}
          sessionAnalysisStatus={sessionAnalysisStatus}
          sessionId={sessionId}
          onCreateAnalysis={onCreateAnalysis}
          onModelChange={onAnalysisModelChange}
        />
      ) : null}
    </section>
  );
}

function RecordingSegmentAction({
  cleanupDisabled,
  cleanupLoadingSegmentId,
  onCleanupSegment,
  onPlaySegment,
  playbackLoadingSegmentId,
  segment,
}: {
  cleanupDisabled: boolean;
  cleanupLoadingSegmentId: string | null;
  onCleanupSegment: (segment: LiveCenterRecordingSegment) => void;
  onPlaySegment: (segment: LiveCenterRecordingSegment) => void;
  playbackLoadingSegmentId: string | null;
  segment: LiveCenterRecordingSegment;
}) {
  if (isLiveCenterRecordingSegmentPlayable(segment)) {
    return (
      <Button
        size="small"
        icon={<PlayCircleOutlined />}
        loading={playbackLoadingSegmentId === segment.segmentId}
        onClick={(event) => {
          event.stopPropagation();
          onPlaySegment(segment);
        }}
      >
        播放
      </Button>
    );
  }

  return (
    <Popconfirm
      title="清理未完成的录屏分段？"
      description="会尝试终止 TOS 分片上传并物理删除已产生的 TOS 对象，然后从当前场次隐藏该分段。"
      okText="清理"
      cancelText="取消"
      okButtonProps={{ danger: true, loading: cleanupLoadingSegmentId === segment.segmentId }}
      onConfirm={(event) => {
        event?.stopPropagation();
        onCleanupSegment(segment);
      }}
    >
      <Button
        danger
        disabled={cleanupDisabled}
        size="small"
        icon={<DeleteOutlined />}
        loading={cleanupLoadingSegmentId === segment.segmentId}
        onClick={(event) => event.stopPropagation()}
      >
        清理
      </Button>
    </Popconfirm>
  );
}

export function RecordingUploadButton({
  children,
  disabled,
  icon,
  loading,
  multiple = true,
  onSelectFile,
  size = 'small',
  type,
}: {
  children: ReactNode;
  disabled?: boolean;
  icon?: ButtonProps['icon'];
  loading?: boolean;
  multiple?: boolean;
  onSelectFile: LiveCenterRecordingFileSelectHandler;
  size?: ButtonProps['size'];
  type?: ButtonProps['type'];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length > 0) {
      onSelectFile(files);
    }
  };

  return (
    <span className={recordingStyles.fileUploadControl}>
      <input
        ref={inputRef}
        accept={LIVE_CENTER_VIDEO_ACCEPT}
        aria-hidden="true"
        className={recordingStyles.fileUploadInput}
        disabled={disabled || loading}
        multiple={multiple}
        tabIndex={-1}
        type="file"
        onChange={handleFileChange}
      />
      <Button
        aria-label="上传直播录屏，可多选"
        disabled={disabled || loading}
        icon={icon}
        loading={loading}
        size={size}
        type={type}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </Button>
    </span>
  );
}
