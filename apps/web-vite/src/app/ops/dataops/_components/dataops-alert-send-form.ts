import {
  type ControlledForm,
  type ControlledFormRules,
  useControlledForm,
} from '@/hooks/use-controlled-form';
import { DATAOPS_ALERT_MESSAGE_MAX_LENGTH } from './dataops-alert-helpers';
import type { BatchHistoryAlertSendFormValues } from './dataops-batch-helpers';

export const DATAOPS_ALERT_TITLE_MAX_LENGTH = 120;

export type DataOpsAlertSendForm = ControlledForm<BatchHistoryAlertSendFormValues>;

const EMPTY_ALERT_SEND_FORM_VALUES: BatchHistoryAlertSendFormValues = {
  channelId: '',
  messageTitle: '',
  messageText: '',
};

/** The rules and messages the antd alert form used. */
const ALERT_SEND_FORM_RULES = {
  channelId: [{ required: true, message: '请选择通知通道' }],
  messageTitle: [
    { required: true, message: '请输入通知标题' },
    {
      validator: (value) => String(value).length <= DATAOPS_ALERT_TITLE_MAX_LENGTH,
      message: `标题最多 ${DATAOPS_ALERT_TITLE_MAX_LENGTH} 字符`,
    },
  ],
  messageText: [
    { required: true, message: '请输入通知内容' },
    {
      validator: (value) => String(value).length <= DATAOPS_ALERT_MESSAGE_MAX_LENGTH,
      message: `内容最多 ${DATAOPS_ALERT_MESSAGE_MAX_LENGTH} 字符`,
    },
  ],
} satisfies ControlledFormRules<BatchHistoryAlertSendFormValues>;

export function useDataOpsAlertSendForm(): DataOpsAlertSendForm {
  return useControlledForm<BatchHistoryAlertSendFormValues>({
    initialValues: EMPTY_ALERT_SEND_FORM_VALUES,
    rules: ALERT_SEND_FORM_RULES,
  });
}
