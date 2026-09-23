import { APIError } from '@/lib/request';
import type { DataOpsActionRequest } from '@/types/dataops';

export function getActionKey(action: DataOpsActionRequest['action'], targetId?: string): string {
  return `${action}:${targetId || 'unknown'}`;
}

export function getPipelineActionDisabledReason(options: {
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  hasDeployment: boolean;
}): string {
  if (!options.hasOperatePermission) {
    return '当前账号仅有查看权限，无法执行该操作。';
  }

  if (options.globalActionBusy) {
    return '当前存在进行中的任务操作，请稍后再试。';
  }

  if (!options.hasDeployment) {
    return '当前任务没有可操作的 Deployment。';
  }

  return '';
}

export function getActionErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const responsePayload = error.originalError?.response?.data;
    if (
      responsePayload &&
      typeof responsePayload === 'object' &&
      'message' in responsePayload &&
      typeof responsePayload.message === 'string' &&
      responsePayload.message.trim()
    ) {
      return responsePayload.message;
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '操作执行失败';
}

function isRetryableHttpStatus(statusCode: number): boolean {
  return [408, 409, 423, 425, 429, 500, 502, 503, 504].includes(statusCode);
}

export function isRetryableBatchFailureReason(reason: string): boolean {
  const normalized = reason.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const retryableKeywords = [
    '正在触发中',
    '活动运行',
    '冲突',
    '锁',
    'network',
    '网络',
    '不可达',
    'connection',
    '连接',
    'econn',
    'timeout',
    'timed out',
    'temporarily unavailable',
    'temporarily',
    'too many requests',
    '503',
    '502',
    '504',
    '429',
    '408',
    '409',
  ];

  return retryableKeywords.some((keyword) => normalized.includes(keyword));
}

export function isRetryableBatchFailure(error: unknown, reason: string): boolean {
  if (error instanceof APIError) {
    if (isRetryableHttpStatus(error.statusCode)) {
      return true;
    }

    const transportCode = typeof error.originalError?.code === 'string'
      ? error.originalError.code.trim().toUpperCase()
      : '';
    if (
      transportCode &&
      [
        'ERR_NETWORK',
        'ECONNABORTED',
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'EHOSTUNREACH',
        'ENETUNREACH',
      ].includes(transportCode)
    ) {
      return true;
    }
  }

  if (error instanceof Error && error.name.trim().toLowerCase() === 'aborterror') {
    return true;
  }

  return isRetryableBatchFailureReason(reason);
}

export async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  callback: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (!items.length) {
    return;
  }

  const normalizedConcurrency = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: normalizedConcurrency }, async () => {
      while (true) {
        const currentIndex = cursor;
        cursor += 1;
        if (currentIndex >= items.length) {
          return;
        }

        await callback(items[currentIndex], currentIndex);
      }
    })
  );
}
