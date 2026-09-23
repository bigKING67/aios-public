'use client';

import { Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import {
  DATAOPS_ALERT_MESSAGE_MAX_LENGTH,
  type AlertSendModalCopy,
} from './dataops-alert-helpers';
import type { BatchHistoryAlertSendFormValues } from './dataops-batch-helpers';
import styles from './dataops-hub.module.css';

interface DataOpsAlertSendModalBodyProps {
  form: FormInstance<BatchHistoryAlertSendFormValues>;
  channels: DataOpsNotificationChannel[];
  copy: AlertSendModalCopy;
}

export function DataOpsAlertSendModalBody({
  form,
  channels,
  copy,
}: DataOpsAlertSendModalBodyProps) {
  return (
    <>
      <Form form={form} layout="vertical" preserve={false} className={styles.alertSendForm}>
        <Form.Item
          name="channelId"
          label="通知通道"
          rules={[{ required: true, message: '请选择通知通道' }]}
        >
          <Select
            options={channels.map((channel) => ({
              label: `${channel.channelName}（${channel.provider}）`,
              value: channel.id,
            }))}
            placeholder="请选择通道"
          />
        </Form.Item>
        <Form.Item
          name="messageTitle"
          label="通知标题"
          rules={[
            { required: true, message: '请输入通知标题' },
            { max: 120, message: '标题最多 120 字符' },
          ]}
        >
          <Input placeholder={copy.messageTitlePlaceholder} maxLength={120} />
        </Form.Item>
        <Form.Item
          name="messageText"
          label="通知内容"
          rules={[
            { required: true, message: '请输入通知内容' },
            {
              max: DATAOPS_ALERT_MESSAGE_MAX_LENGTH,
              message: `内容最多 ${DATAOPS_ALERT_MESSAGE_MAX_LENGTH} 字符`,
            },
          ]}
        >
          <Input.TextArea
            rows={10}
            showCount
            maxLength={DATAOPS_ALERT_MESSAGE_MAX_LENGTH}
            placeholder={copy.messageTextPlaceholder}
          />
        </Form.Item>
      </Form>
      <p className={styles.alertSendHint}>{copy.hint}</p>
    </>
  );
}
