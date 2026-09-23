import { useCallback } from 'react';
import type { FormInstance } from 'antd/es/form';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsActionRequest, DataOpsRuntimePipeline } from '@/types/dataops';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import type { BatchOperationOptions } from './dataops-batch-helpers';
import type { BatchOperationAction } from './dataops-hub-formatters';
import { buildTriggerParametersPayload } from './dataops-trigger-helpers';
import { getActionKey } from './dataops-action-helpers';

type TriggerFormValues = Record<string, string | number | boolean>;
type ExecuteDataOpsAction = (
  payload: DataOpsActionRequest,
  actionKey: string
) => Promise<boolean>;

export function useDataOpsTriggerSubmitState(options: {
  actionPending: boolean;
  activeActionKey: string | null;
  batchActionKey: BatchOperationAction | null;
  batchTriggerForm: FormInstance<TriggerFormValues>;
  batchTriggerModalPipelineIds: string[] | null;
  batchTriggerModalSpecs: DataOpsTriggerParameterSpec[];
  batchTriggerPayloadPreview: TriggerFormValues;
  closeBatchTriggerModal: () => void;
  closeTriggerModal: () => void;
  executeAction: ExecuteDataOpsAction;
  handleBatchOperation: (
    action: BatchOperationAction,
    label: string,
    options: BatchOperationOptions
  ) => Promise<boolean>;
  hasOperatePermission: boolean;
  message: MessageInstance;
  triggerForm: FormInstance<TriggerFormValues>;
  triggerModalPipeline: DataOpsRuntimePipeline | undefined;
  triggerModalSpecs: DataOpsTriggerParameterSpec[];
}) {
  const {
    actionPending,
    activeActionKey,
    batchActionKey,
    batchTriggerForm,
    batchTriggerModalPipelineIds,
    batchTriggerModalSpecs,
    batchTriggerPayloadPreview,
    closeBatchTriggerModal,
    closeTriggerModal,
    executeAction,
    handleBatchOperation,
    hasOperatePermission,
    message,
    triggerForm,
    triggerModalPipeline,
    triggerModalSpecs,
  } = options;

  const handleTriggerWithParameters = useCallback(async () => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法执行该操作。');
      return;
    }

    if (!triggerModalPipeline) {
      return;
    }

    let values: TriggerFormValues = {};
    try {
      values = await triggerForm.validateFields();
    } catch {
      return;
    }

    const success = await executeAction(
      {
        action: 'trigger_pipeline',
        pipelineId: triggerModalPipeline.id,
        parameters: buildTriggerParametersPayload(triggerModalSpecs, values),
      },
      getActionKey('trigger_pipeline', `${triggerModalPipeline.id}:params`)
    );

    if (success) {
      closeTriggerModal();
    }
  }, [
    closeTriggerModal,
    executeAction,
    hasOperatePermission,
    message,
    triggerForm,
    triggerModalPipeline,
    triggerModalSpecs,
  ]);

  const handleBatchTriggerWithParameters = useCallback(async () => {
    if (!batchTriggerModalPipelineIds?.length) {
      return;
    }

    if (batchTriggerModalSpecs.length) {
      try {
        await batchTriggerForm.validateFields();
      } catch {
        return;
      }
    }

    const success = await handleBatchOperation('trigger_pipeline', '批量参数触发', {
      pipelineIds: batchTriggerModalPipelineIds,
      parameters: batchTriggerPayloadPreview,
      requireConfirm: false,
      requestKeySuffix: 'params',
    });
    if (success) {
      closeBatchTriggerModal();
    }
  }, [
    batchTriggerForm,
    batchTriggerModalPipelineIds,
    batchTriggerModalSpecs.length,
    batchTriggerPayloadPreview,
    closeBatchTriggerModal,
    handleBatchOperation,
  ]);

  const isBatchTriggerModalSubmitting =
    batchActionKey === 'trigger_pipeline' && Boolean(batchTriggerModalPipelineIds);
  const modalActionKey = triggerModalPipeline
    ? getActionKey('trigger_pipeline', `${triggerModalPipeline.id}:params`)
    : '';
  const isTriggerModalSubmitting = actionPending && activeActionKey === modalActionKey;

  return {
    handleBatchTriggerWithParameters,
    handleTriggerWithParameters,
    isBatchTriggerModalSubmitting,
    isTriggerModalSubmitting,
  };
}
