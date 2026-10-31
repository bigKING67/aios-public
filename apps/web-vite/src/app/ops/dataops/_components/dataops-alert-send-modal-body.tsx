'use client';

import { Input, TextArea } from '@lobehub/ui';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import { FormField } from '@/components/molecules/form-field';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { bindTextField } from '@/hooks/use-controlled-form';
import {
  DATAOPS_ALERT_MESSAGE_MAX_LENGTH,
  type AlertSendModalCopy,
} from './dataops-alert-helpers';
import { DATAOPS_ALERT_TITLE_MAX_LENGTH, type DataOpsAlertSendForm } from './dataops-alert-send-form';
import styles from './dataops-hub.module.css';

interface DataOpsAlertSendModalBodyProps {
  form: DataOpsAlertSendForm;
  channels: DataOpsNotificationChannel[];
  copy: AlertSendModalCopy;
}

export function DataOpsAlertSendModalBody({
  form,
  channels,
  copy,
}: DataOpsAlertSendModalBodyProps) {
  const messageTextLength = form.values.messageText?.length ?? 0;
  return (
    <>
      <div className={styles.alertSendForm}>
        <FormField form={form} name="channelId" label="通知通道" required>
          <LabeledSelect<string>
            id={form.fieldId('channelId')}
            value={form.values.channelId || undefined}
            onChange={(value) => form.change('channelId', value ?? '')}
            options={channels.map((channel) => ({
              label: `${channel.channelName}（${channel.provider}）`,
              value: channel.id,
            }))}
            placeholder="请选择通道"
          />
        </FormField>
        <FormField form={form} name="messageTitle" label="通知标题" required>
          <Input
            {...bindTextField(form, 'messageTitle')}
            placeholder={copy.messageTitlePlaceholder}
            maxLength={DATAOPS_ALERT_TITLE_MAX_LENGTH}
          />
        </FormField>
        <FormField
          form={form}
          name="messageText"
          label="通知内容"
          required
          extra={`${messageTextLength} / ${DATAOPS_ALERT_MESSAGE_MAX_LENGTH}`}
        >
          <TextArea
            {...bindTextField(form, 'messageText')}
            rows={10}
            maxLength={DATAOPS_ALERT_MESSAGE_MAX_LENGTH}
            placeholder={copy.messageTextPlaceholder}
          />
        </FormField>
      </div>
      <p className={styles.alertSendHint}>{copy.hint}</p>
    </>
  );
}
