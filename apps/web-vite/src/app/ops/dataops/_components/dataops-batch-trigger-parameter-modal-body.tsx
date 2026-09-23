'use client';

import { Alert, Form } from 'antd';
import type { FormInstance } from 'antd';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import {
  DataOpsBatchTriggerExecutionPreview,
  type DataOpsBatchTriggerExecutionPreviewItem,
} from './dataops-batch-trigger-execution-preview';
import { DataOpsTriggerParameterFormItems } from './dataops-trigger-parameter-form-items';
import styles from './dataops-hub.module.css';

interface DataOpsBatchTriggerParameterModalBodyProps {
  form: FormInstance;
  pipelines: DataOpsRuntimePipeline[];
  specs: DataOpsTriggerParameterSpec[];
  executionPreview: DataOpsBatchTriggerExecutionPreviewItem[];
}

export function DataOpsBatchTriggerParameterModalBody({
  form,
  pipelines,
  specs,
  executionPreview,
}: DataOpsBatchTriggerParameterModalBodyProps) {
  if (!pipelines.length) {
    return (
      <Alert
        type="warning"
        showIcon
        title="未找到可执行任务"
        description="请关闭弹窗后重新勾选任务。"
      />
    );
  }

  return (
    <>
      <Alert
        type="info"
        showIcon
        title={`将触发 ${pipelines.length} 个任务`}
        description={pipelines.map((item) => item.name).join(' / ')}
        className={styles.batchTriggerSummaryAlert}
      />
      {specs.length ? (
        <Form form={form} layout="vertical" preserve={false}>
          <DataOpsTriggerParameterFormItems specs={specs} itemKeyPrefix="batch-" />

          <div className={styles.parameterHelpList}>
            <p>仅展示所选任务“公共参数”。提交后会按同一参数值依次触发每个任务。</p>
          </div>
        </Form>
      ) : (
        <Alert
          type="warning"
          showIcon
          title="所选任务没有公共参数"
          description="点击“确认触发”将按各任务默认参数执行批量触发。"
        />
      )}
      <DataOpsBatchTriggerExecutionPreview items={executionPreview} />
    </>
  );
}
