import { asRecord } from './unknown-data';

type ErrorPayload = {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
};

function readErrorPayloadMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const data = record as ErrorPayload;
  const candidates = [data.detail, data.message, data.error];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) {
      return item.trim();
    }
  }

  return null;
}

export function resolveClientErrorStatus(error: unknown): number | undefined {
  const record = asRecord(error);
  if (!record) {
    return undefined;
  }

  const statusCode = record.statusCode;
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    return statusCode;
  }

  const status = record.status;
  if (typeof status === 'number' && Number.isFinite(status)) {
    return status;
  }

  const response = asRecord(record.response);
  const responseStatus = response?.status;
  if (typeof responseStatus === 'number' && Number.isFinite(responseStatus)) {
    return responseStatus;
  }

  const originalError = asRecord(record.originalError);
  const originalResponse = asRecord(originalError?.response);
  const originalStatus = originalResponse?.status;
  if (typeof originalStatus === 'number' && Number.isFinite(originalStatus)) {
    return originalStatus;
  }

  return undefined;
}

export function resolveClientErrorMessage(error: unknown, fallback: string): string {
  const record = asRecord(error);
  if (!record) {
    return fallback;
  }

  const directPayloadMessage = readErrorPayloadMessage(record.response);
  if (directPayloadMessage) {
    return directPayloadMessage;
  }

  const responseRecord = asRecord(record.response);
  const responseDataMessage = readErrorPayloadMessage(responseRecord?.data);
  if (responseDataMessage) {
    return responseDataMessage;
  }

  const originalError = asRecord(record.originalError);
  const originalResponse = asRecord(originalError?.response);
  const originalResponseMessage = readErrorPayloadMessage(originalResponse?.data);
  if (originalResponseMessage) {
    return originalResponseMessage;
  }

  const message = record.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return fallback;
}
