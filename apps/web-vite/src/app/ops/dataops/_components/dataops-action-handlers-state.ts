import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';

import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import type {
  DataOpsActionRequest,
  DataOpsRuntimeFeishuSyncJob,
  DataOpsRuntimePipeline,
} from '@/types/dataops';
import {
  openDataOpsChannelManualNotifyDraft,
  openDataOpsNotificationEventRetryDraft,
  openDataOpsNotificationFailureSummaryAlertDraft,
  openDataOpsNotificationMarkdownAlertDraft,
} from './dataops-alert-draft-helpers';
import {
  exportDataOpsNotificationRetryReportCsv,
} from './dataops-feedback-actions';
import {
  getActionKey,
} from './dataops-action-helpers';
import { copyDataOpsNotifyShareUrl } from './dataops-notify-share-helpers';
import type { DataOpsNotifyFilterState } from './dataops-query-helpers';
import type { NotificationRetryReport } from './dataops-notification-retry-helpers';

type ExecuteDataOpsAction = (
  payload: DataOpsActionRequest,
  actionKey: string
) => Promise<boolean>;
type OpenAlertDraft = Parameters<typeof openDataOpsChannelManualNotifyDraft>[1]['openDraft'];
type ExportDataOpsCsv = Parameters<typeof exportDataOpsNotificationRetryReportCsv>[0]['exportCsv'];

