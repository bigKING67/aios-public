import {
  completeLiveCenterRecordingSegment,
  createLiveCenterRecordingUpload,
  resumeLiveCenterRecordingMultipartUpload,
} from './live-center-api';
import type {
  LiveCenterRecordingUploadCompletePart,
  LiveCenterRecordingMultipartResumeResponse,
  LiveCenterRecordingUploadPart,
  LiveCenterRecordingSegment,
  LiveCenterRecordingUploadCreateResponse,
} from './live-center-types';
import {
  createLiveCenterResumableUploadRecord,
  deleteLiveCenterResumableUploadRecord,
  getLiveCenterResumableUploadRecord,
  saveLiveCenterResumableUploadPart,
  saveLiveCenterResumableUploadRecord,
} from './live-center-upload-resume-store';

export type LiveCenterUploadStage =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'completing'
  | 'done'
  | 'error';

export type LiveCenterUploadQueueItemStatus =
  | 'pending'
  | 'uploading'
  | 'done'
  | 'skipped'
  | 'error';

export interface LiveCenterUploadQueueItemProgress {
  fileName: string;
  fileSizeBytes: number;
  id: string;
  message?: string;
  percent?: number | null;
  segmentIndex?: number;
  status: LiveCenterUploadQueueItemStatus;
}

export interface LiveCenterUploadQueueProgress {
  completedItems: number;
  currentItemIndex: number | null;
  failedItems: number;
  items: LiveCenterUploadQueueItemProgress[];
  skippedItems: number;
  totalItems: number;
  uploadableItems: number;
}

export interface LiveCenterUploadProgress {
  currentFileName?: string;
  stage: LiveCenterUploadStage;
  loadedBytes?: number;
  totalBytes?: number | null;
  percent: number | null;
  message: string;
  queue?: LiveCenterUploadQueueProgress;
}

export interface UploadLiveCenterRecordingSegmentInput {
  sessionId: string;
  file: File;
  segmentIndex: number;
  onProgress?: (progress: LiveCenterUploadProgress) => void;
}

type LiveCenterRecordingUploadSession =
  | LiveCenterRecordingUploadCreateResponse
  | LiveCenterRecordingMultipartResumeResponse;

interface LiveCenterResolvedRecordingUpload {
  completedParts: LiveCenterRecordingUploadCompletePart[];
  recordId: string | null;
  upload: LiveCenterRecordingUploadSession;
}

const MAX_INLINE_SHA256_BYTES = 256 * 1024 * 1024;
const VIDEO_METADATA_TIMEOUT_MS = 10_000;
const LARGE_RECORDING_UPLOAD_FALLBACK_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const LARGE_RECORDING_UPLOAD_MAX_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const LARGE_RECORDING_UPLOAD_MIN_TIMEOUT_MS = 5 * 60 * 1000;
const LARGE_RECORDING_UPLOAD_EXPIRY_BUFFER_MS = 60 * 1000;
const LARGE_RECORDING_MULTIPART_MAX_CONCURRENCY = 2;
const LARGE_RECORDING_MULTIPART_MAX_ATTEMPTS = 3;
const LARGE_RECORDING_MULTIPART_RETRY_DELAY_MS = 1_000;

