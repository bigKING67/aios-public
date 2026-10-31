import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATAOPS_OPS_PIPELINES } from '@/config/dataops-hub-ops-pipelines';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import { useDataOpsAlertSendForm } from './dataops-alert-send-form';
import { DataOpsAlertSendModalBody } from './dataops-alert-send-modal-body';
import { executeDataOpsBatchOperation } from './dataops-batch-operation-executor';
import { DATAOPS_MODAL_API } from './dataops-feedback-types';
import { DataOpsHubOverview, type DataOpsHubOverviewProps } from './dataops-hub-overview';
import { DataOpsOrchestrationDetail } from './dataops-orchestration-detail';
import { buildDataOpsPipelineColumns } from './dataops-pipeline-columns';
import { DataOpsPipelineExpandedRow } from './dataops-pipeline-expanded-row';

afterEach(() => cleanup());

const PIPELINES: DataOpsRuntimePipeline[] = DATAOPS_OPS_PIPELINES.slice(0, 3).map((pipeline) => ({
  ...pipeline,
  runtime: { deploymentId: `deployment-${pipeline.id}`, deploymentStatus: 'READY' },
}));

const ALERT_CHANNEL = {
  id: 'ops-duty',
  channelName: '值班群',
  provider: 'feishu',
} as DataOpsNotificationChannel;

function AlertSendFormHarness() {
  const form = useDataOpsAlertSendForm();
  const [validation, setValidation] = useState('idle');
  return (
    <>
      <DataOpsAlertSendModalBody
        form={form}
        channels={[ALERT_CHANNEL]}
        copy={{
          title: '发送告警',
          messageTitlePlaceholder: '告警标题',
          messageTextPlaceholder: '告警内容',
          hint: '发送前请确认通道',
        }}
      />
      <button
        type="button"
        onClick={() => {
          void form.validateFields().then(
            () => setValidation('valid'),
            () => setValidation('invalid')
          );
        }}
      >
        校验
      </button>
      <span>{validation}</span>
    </>
  );
}

const OVERVIEW_PROPS: DataOpsHubOverviewProps = {
  englishName: 'DataOps',
  pageName: '数据运维中心',
  metrics: {
    totalPipelines: 3,
    healthyPipelines: 3,
    warningPipelines: 0,
    errorPipelines: 0,
    pausedPipelines: 0,
    avgLagMinutes: 1,
    notificationFailureCount24h: 0,
    healthyRate: 100,
  },
  metricStatusItems: [],
  snapshotAt: '2026-10-24 09:00',
  runtimeStorageModeLabel: 'Postgres',
  runtimeLockModeLabel: 'Postgres 行锁表',
  hasOperatePermission: true,
  hasImportantRisk: false,
  defaultAlertChannelName: '值班群',
  keywordInput: '',
  onKeywordInputChange: () => undefined,
  statusFilter: 'all',
  onStatusFilterChange: () => undefined,
  runtimeFetching: false,
  onRefreshRuntime: () => undefined,
  onOpenRuntimeDetails: () => undefined,
  systemNoticeCount: 1,
  runtimeErrorMessage: 'Prefect API 超时',
  runtimeWarnings: [],
  tabItems: [{ key: 'orchestration', label: '任务编排' }],
  activeTab: 'orchestration',
  onTabChange: () => undefined,
  statusFilterLabel: '全部',
  keywordFilterText: '-',
  filteredPipelineCount: 3,
};

