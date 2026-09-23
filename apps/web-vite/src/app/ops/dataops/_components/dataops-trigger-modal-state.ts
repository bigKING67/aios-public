import { useCallback, useMemo, useState } from 'react';
import { Form } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsRuntimePipeline } from '@/types/dataops';
import {
  buildLinuxCommandPreview,
  buildTriggerParametersPayload,
  getDefaultTriggerParameters,
  getTriggerParameterSpecs,
  resolveCommonBatchTriggerSpecs,
} from './dataops-trigger-helpers';

type TriggerFormValues = Record<string, string | number | boolean>;

export function useDataOpsTriggerModalState(options: {
  hasOperatePermission: boolean;
  message: MessageInstance;
  pipelineMap: Map<string, DataOpsRuntimePipeline>;
  selectedPipelines: DataOpsRuntimePipeline[];
}) {
  const { hasOperatePermission, message, pipelineMap, selectedPipelines } = options;
  const [triggerModalPipelineId, setTriggerModalPipelineId] = useState<string | null>(null);
  const [batchTriggerModalPipelineIds, setBatchTriggerModalPipelineIds] = useState<
    string[] | null
  >(null);
  const [commandModalPipelineId, setCommandModalPipelineId] = useState<string | null>(null);
  const [triggerForm] = Form.useForm<TriggerFormValues>();
  const [batchTriggerForm] = Form.useForm<TriggerFormValues>();
  const [commandForm] = Form.useForm<TriggerFormValues>();

  const triggerModalPipeline = triggerModalPipelineId
    ? pipelineMap.get(triggerModalPipelineId)
    : undefined;
  const commandModalPipeline = commandModalPipelineId
    ? pipelineMap.get(commandModalPipelineId)
    : undefined;
  const batchTriggerModalPipelines = useMemo(
    () =>
      (batchTriggerModalPipelineIds || [])
        .map((id) => pipelineMap.get(id))
        .filter((item): item is DataOpsRuntimePipeline => Boolean(item)),
    [batchTriggerModalPipelineIds, pipelineMap]
  );

  const triggerModalSpecs = useMemo(
    () => (triggerModalPipeline ? getTriggerParameterSpecs(triggerModalPipeline.id) : []),
    [triggerModalPipeline]
  );
  const batchTriggerModalSpecs = useMemo(
    () => resolveCommonBatchTriggerSpecs(batchTriggerModalPipelines),
    [batchTriggerModalPipelines]
  );
  const batchTriggerFormValues = Form.useWatch([], batchTriggerForm) as TriggerFormValues | undefined;
  const batchTriggerFormResolvedValues = useMemo(
    () => ({
      ...getDefaultTriggerParameters(batchTriggerModalSpecs),
      ...(batchTriggerFormValues || {}),
    }),
    [batchTriggerFormValues, batchTriggerModalSpecs]
  );
  const batchTriggerPayloadPreview = useMemo(
    () => buildTriggerParametersPayload(batchTriggerModalSpecs, batchTriggerFormResolvedValues),
    [batchTriggerFormResolvedValues, batchTriggerModalSpecs]
  );
  const batchTriggerExecutionPreview = useMemo(
    () =>
      batchTriggerModalPipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        parameters: batchTriggerPayloadPreview,
      })),
    [batchTriggerModalPipelines, batchTriggerPayloadPreview]
  );
  const commandModalSpecs = useMemo(
    () => (commandModalPipeline ? getTriggerParameterSpecs(commandModalPipeline.id) : []),
    [commandModalPipeline]
  );
  const commandFormValues = Form.useWatch([], commandForm) as TriggerFormValues | undefined;
  const commandFormResolvedValues = useMemo(
    () => ({ ...getDefaultTriggerParameters(commandModalSpecs), ...(commandFormValues || {}) }),
    [commandFormValues, commandModalSpecs]
  );
  const commandModalCommandPreview = useMemo(
    () =>
      commandModalPipeline
        ? buildLinuxCommandPreview(
            commandModalPipeline,
            commandModalSpecs,
            commandFormResolvedValues
          )
        : { deployCommand: '', runCommand: '', runWithParamsCommand: '' },
    [commandFormResolvedValues, commandModalPipeline, commandModalSpecs]
  );

  const openTriggerModal = useCallback(
    (pipeline: DataOpsRuntimePipeline) => {
      const specs = getTriggerParameterSpecs(pipeline.id);
      triggerForm.resetFields();
      triggerForm.setFieldsValue(getDefaultTriggerParameters(specs));
      setTriggerModalPipelineId(pipeline.id);
    },
    [triggerForm]
  );

  const closeTriggerModal = useCallback(() => {
    setTriggerModalPipelineId(null);
    triggerForm.resetFields();
  }, [triggerForm]);

  const openBatchTriggerModal = useCallback(() => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法执行批量操作。');
      return;
    }

    if (!selectedPipelines.length) {
      message.info('请先选择任务。');
      return;
    }

    const batchBlockedPipelines = selectedPipelines.filter(
      (pipeline) => pipeline.batchTriggerAllowed === false
    );
    if (batchBlockedPipelines.length) {
      message.warning(
        `以下任务包含外部投递副作用，仅支持单独确认触发：${batchBlockedPipelines
          .map((pipeline) => pipeline.name)
          .join(' / ')}`
      );
      return;
    }

    const executablePipelines = selectedPipelines.filter((pipeline) =>
      Boolean(pipeline.runtime?.deploymentId)
    );
    if (!executablePipelines.length) {
      message.warning('所选任务没有可操作的 Deployment。');
      return;
    }

    const specs = resolveCommonBatchTriggerSpecs(executablePipelines);
    batchTriggerForm.resetFields();
    batchTriggerForm.setFieldsValue(getDefaultTriggerParameters(specs));
    setBatchTriggerModalPipelineIds(executablePipelines.map((item) => item.id));
  }, [batchTriggerForm, hasOperatePermission, message, selectedPipelines]);

  const closeBatchTriggerModal = useCallback(() => {
    setBatchTriggerModalPipelineIds(null);
    batchTriggerForm.resetFields();
  }, [batchTriggerForm]);

  const openCommandModal = useCallback(
    (pipeline: DataOpsRuntimePipeline) => {
      const specs = getTriggerParameterSpecs(pipeline.id);
      commandForm.resetFields();
      commandForm.setFieldsValue(getDefaultTriggerParameters(specs));
      setCommandModalPipelineId(pipeline.id);
    },
    [commandForm]
  );

  const closeCommandModal = useCallback(() => {
    setCommandModalPipelineId(null);
    commandForm.resetFields();
  }, [commandForm]);

  return {
    triggerModalPipeline,
    triggerForm,
    triggerModalSpecs,
    batchTriggerModalPipelineIds,
    batchTriggerForm,
    batchTriggerModalPipelines,
    batchTriggerModalSpecs,
    batchTriggerPayloadPreview,
    batchTriggerExecutionPreview,
    commandModalPipeline,
    commandForm,
    commandModalSpecs,
    commandModalCommandPreview,
    openTriggerModal,
    closeTriggerModal,
    openBatchTriggerModal,
    closeBatchTriggerModal,
    openCommandModal,
    closeCommandModal,
  };
}