export async function uploadLiveCenterRecordingSegment({
  file,
  onProgress,
  segmentIndex,
  sessionId,
}: UploadLiveCenterRecordingSegmentInput): Promise<LiveCenterRecordingSegment> {
  onProgress?.({
    stage: 'preparing',
    percent: 3,
    message: '正在准备录屏元数据',
  });
  const [sha256, durationSeconds] = await Promise.all([
    calculateOptionalFileSha256(file),
    readVideoDurationSeconds(file),
  ]);

  onProgress?.({
    stage: 'preparing',
    percent: 8,
    message: '正在创建直播录屏上传凭证',
  });
  let resumeRecordId: string | null = null;
  let restoredMultipartParts: LiveCenterRecordingUploadCompletePart[] = [];
  let upload: LiveCenterResolvedRecordingUpload | null = await resumeStoredMultipartUpload(sessionId, segmentIndex, file, (message) => {
    onProgress?.({
      stage: 'preparing',
      percent: 8,
      message,
    });
  });

  if (upload) {
    resumeRecordId = upload.recordId;
    restoredMultipartParts = upload.completedParts;
  } else {
    const createdUpload = await createLiveCenterRecordingUpload(sessionId, {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
      ...(sha256 ? { sha256 } : {}),
      segmentIndex,
    });
    const resumableRecord = createLiveCenterResumableUploadRecord({
      file,
      segmentIndex,
      sessionId,
      upload: createdUpload,
    });
    if (resumableRecord) {
      resumeRecordId = resumableRecord.id;
      await saveLiveCenterResumableUploadRecord(resumableRecord);
    }
    restoredMultipartParts = createdUpload.completedParts || [];
    upload = {
      completedParts: restoredMultipartParts,
      recordId: resumeRecordId,
      upload: createdUpload,
    };
  }

  const multipartParts =
    upload.upload.uploadStrategy === 'multipart'
      ? await uploadMultipartFileToTos(
          upload.upload,
          file,
          {
            initialCompletedParts: restoredMultipartParts,
            resumeRecordId,
          },
          (progress) => {
            onProgress?.(progress);
          }
        )
      : undefined;

  if (upload.upload.uploadStrategy !== 'multipart') {
    await uploadFileToTos(upload.upload as LiveCenterRecordingUploadCreateResponse, file, (progress) => {
      onProgress?.(progress);
    });
  }

  onProgress?.({
    stage: 'completing',
    percent: 99,
    message: '正在确认上传并写入录屏分段',
  });
  const completed = await completeLiveCenterRecordingSegment(upload.upload.recordingId, upload.upload.segmentId, {
    fileSizeBytes: file.size,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(sha256 ? { sha256 } : {}),
    ...(upload.upload.uploadId && multipartParts
      ? {
          multipartUploadId: upload.upload.uploadId,
          multipartParts,
        }
      : {}),
  });
  if (resumeRecordId) {
    await deleteLiveCenterResumableUploadRecord(resumeRecordId);
  }

  onProgress?.({
    stage: 'done',
    percent: 100,
    message: '录屏分段已上传完成',
  });

  return completed;
}

async function resumeStoredMultipartUpload(
  sessionId: string,
  segmentIndex: number,
  file: File,
  onProgress: (message: string) => void
): Promise<LiveCenterResolvedRecordingUpload | null> {
  const stored = await getLiveCenterResumableUploadRecord(sessionId, segmentIndex, file);
  if (!stored) {
    return null;
  }

  onProgress('发现未完成分片上传，正在恢复上传状态');
  try {
    const upload = await resumeLiveCenterRecordingMultipartUpload(stored.recordingId, stored.segmentId, {
      fileSizeBytes: file.size,
      sessionId,
      uploadId: stored.uploadId,
    });
    await saveLiveCenterResumableUploadRecord({
      ...stored,
      completedParts: upload.completedParts || [],
      expiresAt: upload.expiresAt,
      partSizeBytes: upload.partSizeBytes,
    });
    return {
      completedParts: upload.completedParts || [],
      recordId: stored.id,
      upload,
    };
  } catch (error) {
    if (shouldDiscardStoredMultipartUpload(error)) {
      await deleteLiveCenterResumableUploadRecord(stored.id);
      onProgress('上次分片上传已不可恢复，已清理本地恢复记录，正在重新创建上传任务');
      return null;
    }
    throw error;
  }
}

function shouldDiscardStoredMultipartUpload(error: unknown): boolean {
  const statusCode = typeof error === 'object' && error !== null
    ? Number((error as { statusCode?: unknown; status?: unknown }).statusCode ?? (error as { status?: unknown }).status)
    : Number.NaN;
  if (!Number.isFinite(statusCode)) {
    return false;
  }
  return statusCode === 400 || statusCode === 404 || statusCode === 409;
}

