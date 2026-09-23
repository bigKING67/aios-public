import { useEffect, useState } from 'react';
import { Form } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DATAOPS_OPS_PIPELINES } from '@/config/dataops-hub-ops-pipelines';
import { getDataOpsTriggerParameterSpecs } from '@/config/dataops-trigger-params';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import { executeDataOpsBatchOperation } from '@/app/ops/dataops/_components/dataops-batch-operation-executor';
import { DataOpsTriggerParameterModalBody } from '@/app/ops/dataops/_components/dataops-trigger-parameter-modal-body';
import {
  buildTriggerParametersPayload,
  getDefaultTriggerParameters,
} from '@/app/ops/dataops/_components/dataops-trigger-helpers';


const DAILY_BRIEF_SPECS = getDataOpsTriggerParameterSpecs('daily_business_brief');

afterEach(cleanup);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});


function TriggerFormHarness({ mode }: { mode: 'preview' | 'production' }) {
  const [form] = Form.useForm();
  const [validation, setValidation] = useState('idle');

  useEffect(() => {
    form.setFieldsValue({
      delivery_mode: mode,
      production_confirmed: false,
    });
  }, [form, mode]);

  return (
    <>
      <DataOpsTriggerParameterModalBody form={form} specs={DAILY_BRIEF_SPECS} />
      <button
        type="button"
        onClick={() => {
          void form
            .validateFields()
            .then(() => setValidation('valid'))
            .catch(() => setValidation('invalid'));
        }}
      >
        校验
      </button>
      <span>{validation}</span>
    </>
  );
}


function dailyBriefPipeline(): DataOpsRuntimePipeline {
  const pipeline = DATAOPS_OPS_PIPELINES.find(
    (item) => item.id === 'daily_business_brief'
  );
  if (!pipeline) {
    throw new Error('daily business brief pipeline fixture is missing');
  }
  return {
    ...pipeline,
    runtime: {
      deploymentId: 'fixture-deployment-id',
      deploymentStatus: 'READY',
    },
  };
}


describe('daily business brief DataOps trigger', () => {
  it('keeps preview as the default and exposes typed delivery options', () => {
    const defaults = getDefaultTriggerParameters(DAILY_BRIEF_SPECS);
    const deliveryMode = DAILY_BRIEF_SPECS.find((item) => item.key === 'delivery_mode');

    expect(defaults).toEqual({
      delivery_mode: 'preview',
      production_confirmed: false,
    });
    expect(deliveryMode?.options?.map((option) => option.value)).toEqual([
      'preview',
      'test',
      'production',
    ]);
    expect(buildTriggerParametersPayload(DAILY_BRIEF_SPECS, defaults)).toEqual(defaults);
  });

  it('marks the external-effect pipeline as ineligible for batch trigger', () => {
    const pipeline = dailyBriefPipeline();

    expect(pipeline.batchTriggerAllowed).toBe(false);
    expect(pipeline.status).toBe('healthy');
    expect(pipeline.cron).toBe('event:ads-overview-ready');
    expect(pipeline.timezone).toBe('Asia/Shanghai');
    expect(pipeline.note).toContain('ADS 五平台目标日总览就绪后');
  });

  it('renders the production warning and requires the separate confirmation switch', async () => {
    render(<TriggerFormHarness mode="production" />);

    expect(await screen.findByText('正式投递会发送到运营群')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('留空为上海时区昨日，或输入 2026-08-24')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '校验' }));

    expect(await screen.findByText('正式投递前必须开启确认开关')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('invalid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('switch', { name: '确认正式投递' }));
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    await waitFor(() => expect(screen.getByText('valid')).toBeInTheDocument());
  });

  it('rejects the pipeline before the built-in batch executor sends requests', async () => {
    const message = {
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    const persistBatchExecutionHistory = vi.fn();

    const result = await executeDataOpsBatchOperation({
      action: 'trigger_pipeline',
      label: '批量触发',
      operationOptions: { requireConfirm: false },
      hasOperatePermission: true,
      message: message as never,
      modal: { confirm: vi.fn() } as never,
      persistBatchExecutionHistory,
      pipelineMap: new Map([['daily_business_brief', dailyBriefPipeline()]]),
      refetchRuntime: vi.fn(),
      selectedPipelines: [dailyBriefPipeline()],
      setBatchActionKey: vi.fn(),
      setLastBatchExecutionSummary: vi.fn(),
      setLastBatchFailureContext: vi.fn(),
    });

    expect(result).toBe(false);
    expect(message.warning).toHaveBeenCalledWith(
      expect.stringContaining('不能批量触发')
    );
    expect(persistBatchExecutionHistory).not.toHaveBeenCalled();
  });
});
