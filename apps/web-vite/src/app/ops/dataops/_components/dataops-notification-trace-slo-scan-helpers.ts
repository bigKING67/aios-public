import type {
  DataOpsNotificationTraceSloScanResponse,
} from '@/types/dataops';
import {
  buildNotificationTraceSloScanSuccessMessage,
  buildNotificationTraceSloScanWarningMessage,
  normalizeNotificationTraceSloScanRequestOptions,
  type NotificationTraceSloScanInputValues,
} from './dataops-notification-retry-helpers';

export interface NotificationTraceSloScanActionPayload {
  dryRun: boolean;
  lookbackHours: number;
  maxGroups: number;
  scanConcurrency: number;
}

export interface NotificationTraceSloScanFeedback {
  successMessage: string;
  warningMessage: string;
}

export function buildNotificationTraceSloScanNormalizedPayload(
  input: NotificationTraceSloScanInputValues & { dryRun: boolean }
): NotificationTraceSloScanActionPayload {
  const scanOptions = normalizeNotificationTraceSloScanRequestOptions({
    lookbackHours: input.lookbackHours,
    maxGroups: input.maxGroups,
    scanConcurrency: input.scanConcurrency,
  });

  return buildNotificationTraceSloScanActionPayload({
    dryRun: input.dryRun,
    lookbackHours: scanOptions.lookbackHours,
    maxGroups: scanOptions.maxGroups,
    scanConcurrency: scanOptions.scanConcurrency,
  });
}

export function buildNotificationTraceSloScanActionPayload(options: {
  dryRun: boolean;
  lookbackHours: number;
  maxGroups: number;
  scanConcurrency: number;
}): NotificationTraceSloScanActionPayload {
  return {
    dryRun: options.dryRun,
    lookbackHours: options.lookbackHours,
    maxGroups: options.maxGroups,
    scanConcurrency: options.scanConcurrency,
  };
}

export function buildNotificationTraceSloScanFeedback(
  result: DataOpsNotificationTraceSloScanResponse
): NotificationTraceSloScanFeedback {
  return {
    successMessage: buildNotificationTraceSloScanSuccessMessage(result),
    warningMessage: buildNotificationTraceSloScanWarningMessage(result),
  };
}