async function calculateOptionalFileSha256(file: File): Promise<string | undefined> {
  if (file.size > MAX_INLINE_SHA256_BYTES || typeof crypto === 'undefined' || !crypto.subtle) {
    return undefined;
  }
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

async function readVideoDurationSeconds(file: File): Promise<number | undefined> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return undefined;
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';

  try {
    const duration = await new Promise<number | undefined>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        resolve(undefined);
      }, VIDEO_METADATA_TIMEOUT_MS);
      const complete = (value: number | undefined) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      };
      video.onloadedmetadata = () => {
        const nextDuration = video.duration;
        if (Number.isFinite(nextDuration) && nextDuration > 0) {
          complete(Math.round(nextDuration));
          return;
        }
        complete(undefined);
      };
      video.onerror = () => complete(undefined);
      video.src = objectUrl;
    });
    return duration;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadFileToTos(
  upload: LiveCenterRecordingUploadCreateResponse,
  file: File,
  onProgress: (progress: LiveCenterUploadProgress) => void
): Promise<void> {
  if (!upload.uploadUrl) {
    throw new Error('TOS 上传失败：缺少上传地址');
  }
  const uploadUrl = upload.uploadUrl;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, uploadUrl);
    xhr.timeout = resolveUploadTimeoutMs(upload.expiresAt);
    Object.entries(upload.headers || {}).forEach(([key, value]) => {
      if (value) {
        xhr.setRequestHeader(key, value);
      }
    });
    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size || null;
      onProgress({
        stage: 'uploading',
        loadedBytes: event.loaded,
        totalBytes,
        percent: totalBytes ? Math.min(98, Math.round((event.loaded / totalBytes) * 90) + 8) : null,
        message: '正在上传录屏分段到 TOS',
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const detail = xhr.responseText ? `：${xhr.responseText.slice(0, 240)}` : '';
      reject(new Error(`TOS 上传失败（HTTP ${xhr.status}）${detail}`));
    };
    xhr.onerror = () => reject(new Error('TOS 上传失败：网络连接异常'));
    xhr.ontimeout = () => reject(new Error('TOS 上传失败：请求超时'));
    xhr.send(file);
  });
}

