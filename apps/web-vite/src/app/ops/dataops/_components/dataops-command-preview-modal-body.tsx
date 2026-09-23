'use client';

import { Form } from 'antd';
import type { FormInstance } from 'antd';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import type { DataOpsLinuxCommandPreview } from './dataops-trigger-helpers';
import { DataOpsCommandPreviewCard } from './dataops-command-preview-card';
import { DataOpsTriggerParameterFormItems } from './dataops-trigger-parameter-form-items';
import commandStyles from './dataops-command-modal.module.css';

interface DataOpsCommandPreviewModalBodyProps {
  form: FormInstance;
  specs: DataOpsTriggerParameterSpec[];
  commandPreview: DataOpsLinuxCommandPreview;
  onCopy: (text: string, label: string) => Promise<void>;
}

export function DataOpsCommandPreviewModalBody({
  form,
  specs,
  commandPreview,
  onCopy,
}: DataOpsCommandPreviewModalBodyProps) {
  return (
    <div className={commandStyles.commandModalBody}>
      {specs.length ? (
        <div className={commandStyles.commandCard}>
          <div className={commandStyles.commandCardHead}>
            <h4>参数设置（用于生成触发命令）</h4>
          </div>
          <Form
            form={form}
            layout="vertical"
            preserve={false}
            className={commandStyles.commandForm}
          >
            <DataOpsTriggerParameterFormItems specs={specs} itemKeyPrefix="command-" />
          </Form>
        </div>
      ) : null}

      <DataOpsCommandPreviewCard
        title="Deployment 配置"
        command={commandPreview.deployCommand}
        copyLabel="部署命令"
        onCopy={onCopy}
      />
      <DataOpsCommandPreviewCard
        title="手动触发（无参数）"
        command={commandPreview.runCommand}
        copyLabel="手动触发命令"
        onCopy={onCopy}
      />
      <DataOpsCommandPreviewCard
        title="手动触发（参数）"
        command={commandPreview.runWithParamsCommand}
        copyLabel="参数触发命令"
        onCopy={onCopy}
      />
    </div>
  );
}
