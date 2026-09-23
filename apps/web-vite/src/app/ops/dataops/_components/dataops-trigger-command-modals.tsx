'use client';

import { Alert, Button, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import { DataOpsBatchTriggerParameterModalBody } from './dataops-batch-trigger-parameter-modal-body';
import type { DataOpsBatchTriggerExecutionPreviewItem } from './dataops-batch-trigger-execution-preview';
import { DataOpsCommandPreviewModalBody } from './dataops-command-preview-modal-body';
import { DataOpsTriggerParameterModalBody } from './dataops-trigger-parameter-modal-body';
import type { DataOpsLinuxCommandPreview } from './dataops-trigger-helpers';

interface DataOpsTriggerCommandModalsProps {
  triggerPipeline: DataOpsRuntimePipeline | undefined;
  triggerForm: FormInstance;
  triggerSpecs: DataOpsTriggerParameterSpec[];
  triggerSubmitting: boolean;
  batchTriggerPipelineIds: string[] | null;
  batchTriggerForm: FormInstance;
  batchTriggerPipelines: DataOpsRuntimePipeline[];
  batchTriggerSpecs: DataOpsTriggerParameterSpec[];
  batchTriggerExecutionPreview: DataOpsBatchTriggerExecutionPreviewItem[];
  batchTriggerSubmitting: boolean;
  commandPipeline: DataOpsRuntimePipeline | undefined;
  commandForm: FormInstance;
  commandSpecs: DataOpsTriggerParameterSpec[];
  commandPreview: DataOpsLinuxCommandPreview;
  isCompactViewport: boolean;
  onCloseTrigger: () => void;
  onSubmitTrigger: () => void | Promise<void>;
  onCloseBatchTrigger: () => void;
  onSubmitBatchTrigger: () => void | Promise<void>;
  onCloseCommand: () => void;
  onCopy: (text: string, label: string) => Promise<void>;
}

export function DataOpsTriggerCommandModals({
  triggerPipeline,
  triggerForm,
  triggerSpecs,
  triggerSubmitting,
  batchTriggerPipelineIds,
  batchTriggerForm,
  batchTriggerPipelines,
  batchTriggerSpecs,
  batchTriggerExecutionPreview,
  batchTriggerSubmitting,
  commandPipeline,
  commandForm,
  commandSpecs,
  commandPreview,
  isCompactViewport,
  onCloseTrigger,
  onSubmitTrigger,
  onCloseBatchTrigger,
  onSubmitBatchTrigger,
  onCloseCommand,
  onCopy,
}: DataOpsTriggerCommandModalsProps) {
  return (
    <>
      <Modal
        title={triggerPipeline ? `参数触发 · ${triggerPipeline.name}` : '参数触发'}
        open={Boolean(triggerPipeline)}
        onCancel={onCloseTrigger}
        onOk={() => {
          void onSubmitTrigger();
        }}
        okText="确认触发"
        confirmLoading={triggerSubmitting}
        destroyOnHidden
      >
        <DataOpsTriggerParameterModalBody form={triggerForm} specs={triggerSpecs} />
      </Modal>

      <Modal
        title={
          batchTriggerPipelines.length
            ? `批量参数触发 · ${batchTriggerPipelines.length} 个任务`
            : '批量参数触发'
        }
        open={Boolean(batchTriggerPipelineIds)}
        onCancel={onCloseBatchTrigger}
        onOk={() => {
          void onSubmitBatchTrigger();
        }}
        okText="确认触发"
        confirmLoading={batchTriggerSubmitting}
        destroyOnHidden
      >
        <DataOpsBatchTriggerParameterModalBody
          form={batchTriggerForm}
          pipelines={batchTriggerPipelines}
          specs={batchTriggerSpecs}
          executionPreview={batchTriggerExecutionPreview}
        />
      </Modal>

      <Modal
        title={commandPipeline ? `Linux 命令 · ${commandPipeline.name}` : 'Linux 命令'}
        open={Boolean(commandPipeline)}
        onCancel={onCloseCommand}
        footer={[
          <Button key="close" onClick={onCloseCommand}>
            关闭
          </Button>,
        ]}
        width={isCompactViewport ? 'calc(100vw - 24px)' : 860}
        destroyOnHidden
      >
        {commandPipeline ? (
          <DataOpsCommandPreviewModalBody
            form={commandForm}
            specs={commandSpecs}
            commandPreview={commandPreview}
            onCopy={onCopy}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            title="未找到任务"
            description="请关闭弹窗后重新选择任务。"
          />
        )}
      </Modal>
    </>
  );
}
