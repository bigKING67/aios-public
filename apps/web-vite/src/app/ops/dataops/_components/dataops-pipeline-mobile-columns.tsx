'use client';

import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { DataOpsActionRequest, DataOpsRuntimePipeline } from '@/types/dataops';
import { DataOpsStatusTag } from './dataops-status-tag';
import {
  DOMAIN_TAG_COLOR,
  formatDateTime,
} from './dataops-hub-formatters';
import { getActionKey } from './dataops-action-helpers';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsPipelineMobileColumnsOptions {
  actionPending: boolean;
  activeActionKey: string | null;
  globalActionBusy: boolean;
  hasOperatePermission: boolean;
  onPipelineAction: (
    pipeline: DataOpsRuntimePipeline,
    action: DataOpsActionRequest['action']
  ) => void;
  onOpenCommandModal: (pipeline: DataOpsRuntimePipeline) => void;
  onOpenTriggerModal: (pipeline: DataOpsRuntimePipeline) => void;
}

export function buildDataOpsPipelineMobileColumns({
  actionPending,
  activeActionKey,
  globalActionBusy,
  hasOperatePermission,
  onPipelineAction,
  onOpenCommandModal,
  onOpenTriggerModal,
}: DataOpsPipelineMobileColumnsOptions): ColumnsType<DataOpsRuntimePipeline> {
  return [
    {
      title: '任务编排',
      key: 'mobile',
      render: (_value, record) => {
        const hasDeployment = Boolean(record.runtime?.deploymentId);
        const toggleAction: DataOpsActionRequest['action'] =
          record.runtime?.deploymentPaused ? 'resume_deployment' : 'pause_deployment';

        const triggerKey = getActionKey('trigger_pipeline', record.id);
        const toggleKey = getActionKey(toggleAction, record.id);

        const isTriggerLoading = actionPending && activeActionKey === triggerKey;
        const isToggleLoading = actionPending && activeActionKey === toggleKey;
        const shouldDisableAction = !hasDeployment || globalActionBusy || !hasOperatePermission;

        return (
          <div className="space-y-2 py-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-text-primary">{record.name}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <Tag color={DOMAIN_TAG_COLOR[record.domain]}>{record.domain}</Tag>
                <DataOpsStatusTag status={record.status} />
              </div>
            </div>
            <div className={pipelineStyles.pipelineTextCell}>
              <p>
                <span>Flow：</span>
                {record.flowName}
              </p>
              <p>
                <span>Deployment：</span>
                {record.deploymentName}
              </p>
              <p>
                <span>Cron：</span>
                {record.cron} ({record.timezone})
              </p>
              <p>
                <span>最近执行：</span>
                {formatDateTime(record.runtime?.flowRunAt || record.lastRunAt)}
              </p>
              <p>
                <span>最近成功：</span>
                {formatDateTime(record.lastSuccessAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                icon={<PlayCircleOutlined />}
                loading={isTriggerLoading}
                disabled={shouldDisableAction}
                onClick={() => onPipelineAction(record, 'trigger_pipeline')}
              >
                立即运行
              </Button>
              <Button
                size="small"
                icon={<PauseCircleOutlined />}
                loading={isToggleLoading}
                disabled={shouldDisableAction}
                onClick={() => onPipelineAction(record, toggleAction)}
              >
                {record.runtime?.deploymentPaused ? '恢复调度' : '暂停调度'}
              </Button>
              <Button
                size="small"
                disabled={shouldDisableAction}
                onClick={() => onOpenTriggerModal(record)}
              >
                参数触发
              </Button>
              <Button
                size="small"
                onClick={() => onOpenCommandModal(record)}
              >
                Linux命令
              </Button>
            </div>
          </div>
        );
      },
    },
  ];
}
