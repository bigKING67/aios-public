import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { resolveClientErrorMessage } from '@/lib/client-error';
import type { LiveCenterRecordingSegment } from './live-center-types';
import {
  uploadLiveCenterRecordingSegment,
  type LiveCenterUploadProgress,
  type LiveCenterUploadQueueItemProgress,
  type LiveCenterUploadQueueItemStatus,
} from './live-center-upload';
import {
  isAcceptedLiveRecordingFile,
  sortLiveCenterRecordingFiles,
} from './live-center-view-helpers';

interface RecordingUploadQueueEntry extends LiveCenterUploadQueueItemProgress {
  file: File;
}

interface RecordingUploadRun {
  runId: string;
  sessionId: string;
}

export interface ScopedLiveCenterUploadProgress extends LiveCenterUploadProgress, RecordingUploadRun {}

interface StartRecordingUploadQueueInput {
  files: File[];
  segmentIndexes: number[];
  sessionId: string;
}

interface UseLiveCenterRecordingUploadQueueInput {
  invalidateSessionData: (sessionId: string) => Promise<void>;
  notifyError: (content: string) => void;
  notifySuccess: (content: string) => void;
  notifyWarning: (content: string) => void;
}

export function useLiveCenterRecordingUploadQueue({
  invalidateSessionData,
  notifyError,
  notifySuccess,
  notifyWarning,
}: UseLiveCenterRecordingUploadQueueInput) {
  const [uploadProgress, setUploadProgress] = useState<ScopedLiveCenterUploadProgress | null>(null);
  const activeUploadRunRef = useRef<RecordingUploadRun | null>(null);
  const uploadQueueRunningRef = useRef(false);

  const uploadMutation = useMutation<
    LiveCenterRecordingSegment[],
    unknown,
    StartRecordingUploadQueueInput
  >({
    mutationFn: async ({ files, segmentIndexes, sessionId }) => {
      const uploadRun: RecordingUploadRun = {
        runId: createRecordingUploadRunId(),
        sessionId,
      };
      activeUploadRunRef.current = uploadRun;
      const publishUploadProgress = (progress: LiveCenterUploadProgress) => {
        if (!isActiveRecordingUploadRun(activeUploadRunRef.current, uploadRun)) {
          return;
        }
        setUploadProgress({
          ...progress,
          runId: uploadRun.runId,
          sessionId: uploadRun.sessionId,
        });
      };

      let queue = buildRecordingUploadQueue(files, segmentIndexes);
      const uploadableTotal = countUploadableQueueItems(queue);
      const skippedCount = countQueueItemsByStatus(queue, 'skipped');
      const completedSegments: LiveCenterRecordingSegment[] = [];

      publishUploadProgress(buildQueueProgress({
        message: buildQueueStartMessage(queue),
        queue,
        stage: 'queued',
      }));

      if (queue.length === 0) {
        throw new Error('请选择至少 1 个录屏文件。');
      }
      if (uploadableTotal === 0) {
        throw new Error(`没有可上传的录屏文件，已跳过 ${skippedCount} 个文件。`);
      }
      if (skippedCount > 0) {
        notifyWarning(`已跳过 ${skippedCount} 个无效录屏文件。`);
      }

      const uploadableEntries = queue.filter((entry) => entry.status !== 'skipped');
      for (const [uploadIndex, entry] of uploadableEntries.entries()) {
        const segmentIndex = entry.segmentIndex;
        if (!isValidQueuedSegmentIndex(segmentIndex)) {
          throw new Error('录屏上传队列缺少有效分段编号。');
        }
        queue = updateQueueEntry(queue, entry.id, {
          message: '准备上传',
          percent: 0,
          status: 'uploading',
        });
        publishUploadProgress(buildQueueProgress({
          currentEntryId: entry.id,
          message: buildCurrentQueueMessage(entry, uploadIndex, uploadableTotal),
          queue,
          stage: 'preparing',
        }));

        try {
          const completedSegment = await uploadLiveCenterRecordingSegment({
            file: entry.file,
            onProgress: (progress) => {
              queue = updateQueueEntry(queue, entry.id, {
                message: progress.message,
                percent: progress.percent,
                status: 'uploading',
              });
              publishUploadProgress(buildQueueProgress({
                currentEntryId: entry.id,
                loadedBytes: progress.loadedBytes,
                message: buildCurrentQueueMessage(entry, uploadIndex, uploadableTotal, progress.message),
                queue,
                stage: resolveQueueStageForSegmentProgress(progress.stage, uploadIndex, uploadableTotal),
                totalBytes: progress.totalBytes,
              }));
            },
            segmentIndex,
            sessionId,
          });

          completedSegments.push(completedSegment);
          queue = updateQueueEntry(queue, entry.id, {
            message: '已上传完成',
            percent: 100,
            status: 'done',
          });
          const completedCount = completedSegments.length;
          publishUploadProgress(buildQueueProgress({
            currentEntryId: entry.id,
            message: `已完成第 ${completedCount}/${uploadableTotal} 个录屏分段`,
            queue,
            stage: completedCount === uploadableTotal ? 'done' : 'uploading',
          }));
          void invalidateSessionData(sessionId).catch(() => undefined);
        } catch (error) {
          const errorMessage = resolveClientErrorMessage(error, '录屏上传失败，请稍后重试。');
          queue = updateQueueEntry(queue, entry.id, {
            message: errorMessage,
            status: 'error',
          });
          publishUploadProgress(buildQueueProgress({
            currentEntryId: entry.id,
            message: `第 ${uploadIndex + 1}/${uploadableTotal} 个录屏分段上传失败：${errorMessage}`,
            queue,
            stage: 'error',
          }));
          throw new Error(`第 ${uploadIndex + 1}/${uploadableTotal} 个录屏分段上传失败：${errorMessage}`);
        }
      }

      publishUploadProgress(buildQueueProgress({
        message: `录屏队列已上传完成：${completedSegments.length} 段${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`,
        queue,
        stage: 'done',
      }));

      return completedSegments;
    },
    onError: (error) => {
      const errorMessage = resolveClientErrorMessage(error, '录屏上传失败，请稍后重试。');
      const currentUploadRun = activeUploadRunRef.current;
      setUploadProgress((previousProgress) => ({
        runId: previousProgress?.runId ?? currentUploadRun?.runId ?? 'unknown',
        sessionId: previousProgress?.sessionId ?? currentUploadRun?.sessionId ?? '',
        currentFileName: previousProgress?.currentFileName,
        loadedBytes: previousProgress?.loadedBytes,
        stage: 'error',
        percent: previousProgress?.percent ?? null,
        message: errorMessage,
        queue: previousProgress?.queue,
        totalBytes: previousProgress?.totalBytes,
      }));
      notifyError(errorMessage);
    },
    onSettled: () => {
      uploadQueueRunningRef.current = false;
      activeUploadRunRef.current = null;
    },
    onSuccess: async (response, variables) => {
      notifySuccess(response.length > 1 ? `录屏队列已上传完成（${response.length} 段）` : '录屏分段已上传完成');
      await invalidateSessionData(variables.sessionId);
    },
  });

  const clearStaleUploadProgressForSession = useCallback((sessionId: string | null) => {
    setUploadProgress((previousProgress) => {
      if (!previousProgress) return null;
      if (previousProgress.sessionId === sessionId) return previousProgress;
      return uploadQueueRunningRef.current ? previousProgress : null;
    });
  }, []);

  const startUploadQueue = useCallback((input: StartRecordingUploadQueueInput): boolean => {
    if (uploadQueueRunningRef.current || uploadMutation.isPending) {
      return false;
    }
    uploadQueueRunningRef.current = true;
    uploadMutation.mutate(input);
    return true;
  }, [uploadMutation]);

  return {
    clearStaleUploadProgressForSession,
    startUploadQueue,
    uploadProgress,
    uploadRunning: uploadQueueRunningRef.current || uploadMutation.isPending,
  };
}

