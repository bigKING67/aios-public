import { useCallback, useMemo } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import {
  openDataOpsBatchHistoryAlertDraft,
} from './dataops-alert-draft-helpers';
import type {
  BatchExecutionSummary,
  BatchHistoryRetryGroup,
} from './dataops-batch-helpers';
import {
  buildDataOpsBatchHistoryDerivedState,
  buildDataOpsBatchHistoryFilterLabels,
} from './dataops-batch-history-selectors';
import {
  copyDataOpsLines,
  exportDataOpsBatchHistoryCsv,
  type DataOpsCsvExportActionOptions,
} from './dataops-feedback-actions';
import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
  AlertSendModalSource,
} from './dataops-hub-formatters';

export function useDataOpsBatchHistoryDerivedState(options: {
  availableAlertChannels: DataOpsNotificationChannel[];
  batchExecutionHistory: BatchExecutionSummary[];
  batchHistoryActionFilter: BatchOperationAction | 'all';
  batchHistoryFailureFilter: BatchHistoryFailureFilter;
  batchHistoryKeyword: string;
  batchHistoryTimeRangeFilter: BatchHistoryTimeRangeFilter;
  copyText: (text: string, label: string) => Promise<void>;
  defaultAlertChannelId?: string;
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  hasOperatePermission: boolean;
  message: MessageInstance;
  openAlertDraft: (draftOptions: {
    formValues: {
      channelId: string;
      messageTitle: string;
      messageText: string;
    };
    source: AlertSendModalSource;
    truncatedWarningText?: string;
  }) => void;
  retryFilteredBatchHistory: (
    retryOptions: { retryableOnly: boolean },
    groups: {
      retryGroups: BatchHistoryRetryGroup[];
      retryableGroups: BatchHistoryRetryGroup[];
    }
  ) => Promise<void>;
}) {
  const {
    availableAlertChannels,
    batchExecutionHistory,
    batchHistoryActionFilter,
    batchHistoryFailureFilter,
    batchHistoryKeyword,
    batchHistoryTimeRangeFilter,
    copyText,
    defaultAlertChannelId,
    exportCsv,
    hasOperatePermission,
    message,
    openAlertDraft,
    retryFilteredBatchHistory,
  } = options;

  const batchHistoryFilterLabels = useMemo(
    () =>
      buildDataOpsBatchHistoryFilterLabels({
        actionFilter: batchHistoryActionFilter,
        failureFilter: batchHistoryFailureFilter,
        timeRangeFilter: batchHistoryTimeRangeFilter,
        keyword: batchHistoryKeyword,
      }),
    [
      batchHistoryActionFilter,
      batchHistoryFailureFilter,
      batchHistoryKeyword,
      batchHistoryTimeRangeFilter,
    ]
  );
  const batchHistoryDerivedState = useMemo(
    () =>
      buildDataOpsBatchHistoryDerivedState({
        batchHistoryItems: batchExecutionHistory,
        actionFilter: batchHistoryActionFilter,
        failureFilter: batchHistoryFailureFilter,
        timeRangeFilter: batchHistoryTimeRangeFilter,
        keyword: batchHistoryKeyword,
        labels: batchHistoryFilterLabels,
        generatedAtText: new Date().toLocaleString('zh-CN', { hour12: false }),
      }),
    [
      batchExecutionHistory,
      batchHistoryActionFilter,
      batchHistoryFailureFilter,
      batchHistoryFilterLabels,
      batchHistoryKeyword,
      batchHistoryTimeRangeFilter,
    ]
  );

  const filteredBatchHistoryItems = batchHistoryDerivedState.items;
  const batchHistoryAlertTemplateText = batchHistoryDerivedState.alertTemplateText;
  const filteredBatchHistoryFailedPipelineIds = batchHistoryDerivedState.failedPipelineIds;
  const filteredBatchHistoryRetryGroups = batchHistoryDerivedState.retryGroups;
  const filteredBatchHistoryRetryableGroups = batchHistoryDerivedState.retryableGroups;

  const openBatchHistoryAlertModal = useCallback(() => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法发送告警模板。');
      return;
    }

    openDataOpsBatchHistoryAlertDraft({
      availableChannels: availableAlertChannels,
      defaultChannelId: defaultAlertChannelId,
      templateText: batchHistoryAlertTemplateText,
    }, {
      info: message.info,
      warning: message.warning,
      openDraft: openAlertDraft,
    });
  }, [
    availableAlertChannels,
    batchHistoryAlertTemplateText,
    defaultAlertChannelId,
    hasOperatePermission,
    message,
    openAlertDraft,
  ]);
  const retryFilteredBatchHistoryByCurrentGroups = useCallback(
    async (retryOptions: { retryableOnly: boolean }) => {
      await retryFilteredBatchHistory(retryOptions, {
        retryGroups: filteredBatchHistoryRetryGroups,
        retryableGroups: filteredBatchHistoryRetryableGroups,
      });
    },
    [
      filteredBatchHistoryRetryGroups,
      filteredBatchHistoryRetryableGroups,
      retryFilteredBatchHistory,
    ]
  );
  const copyFilteredBatchHistoryFailedPipelineIds = useCallback(async () => {
    await copyDataOpsLines({
      lines: filteredBatchHistoryFailedPipelineIds,
      copy: copyText,
      label: '筛选失败任务ID列表',
      onEmpty: () => message.info('当前筛选条件下没有失败任务ID。'),
    });
  }, [copyText, filteredBatchHistoryFailedPipelineIds, message]);
  const exportFilteredBatchHistoryCsv = useCallback(async () => {
    await exportDataOpsBatchHistoryCsv({
      filteredBatchHistoryItems,
      exportCsv,
      info: message.info,
    });
  }, [exportCsv, filteredBatchHistoryItems, message]);

  return {
    filteredBatchHistoryItems,
    batchHistoryAlertTemplateText,
    batchHistoryFailureSummary: batchHistoryDerivedState.failureSummary,
    batchHistoryFailureSummaryText: batchHistoryDerivedState.failureSummaryText,
    batchHistoryMarkdownText: batchHistoryDerivedState.markdownText,
    filteredBatchHistoryFailedPipelineIds,
    filteredBatchHistoryRetryableFailedPipelineIds:
      batchHistoryDerivedState.retryableFailedPipelineIds,
    filteredBatchHistoryRetryGroups,
    filteredBatchHistoryRetryableGroups,
    copyFilteredBatchHistoryFailedPipelineIds,
    exportFilteredBatchHistoryCsv,
    openBatchHistoryAlertModal,
    retryFilteredBatchHistoryByCurrentGroups,
  };
}
