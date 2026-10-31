'use client';

import { Button, Tooltip } from '@lobehub/ui';
import { Bell, Copy } from 'lucide-react';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';

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
        icon={<Copy {...DATAOPS_ICON_PROPS} />}
        onClick={() => {
          void onCopy(summaryText, summaryCopyLabel);
        }}
      >
        复制摘要
      </Button>
      <Button
        size="small"
        icon={<Copy {...DATAOPS_ICON_PROPS} />}
        disabled={alertTemplateCopyDisabled}
        onClick={() => {
          void onCopy(alertTemplateText, alertTemplateCopyLabel);
        }}
      >
        复制告警模板
      </Button>
      <Tooltip title={alertTooltipTitle || undefined}>
        <span className="inline-flex">
          <Button
            size="small"
            icon={<Bell {...DATAOPS_ICON_PROPS} />}
            disabled={alertSendDisabled}
            onClick={onSendAlertTemplate}
          >
            发送告警模板
          </Button>
        </span>
      </Tooltip>
      {reportAction ? (
        <Tooltip title={reportAction.tooltipTitle || undefined}>
          <span className="inline-flex">
            <Button
              size="small"
              icon={<Bell {...DATAOPS_ICON_PROPS} />}
              disabled={reportAction.sendDisabled}
              onClick={reportAction.onSend}
            >
              {reportAction.label}
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </>
  );
}
