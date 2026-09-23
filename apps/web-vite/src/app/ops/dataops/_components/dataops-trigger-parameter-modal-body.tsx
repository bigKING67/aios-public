'use client';

import { Alert, Form } from 'antd';
import type { FormInstance } from 'antd';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import { DataOpsTriggerParameterFormItems } from './dataops-trigger-parameter-form-items';
import styles from './dataops-hub.module.css';

interface DataOpsTriggerParameterModalBodyProps {
  form: FormInstance;
  specs: DataOpsTriggerParameterSpec[];
}

export function DataOpsTriggerParameterModalBody({
  form,
  specs,
}: DataOpsTriggerParameterModalBodyProps) {
  const deliveryMode = Form.useWatch('delivery_mode', form);

  if (!specs.length) {
    return (
      <Alert
        type="info"
        showIcon
        title="该任务暂无可配置参数"
        description="点击“确认触发”将按 Deployment 默认参数执行。"
      />
    );
  }

  const describedSpecs = specs.filter((spec) => spec.description);
  const hasProductionDeliveryContract = specs.some(
    (spec) => spec.key === 'production_confirmed'
  );
  const isProductionMode = deliveryMode === 'production';

  return (
    <Form form={form} layout="vertical" preserve={false}>
      {hasProductionDeliveryContract ? (
        <Alert
          type={isProductionMode ? 'warning' : 'info'}
          showIcon
          title={isProductionMode ? '正式投递会发送到运营群' : '默认仅生成预览，不发送消息'}
          description={
            isProductionMode
              ? '请核对简报日期，并单独开启“确认正式投递”；后端会再次校验数据完整性和日期去重账本。'
              : '如需测试请选“测试群发送”；正式补发必须切换模式并单独确认。'
          }
          className={styles.batchTriggerSummaryAlert}
        />
      ) : null}
      <DataOpsTriggerParameterFormItems specs={specs} />

      {describedSpecs.length ? (
        <div className={styles.parameterHelpList}>
          {describedSpecs.map((spec) => (
            <p key={`${spec.key}-desc`}>{spec.label}：{spec.description}</p>
          ))}
        </div>
      ) : null}
    </Form>
  );
}