export function useDataOpsActionHandlersState(options: {
  availableAlertChannels: DataOpsNotificationChannel[];
  copyRetryGroupTraceLinkAction: (options: {
    currentSearchParams: URLSearchParams;
    pathname: string;
  }) => Promise<void>;
  copyText: (text: string, label: string) => Promise<void>;
  currentNotifyShareFilters: DataOpsNotifyFilterState;
  defaultAlertChannelId: string | undefined;
  executeAction: ExecuteDataOpsAction;
  exportCsv: ExportDataOpsCsv;
  hasOperatePermission: boolean;
  message: MessageInstance;
  modal: Pick<ModalStaticFunctions, 'confirm'>;
  notificationChannelMap: Map<string, DataOpsNotificationChannel>;
  notificationFailureAlertTemplateText: string;
  notificationMarkdownText: string;
  notificationRetryReport: NotificationRetryReport | null;
  openAlertDraft: OpenAlertDraft;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  const {
    availableAlertChannels,
    copyRetryGroupTraceLinkAction,
    copyText,
    currentNotifyShareFilters,
    defaultAlertChannelId,
    executeAction,
    exportCsv,
    hasOperatePermission,
    message,
    modal,
    notificationChannelMap,
    notificationFailureAlertTemplateText,
    notificationMarkdownText,
    notificationRetryReport,
    openAlertDraft,
    pathname,
    searchParams,
  } = options;

  const handlePipelineAction = useCallback(
    (pipeline: DataOpsRuntimePipeline, action: DataOpsActionRequest['action']) => {
      if (!hasOperatePermission) {
        message.warning('当前账号仅有查看权限，无法执行该操作。');
        return;
      }

      if (action === 'pause_deployment' || action === 'resume_deployment') {
        modal.confirm({
          title: action === 'pause_deployment' ? `确认暂停「${pipeline.name}」调度？` : `确认恢复「${pipeline.name}」调度？`,
          content:
            action === 'pause_deployment'
              ? '暂停后将停止自动调度，直到手动恢复。'
              : '恢复后将重新按 Cron 自动调度。',
          okText: '确认',
          cancelText: '取消',
          onOk: async () => {
            await executeAction(
              {
                action,
                pipelineId: pipeline.id,
              },
              getActionKey(action, pipeline.id)
            );
          },
        });
        return;
      }

      void executeAction(
        {
          action,
          pipelineId: pipeline.id,
        },
        getActionKey(action, pipeline.id)
      );
    },
    [executeAction, hasOperatePermission, message, modal]
  );

  const handleChannelWebhookTest = useCallback(
    (channel: DataOpsNotificationChannel) => {
      if (!hasOperatePermission) {
        message.warning('当前账号仅有查看权限，无法执行该操作。');
        return;
      }

      void executeAction(
        {
          action: 'test_channel_webhook',
          channelId: channel.id,
        },
        getActionKey('test_channel_webhook', channel.id)
      );
    },
    [executeAction, hasOperatePermission, message]
  );

  const handleFeishuSyncJobAction = useCallback(
    (job: DataOpsRuntimeFeishuSyncJob) => {
      if (!hasOperatePermission) {
        message.warning('当前账号仅有查看权限，无法执行该操作。');
        return;
      }

      void executeAction(
        {
          action: 'trigger_feishu_sync',
          parameters: {
            service_name: job.serviceName,
          },
        },
        getActionKey('trigger_feishu_sync', job.serviceName)
      );
    },
    [executeAction, hasOperatePermission, message]
  );

  const openChannelManualNotifyModal = useCallback(
    (channel: DataOpsNotificationChannel) => {
      openDataOpsChannelManualNotifyDraft({
        channel,
        hasOperatePermission,
      }, {
        warning: message.warning,
        openDraft: openAlertDraft,
      });
    },
    [hasOperatePermission, message, openAlertDraft]
  );
  const openNotificationEventRetryModal = useCallback(
    (event: DataOpsNotificationEvent) => {
      openDataOpsNotificationEventRetryDraft({
        event,
        availableChannels: availableAlertChannels,
        hasOperatePermission,
        notificationChannelMap,
      }, {
        warning: message.warning,
        openDraft: openAlertDraft,
      });
    },
    [availableAlertChannels, hasOperatePermission, message, notificationChannelMap, openAlertDraft]
  );
  const openNotifyMarkdownAlertModal = useCallback(() => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法发送通知。');
      return;
    }

    openDataOpsNotificationMarkdownAlertDraft({
      availableChannels: availableAlertChannels,
      defaultChannelId: defaultAlertChannelId,
      markdownText: notificationMarkdownText,
    }, {
      info: message.info,
      warning: message.warning,
      openDraft: openAlertDraft,
    });
  }, [
    availableAlertChannels,
    defaultAlertChannelId,
    hasOperatePermission,
    message,
    notificationMarkdownText,
    openAlertDraft,
  ]);
  const openNotifyFailureSummaryAlertModal = useCallback(() => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法发送通知。');
      return;
    }

    openDataOpsNotificationFailureSummaryAlertDraft({
      availableChannels: availableAlertChannels,
      defaultChannelId: defaultAlertChannelId,
      templateText: notificationFailureAlertTemplateText,
    }, {
      info: message.info,
      warning: message.warning,
      openDraft: openAlertDraft,
    });
  }, [
    availableAlertChannels,
    defaultAlertChannelId,
    hasOperatePermission,
    message,
    notificationFailureAlertTemplateText,
    openAlertDraft,
  ]);
  const exportNotificationRetryReportCsv = useCallback(async () => {
    await exportDataOpsNotificationRetryReportCsv({
      report: notificationRetryReport,
      exportCsv,
      info: message.info,
    });
  }, [exportCsv, message, notificationRetryReport]);
  const copyRetryGroupTraceLink = useCallback(async () => {
    await copyRetryGroupTraceLinkAction({
      currentSearchParams: searchParams,
      pathname,
    });
  }, [copyRetryGroupTraceLinkAction, pathname, searchParams]);

  const copyCurrentNotifyFilterLink = useCallback(async () => {
    await copyDataOpsNotifyShareUrl({
      currentSearchParams: searchParams,
      pathname,
      filters: currentNotifyShareFilters,
      copyText,
      label: '通知筛选链接',
    });
  }, [
    copyText,
    currentNotifyShareFilters,
    pathname,
    searchParams,
  ]);

  return {
    copyCurrentNotifyFilterLink,
    copyRetryGroupTraceLink,
    exportNotificationRetryReportCsv,
    handleChannelWebhookTest,
    handleFeishuSyncJobAction,
    handlePipelineAction,
    openChannelManualNotifyModal,
    openNotificationEventRetryModal,
    openNotifyFailureSummaryAlertModal,
    openNotifyMarkdownAlertModal,
  };
}
