import { useMemo } from 'react';

import type { BatchOperationAction } from './dataops-hub-formatters';

export function useDataOpsGlobalActionState(options: {
  activeActionKey: string | null;
  batchActionKey: BatchOperationAction | null;
  notificationBatchRetrySubmitting: boolean;
  notificationTraceSloScanRunning: boolean;
  actionPending: boolean;
}) {
  const {
    activeActionKey,
    batchActionKey,
    notificationBatchRetrySubmitting,
    notificationTraceSloScanRunning,
    actionPending,
  } = options;

  const globalActionBusy =
    actionPending ||
    Boolean(batchActionKey) ||
    notificationBatchRetrySubmitting ||
    notificationTraceSloScanRunning;

  const activeFeishuSyncJobKey = useMemo(() => {
    if (!actionPending || !activeActionKey?.startsWith('trigger_feishu_sync:')) {
      return null;
    }

    return activeActionKey.slice('trigger_feishu_sync:'.length);
  }, [activeActionKey, actionPending]);

  return {
    activeFeishuSyncJobKey,
    globalActionBusy,
  };
}
