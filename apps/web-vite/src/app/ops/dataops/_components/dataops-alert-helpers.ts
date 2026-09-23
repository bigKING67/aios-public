import type { AlertSendModalSource } from './dataops-hub-formatters';

export const DATAOPS_ALERT_MESSAGE_MAX_LENGTH = 6000;

const DATAOPS_ALERT_TRUNCATE_HINT =
  '\n\n> 内容超过飞书发送上限，已自动截断，请按需编辑后发送。';

export interface PreparedDataOpsAlertMessage {
  messageText: string;
  wasTruncated: boolean;
}

export interface AlertSendModalCopy {
  title: string;
  messageTitlePlaceholder: string;
  messageTextPlaceholder: string;
  hint: string;
}

export function prepareDataOpsAlertMessage(
  text: string,
  maxLength = DATAOPS_ALERT_MESSAGE_MAX_LENGTH
): PreparedDataOpsAlertMessage {
  if (text.length <= maxLength) {
    return {
      messageText: text,
      wasTruncated: false,
    };
  }

  const maxBodyLength = Math.max(maxLength - DATAOPS_ALERT_TRUNCATE_HINT.length, 0);

  return {
    messageText: `${text.slice(0, maxBodyLength)}${DATAOPS_ALERT_TRUNCATE_HINT}`,
    wasTruncated: true,
  };
}

export function getAlertSendFallbackTitle(source: AlertSendModalSource): string {
  switch (source) {
    case 'batch_history':
      return '[DataOps Hub] 批量历史失败告警';
    case 'notify_event_retry':
      return '[DataOps Hub] 通知失败重发';
    case 'notify_markdown':
      return '[DataOps Hub] 通知筛选报告';
    case 'notify_failure_summary':
      return '[DataOps Hub] 通知失败告警';
    case 'notify_trace_slo_scan':
      return '[DataOps Hub] 通知链路SLO巡检摘要';
    case 'notify_channel':
      return '[DataOps Hub] 手动告警通知';
  }
}

export function getAlertSendActionKeySuffix(source: AlertSendModalSource): string {
  switch (source) {
    case 'batch_history':
      return 'batch-history-alert';
    case 'notify_event_retry':
      return 'notify-event-retry';
    case 'notify_markdown':
      return 'notify-markdown-report';
    case 'notify_failure_summary':
      return 'notify-failure-alert';
    case 'notify_trace_slo_scan':
      return 'notify-trace-slo-scan';
    case 'notify_channel':
      return 'manual-notify';
  }
}

export function getAlertSendModalCopy(source: AlertSendModalSource): AlertSendModalCopy {
  switch (source) {
    case 'batch_history':
      return {
        title: '发送失败告警模板',
        messageTitlePlaceholder: '例如：[DataOps Hub] 批量历史失败告警',
        messageTextPlaceholder: '支持多行文本，建议保留筛选条件与失败原因 Top 信息。',
        hint: '发送成功后会写入通知事件与运行审计，便于值班追踪。',
      };
    case 'notify_event_retry':
      return {
        title: '重发失败通知',
        messageTitlePlaceholder: '例如：[重发] xxx',
        messageTextPlaceholder: '可编辑重发内容，建议保留原始失败上下文。',
        hint: '重发成功后会记录新的通知事件，便于比对前后结果。',
      };
    case 'notify_markdown':
      return {
        title: '发送通知筛选报告',
        messageTitlePlaceholder: '例如：[DataOps Hub] 通知筛选报告',
        messageTextPlaceholder: '将发送当前通知筛选 Markdown 报告，可按需编辑后发送。',
        hint: '发送后会写入通知事件与运行审计，便于复盘当前筛选结果。',
      };
    case 'notify_failure_summary':
      return {
        title: '发送通知失败告警',
        messageTitlePlaceholder: '例如：[DataOps Hub] 通知失败告警',
        messageTextPlaceholder: '将发送当前通知失败告警模板，建议保留失败规模和Top原因。',
        hint: '发送后会写入通知事件与运行审计，便于跟踪通知链路健康状态。',
      };
    case 'notify_trace_slo_scan':
      return {
        title: '发送SLO巡检值班摘要',
        messageTitlePlaceholder: '例如：[DataOps Hub] 通知链路SLO巡检摘要',
        messageTextPlaceholder: '将发送当前通知链路SLO巡检值班摘要，建议保留风险排行与告警信息。',
        hint: '发送后会写入通知事件与运行审计，便于值班团队对高风险链路快速跟进。',
      };
    case 'notify_channel':
      return {
        title: '发送手动通知',
        messageTitlePlaceholder: '例如：[DataOps Hub] 手动通知',
        messageTextPlaceholder: '请输入要发送到飞书的通知内容，支持多行文本。',
        hint: '手动通知发送成功后同样会写入通知事件与运行审计。',
      };
  }
}
