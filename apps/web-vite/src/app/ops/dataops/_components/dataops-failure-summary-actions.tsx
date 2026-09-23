'use client';

import { Button, Tooltip } from 'antd';
import { BellOutlined, CopyOutlined } from '@ant-design/icons';

interface DataOpsFailureSummaryReportAction {
  tooltipTitle: string;
  sendDisabled: boolean;
  onSend: () => void;
  label: string;
}

interface DataOpsFailureSummaryActionsProps {
  summaryText: string;
  summaryCopyLabel: string;
  alertTemplateText: string;
  alertTemplateCopyLabel: string;
  alertTemplateCopyDisabled: boolean;
  alertTooltipTitle: string;
  alertSendDisabled: boolean;
  onCopy: (text: string, label: string) => Promise<void>;
  onSendAlertTemplate: () => void;
  reportAction?: DataOpsFailureSummaryReportAction;
}

export function DataOpsFailureSummaryActions({
  summaryText,
  summaryCopyLabel,
  alertTemplateText,
  alertTemplateCopyLabel,
  alertTemplateCopyDisabled,
  alertTooltipTitle,
  alertSendDisabled,
  onCopy,
  onSendAlertTemplate,
  reportAction,
}: DataOpsFailureSummaryActionsProps) {
  return (
    <>
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={() => {
          void onCopy(summaryText, summaryCopyLabel);
        }}
      >
        复制摘要
      </Button>
      <Button
        size="small"
        icon={<CopyOutlined />}
        disabled={alertTemplateCopyDisabled}
        onClick={() => {
          void onCopy(alertTemplateText, alertTemplateCopyLabel);
        }}
      >
        复制告警模板
      </Button>
      <Tooltip title={alertTooltipTitle}>
        <Button
          size="small"
          icon={<BellOutlined />}
          disabled={alertSendDisabled}
          onClick={onSendAlertTemplate}
        >
          发送告警模板
        </Button>
      </Tooltip>
      {reportAction ? (
        <Tooltip title={reportAction.tooltipTitle}>
          <Button
            size="small"
            icon={<BellOutlined />}
            disabled={reportAction.sendDisabled}
            onClick={reportAction.onSend}
          >
            {reportAction.label}
          </Button>
        </Tooltip>
      ) : null}
    </>
  );
}
