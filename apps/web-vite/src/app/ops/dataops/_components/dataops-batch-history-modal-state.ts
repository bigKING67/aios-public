import { useCallback, useMemo, useState } from 'react';
import { Form } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import type { DataOpsActionRequest } from '@/types/dataops';
import { getActionKey } from './dataops-action-helpers';
import type { BatchHistoryAlertSendFormValues } from './dataops-batch-helpers';
import {
  getAlertSendActionKeySuffix,
  getAlertSendFallbackTitle,
  getAlertSendModalCopy,
} from './dataops-alert-helpers';
import { resetDataOpsAlertDraftModal } from './dataops-alert-draft-helpers';
import type {
  AlertSendModalSource,
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
} from './dataops-hub-formatters';

export function useDataOpsBatchHistoryModalState(options: {
  availableAlertChannels: DataOpsNotificationChannel[];
  executeAction: (payload: DataOpsActionRequest, actionKey: string) => Promise<boolean>;
  hasOperatePermission: boolean;
  message: MessageInstance;
}) {
  const { availableAlertChannels, executeAction, hasOperatePermission, message } = options;
  const [batchHistoryModalOpen, setBatchHistoryModalOpen] = useState(false);
  const [batchHistoryAlertModalOpen, setBatchHistoryAlertModalOpen] = useState(false);
  const [batchHistoryAlertSubmitting, setBatchHistoryAlertSubmitting] = useState(false);
  const [batchHistoryAlertModalSource, setBatchHistoryAlertModalSource] =
    useState<AlertSendModalSource>('batch_history');
  const [batchHistoryActionFilter, setBatchHistoryActionFilter] = useState<
    BatchOperationAction | 'all'
  >('all');
  const [batchHistoryFailureFilter, setBatchHistoryFailureFilter] =
    useState<BatchHistoryFailureFilter>('all');
  const [batchHistoryTimeRangeFilter, setBatchHistoryTimeRangeFilter] =
    useState<BatchHistoryTimeRangeFilter>('all');
  const [batchHistoryKeyword, setBatchHistoryKeyword] = useState('');
  const [batchHistoryAlertForm] = Form.useForm<BatchHistoryAlertSendFormValues>();

  const batchHistoryAlertModalCopy = useMemo(
    () => getAlertSendModalCopy(batchHistoryAlertModalSource),
    [batchHistoryAlertModalSource]
  );

  const resetBatchHistoryFilters = useCallback(() => {
    setBatchHistoryActionFilter('all');
    setBatchHistoryFailureFilter('all');
    setBatchHistoryTimeRangeFilter('all');
    setBatchHistoryKeyword('');
  }, []);

  const resetBatchHistoryAlertModal = useCallback(() => {
    resetDataOpsAlertDraftModal({
      resetFields: () => batchHistoryAlertForm.resetFields(),
      setOpen: setBatchHistoryAlertModalOpen,
      setSource: setBatchHistoryAlertModalSource,
      setSubmitting: setBatchHistoryAlertSubmitting,
    });
  }, [batchHistoryAlertForm]);

  const openBatchHistoryModal = useCallback(() => {
    resetBatchHistoryFilters();
    resetBatchHistoryAlertModal();
    setBatchHistoryModalOpen(true);
  }, [resetBatchHistoryAlertModal, resetBatchHistoryFilters]);

  const closeBatchHistoryModal = useCallback(() => {
    resetBatchHistoryFilters();
    setBatchHistoryModalOpen(false);
    resetBatchHistoryAlertModal();
  }, [resetBatchHistoryAlertModal, resetBatchHistoryFilters]);

  const openBatchHistoryAlertDraftModal = useCallback(
    (draftOptions: {
      formValues: BatchHistoryAlertSendFormValues;
      source: AlertSendModalSource;
      truncatedWarningText?: string;
    }) => {
      batchHistoryAlertForm.setFieldsValue(draftOptions.formValues);
      setBatchHistoryAlertModalSource(draftOptions.source);
      setBatchHistoryAlertSubmitting(false);
      setBatchHistoryAlertModalOpen(true);
      if (draftOptions.truncatedWarningText) {
        message.warning(draftOptions.truncatedWarningText);
      }
    },
    [batchHistoryAlertForm, message]
  );

  const applyBatchHistoryReasonFilter = useCallback((reason: string) => {
    setBatchHistoryFailureFilter('has_failed');
    setBatchHistoryKeyword(reason);
  }, []);

  const closeBatchHistoryAlertModal = useCallback(() => {
    resetBatchHistoryAlertModal();
  }, [resetBatchHistoryAlertModal]);

  const submitBatchHistoryAlertModal = useCallback(async () => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法发送通知。');
      return;
    }

    let values: BatchHistoryAlertSendFormValues;
    try {
      values = await batchHistoryAlertForm.validateFields();
    } catch {
      return;
    }

    const targetChannel = availableAlertChannels.find((item) => item.id === values.channelId);
    if (!targetChannel) {
      message.warning('选中的 Webhook 通道不可用，请重新选择。');
      return;
    }

    const normalizedMessageText = values.messageText.trim();
    if (!normalizedMessageText) {
      message.warning('通知内容不能为空。');
      return;
    }

    const fallbackMessageTitle = getAlertSendFallbackTitle(batchHistoryAlertModalSource);
    const normalizedMessageTitle = values.messageTitle.trim() || fallbackMessageTitle;
    const actionKeySuffix = getAlertSendActionKeySuffix(batchHistoryAlertModalSource);

    try {
      setBatchHistoryAlertSubmitting(true);
      const success = await executeAction(
        {
          action: 'test_channel_webhook',
          channelId: targetChannel.id,
          parameters: {
            messageTitle: normalizedMessageTitle,
            messageText: normalizedMessageText,
          },
        },
        getActionKey('test_channel_webhook', `${targetChannel.id}:${actionKeySuffix}`)
      );
      if (success) {
        closeBatchHistoryAlertModal();
      }
    } finally {
      setBatchHistoryAlertSubmitting(false);
    }
  }, [
    availableAlertChannels,
    batchHistoryAlertForm,
    batchHistoryAlertModalSource,
    closeBatchHistoryAlertModal,
    executeAction,
    hasOperatePermission,
    message,
  ]);

  return {
    batchHistoryModalOpen,
    setBatchHistoryModalOpen,
    batchHistoryAlertModalOpen,
    batchHistoryAlertSubmitting,
    batchHistoryActionFilter,
    setBatchHistoryActionFilter,
    batchHistoryFailureFilter,
    setBatchHistoryFailureFilter,
    batchHistoryTimeRangeFilter,
    setBatchHistoryTimeRangeFilter,
    batchHistoryKeyword,
    setBatchHistoryKeyword,
    batchHistoryAlertForm,
    batchHistoryAlertModalCopy,
    resetBatchHistoryFilters,
    openBatchHistoryModal,
    closeBatchHistoryModal,
    openBatchHistoryAlertDraftModal,
    applyBatchHistoryReasonFilter,
    closeBatchHistoryAlertModal,
    submitBatchHistoryAlertModal,
  };
}