describe('DataOps lobe-ui controls', () => {
  it('validates the alert send form with the original rules and messages', async () => {
    const user = userEvent.setup();
    render(<AlertSendFormHarness />);

    await user.click(screen.getByRole('button', { name: '校验' }));
    expect(await screen.findByText('请选择通知通道')).toBeInTheDocument();
    expect(screen.getByText('请输入通知标题')).toBeInTheDocument();
    expect(screen.getByText('请输入通知内容')).toBeInTheDocument();
    expect(screen.getByText('invalid')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: '通知通道' }));
    await user.click(await screen.findByRole('option', { name: '值班群（feishu）' }));
    await user.type(screen.getByRole('textbox', { name: '通知标题' }), '同步失败');
    await user.type(screen.getByRole('textbox', { name: '通知内容' }), 'hello');
    expect(screen.getByText('5 / 6000')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '校验' }));
    await waitFor(() => expect(screen.getByText('valid')).toBeInTheDocument());
  });

  it('filters the overview by status through a named select', async () => {
    const user = userEvent.setup();
    const onStatusFilterChange = vi.fn();
    render(<DataOpsHubOverview {...OVERVIEW_PROPS} onStatusFilterChange={onStatusFilterChange} />);

    const statusSelect = screen.getByRole('combobox', { name: '任务状态' });
    expect(statusSelect).toHaveTextContent('全部状态');
    await user.click(statusSelect);
    await user.click(await screen.findByRole('option', { name: '异常' }));
    expect(onStatusFilterChange).toHaveBeenCalledWith('error');
    expect(screen.getByText('运行态接口请求失败')).toBeInTheDocument();
  });

  it('keeps row actions, selection and expansion on the pipeline table', async () => {
    const user = userEvent.setup();
    const onSelectedPipelineIdsChange = vi.fn();
    const onPipelineAction = vi.fn();
    const columns = buildDataOpsPipelineColumns({
      actionPending: false,
      activeActionKey: null,
      globalActionBusy: false,
      hasOperatePermission: true,
      onPipelineAction,
      onOpenCommandModal: vi.fn(),
      onOpenTriggerModal: vi.fn(),
    });
    render(
      <DataOpsOrchestrationDetail
        filteredPipelines={PIPELINES}
        selectedPipelineIds={[]}
        lastBatchExecutionSummary={null}
        lastBatchFailureContext={null}
        retryableFailedCount={0}
        statusFilterLabel="全部"
        keywordFilterText="-"
        hasPipelineFilter={false}
        hasOperatePermission
        globalActionBusy={false}
        batchActionKey={null}
        batchExecutionHistoryCount={0}
        columns={columns}
        isCompactViewport={false}
        renderExpandedRow={(record) => <DataOpsPipelineExpandedRow record={record} />}
        renderPaginationTotal={(total) => `共 ${total} 个任务`}
        onSelectExecutable={vi.fn()}
        onClearSelected={vi.fn()}
        onBatchOperation={vi.fn()}
        onOpenBatchTrigger={vi.fn()}
        onRetryFailed={vi.fn()}
        onRetryRetryableFailed={vi.fn()}
        onOpenBatchResult={vi.fn()}
        onOpenBatchHistory={vi.fn()}
        onClearFilters={vi.fn()}
        onSelectedPipelineIdsChange={onSelectedPipelineIdsChange}
      />
    );

    const runButtons = screen.getAllByRole('button', { name: /立即运行/ });
    expect(runButtons).toHaveLength(PIPELINES.length);
    await user.click(runButtons[0]);
    expect(onPipelineAction).toHaveBeenCalledWith(PIPELINES[0], 'trigger_pipeline');

    // The first checkbox is select-all; the next one is the first row.
    await user.click(screen.getAllByRole('checkbox')[1]);
    expect(onSelectedPipelineIdsChange).toHaveBeenCalledWith([PIPELINES[0].id]);

    const [expandButton] = screen.getAllByRole('button', { expanded: false });
    await user.click(expandButton);
    expect(await screen.findAllByText('Flow')).not.toHaveLength(0);
  });

  it('confirms batch operations through confirmModal and treats 取消 as no', async () => {
    const user = userEvent.setup();
    render(<div />);
    const message = { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() };
    const setBatchActionKey = vi.fn();

    const result = executeDataOpsBatchOperation({
      action: 'pause_deployment',
      label: '批量暂停',
      operationOptions: {},
      hasOperatePermission: true,
      message: message as never,
      modal: DATAOPS_MODAL_API,
      persistBatchExecutionHistory: vi.fn(),
      pipelineMap: new Map(PIPELINES.map((pipeline) => [pipeline.id, pipeline])),
      refetchRuntime: vi.fn(),
      selectedPipelines: PIPELINES,
      setBatchActionKey,
      setLastBatchExecutionSummary: vi.fn(),
      setLastBatchFailureContext: vi.fn(),
    });

    const dialog = await screen.findByRole('dialog', { name: '批量暂停确认' });
    expect(within(dialog).getByText(`即将对 ${PIPELINES.length} 个任务执行「批量暂停」，是否继续？`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认执行' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    await expect(result).resolves.toBe(false);
    expect(setBatchActionKey).not.toHaveBeenCalled();
  });
});