async function uploadMultipartFileToTos(
  upload: LiveCenterRecordingUploadSession,
  file: File,
  options: {
    initialCompletedParts?: LiveCenterRecordingUploadCompletePart[];
    resumeRecordId?: string | null;
  },
  onProgress: (progress: LiveCenterUploadProgress) => void
): Promise<LiveCenterRecordingUploadCompletePart[]> {
  const parts = upload.parts || [];
  if (!upload.uploadId || parts.length === 0) {
    throw new Error('TOS 分片上传失败：缺少分片上传参数');
  }

  const partsByNumber = new Map(parts.map((part) => [part.partNumber, part]));
  const completedPartsByNumber = new Map<number, LiveCenterRecordingUploadCompletePart>();
  const loadedByPart = new Map<number, number>();
  (options.initialCompletedParts || []).forEach((part) => {
    const uploadPart = partsByNumber.get(part.partNumber);
    if (!uploadPart) return;
    completedPartsByNumber.set(part.partNumber, part);
    loadedByPart.set(part.partNumber, uploadPart.endByteExclusive - uploadPart.startByte);
  });
  const pendingParts = parts.filter((part) => !completedPartsByNumber.has(part.partNumber));
  let nextPartIndex = 0;

  const publishMultipartProgress = (message: string) => {
    const loadedBytes = Array.from(loadedByPart.values()).reduce((total, value) => total + value, 0);
    onProgress({
      stage: 'uploading',
      loadedBytes,
      totalBytes: file.size,
      percent: Math.min(98, Math.round((loadedBytes / file.size) * 90) + 8),
      message,
    });
  };

  async function worker(): Promise<void> {
    while (nextPartIndex < pendingParts.length) {
      const part = pendingParts[nextPartIndex];
      nextPartIndex += 1;
      const completedPart = await uploadMultipartPartWithRetry(
        part,
        file,
        upload.expiresAt,
        (loadedBytes, message) => {
          loadedByPart.set(part.partNumber, loadedBytes);
          publishMultipartProgress(message);
        }
      );
      loadedByPart.set(part.partNumber, part.endByteExclusive - part.startByte);
      completedPartsByNumber.set(completedPart.partNumber, completedPart);
      if (options.resumeRecordId) {
        await saveLiveCenterResumableUploadPart(options.resumeRecordId, completedPart);
      }
      publishMultipartProgress(`正在上传录屏分片 ${completedPartsByNumber.size}/${parts.length}`);
    }
  }

  publishMultipartProgress(
    completedPartsByNumber.size > 0
      ? `已恢复 ${completedPartsByNumber.size}/${parts.length} 个录屏分片，继续上传剩余分片`
      : `正在上传录屏分片 0/${parts.length}`
  );
  const workerCount = Math.min(LARGE_RECORDING_MULTIPART_MAX_CONCURRENCY, pendingParts.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return Array.from(completedPartsByNumber.values()).sort((left, right) => left.partNumber - right.partNumber);
}

async function uploadMultipartPartWithRetry(
  part: LiveCenterRecordingUploadPart,
  file: File,
  fallbackExpiresAt: string,
  onProgress: (loadedBytes: number, message: string) => void
): Promise<LiveCenterRecordingUploadCompletePart> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LARGE_RECORDING_MULTIPART_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await uploadMultipartPart(part, file, fallbackExpiresAt, (loadedBytes) => {
        onProgress(
          loadedBytes,
          `正在上传录屏分片 ${part.partNumber}${attempt > 1 ? `（第 ${attempt} 次重试）` : ''}`
        );
      });
    } catch (error) {
      lastError = error;
      onProgress(0, `录屏分片 ${part.partNumber} 上传失败，准备重试`);
      if (attempt < LARGE_RECORDING_MULTIPART_MAX_ATTEMPTS) {
        await delay(LARGE_RECORDING_MULTIPART_RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`录屏分片 ${part.partNumber} 上传失败`);
}

async function uploadMultipartPart(
  part: LiveCenterRecordingUploadPart,
  file: File,
  fallbackExpiresAt: string,
  onProgress: (loadedBytes: number) => void
): Promise<LiveCenterRecordingUploadCompletePart> {
  const chunk = file.slice(part.startByte, part.endByteExclusive, file.type || 'application/octet-stream');
  return new Promise<LiveCenterRecordingUploadCompletePart>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(part.method, part.uploadUrl);
    xhr.timeout = resolveUploadTimeoutMs(part.expiresAt || fallbackExpiresAt);
    Object.entries(part.headers || {}).forEach(([key, value]) => {
      if (value) {
        xhr.setRequestHeader(key, value);
      }
    });
    xhr.upload.onprogress = (event) => {
      onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')?.trim();
        if (!etag) {
          reject(new Error(`TOS 分片 ${part.partNumber} 上传失败：缺少 ETag`));
          return;
        }
        resolve({
          partNumber: part.partNumber,
          etag,
        });
        return;
      }
      const detail = xhr.responseText ? `：${xhr.responseText.slice(0, 240)}` : '';
      reject(new Error(`TOS 分片 ${part.partNumber} 上传失败（HTTP ${xhr.status}）${detail}`));
    };
    xhr.onerror = () => reject(new Error(`TOS 分片 ${part.partNumber} 上传失败：网络连接异常`));
    xhr.ontimeout = () => reject(new Error(`TOS 分片 ${part.partNumber} 上传失败：请求超时`));
    xhr.send(chunk);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function resolveUploadTimeoutMs(expiresAt: string | null | undefined): number {
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAtMs)) {
    return LARGE_RECORDING_UPLOAD_FALLBACK_TIMEOUT_MS;
  }

  const availableMs = expiresAtMs - Date.now() - LARGE_RECORDING_UPLOAD_EXPIRY_BUFFER_MS;
  if (!Number.isFinite(availableMs) || availableMs <= 0) {
    return LARGE_RECORDING_UPLOAD_MIN_TIMEOUT_MS;
  }
  return Math.max(
    LARGE_RECORDING_UPLOAD_MIN_TIMEOUT_MS,
    Math.min(availableMs, LARGE_RECORDING_UPLOAD_MAX_TIMEOUT_MS)
  );
}