function buildRecordingUploadQueue(files: File[], segmentIndexes: number[]): RecordingUploadQueueEntry[] {
  let uploadableIndex = 0;
  return sortLiveCenterRecordingFiles(files).map((file, index) => {
    const validationError = resolveRecordingFileValidationError(file);
    const baseEntry = {
      file,
      fileName: file.name,
      fileSizeBytes: file.size,
      id: `${index}-${file.name}-${file.size}-${file.lastModified}`,
      percent: null,
    };

    if (validationError) {
      return {
        ...baseEntry,
        message: validationError,
        status: 'skipped' as const,
      };
    }

    const segmentIndex = segmentIndexes[uploadableIndex];
    uploadableIndex += 1;
    if (!isValidQueuedSegmentIndex(segmentIndex)) {
      throw new Error('录屏上传队列缺少有效分段编号。');
    }
    return {
      ...baseEntry,
      message: `待上传为分段 #${segmentIndex}`,
      segmentIndex,
      status: 'pending' as const,
    };
  });
}

function isValidQueuedSegmentIndex(segmentIndex: number | undefined): segmentIndex is number {
  return typeof segmentIndex === 'number' && Number.isFinite(segmentIndex) && segmentIndex > 0;
}

function createRecordingUploadRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isActiveRecordingUploadRun(
  currentRun: RecordingUploadRun | null,
  expectedRun: RecordingUploadRun
): boolean {
  return currentRun?.runId === expectedRun.runId && currentRun.sessionId === expectedRun.sessionId;
}

function resolveRecordingFileValidationError(file: File): string | null {
  if (!isAcceptedLiveRecordingFile(file)) {
    return '文件类型不支持';
  }
  if (file.size <= 0) {
    return '空文件，已跳过';
  }
  return null;
}

function updateQueueEntry(
  queue: RecordingUploadQueueEntry[],
  entryId: string,
  patch: Partial<Pick<RecordingUploadQueueEntry, 'message' | 'percent' | 'status'>>
): RecordingUploadQueueEntry[] {
  return queue.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
}

function buildQueueProgress({
  currentEntryId,
  loadedBytes,
  message,
  queue,
  stage,
  totalBytes,
}: {
  currentEntryId?: string;
  loadedBytes?: number;
  message: string;
  queue: RecordingUploadQueueEntry[];
  stage: LiveCenterUploadProgress['stage'];
  totalBytes?: number | null;
}): LiveCenterUploadProgress {
  const currentEntry = currentEntryId ? queue.find((entry) => entry.id === currentEntryId) : null;
  return {
    currentFileName: currentEntry?.fileName,
    loadedBytes,
    message,
    percent: resolveQueuePercent(queue),
    queue: {
      completedItems: countQueueItemsByStatus(queue, 'done'),
      currentItemIndex: currentEntry ? queue.findIndex((entry) => entry.id === currentEntry.id) + 1 : null,
      failedItems: countQueueItemsByStatus(queue, 'error'),
      items: queue.map(toQueueItemProgress),
      skippedItems: countQueueItemsByStatus(queue, 'skipped'),
      totalItems: queue.length,
      uploadableItems: countUploadableQueueItems(queue),
    },
    stage,
    totalBytes,
  };
}

function toQueueItemProgress(entry: RecordingUploadQueueEntry): LiveCenterUploadQueueItemProgress {
  return {
    fileName: entry.fileName,
    fileSizeBytes: entry.fileSizeBytes,
    id: entry.id,
    message: entry.message,
    percent: entry.percent,
    segmentIndex: entry.segmentIndex,
    status: entry.status,
  };
}

function buildQueueStartMessage(queue: RecordingUploadQueueEntry[]): string {
  const uploadableCount = countUploadableQueueItems(queue);
  const skippedCount = countQueueItemsByStatus(queue, 'skipped');
  if (uploadableCount === 0) {
    return `已选择 ${queue.length} 个文件，暂无可上传录屏`;
  }
  return `已按文件名时间排序，准备顺序上传 ${uploadableCount} 个录屏分段${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`;
}

function buildCurrentQueueMessage(
  entry: RecordingUploadQueueEntry,
  uploadIndex: number,
  uploadableTotal: number,
  stageMessage?: string
): string {
  const segmentLabel = entry.segmentIndex ? `分段 #${entry.segmentIndex}` : '录屏分段';
  return `正在上传第 ${uploadIndex + 1}/${uploadableTotal} 个${segmentLabel}：${entry.fileName}${stageMessage ? ` · ${stageMessage}` : ''}`;
}

function resolveQueueStageForSegmentProgress(
  stage: LiveCenterUploadProgress['stage'],
  uploadIndex: number,
  uploadableTotal: number
): LiveCenterUploadProgress['stage'] {
  if (stage === 'done' && uploadIndex + 1 < uploadableTotal) {
    return 'uploading';
  }
  return stage;
}

function resolveQueuePercent(queue: RecordingUploadQueueEntry[]): number | null {
  const uploadableEntries = queue.filter((entry) => entry.status !== 'skipped');
  if (uploadableEntries.length === 0) {
    return null;
  }

  const completedUnits = uploadableEntries.reduce((total, entry) => {
    if (entry.status === 'done') return total + 1;
    if (entry.status === 'uploading' || entry.status === 'error') {
      return total + Math.max(0, Math.min(1, (entry.percent ?? 0) / 100));
    }
    return total;
  }, 0);

  return Math.max(0, Math.min(100, Math.round((completedUnits / uploadableEntries.length) * 100)));
}

function countUploadableQueueItems(queue: RecordingUploadQueueEntry[]): number {
  return queue.filter((entry) => entry.status !== 'skipped').length;
}

function countQueueItemsByStatus(
  queue: RecordingUploadQueueEntry[],
  status: LiveCenterUploadQueueItemStatus
): number {
  return queue.filter((entry) => entry.status === status).length;
}
