import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Form, Input, Modal, Popconfirm, Space, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import styles from './creator-library-follow-modal.module.css';
import {
  formatDateTimeText,
  formatOptionalText,
} from '../_lib/creator-library-formatters';
import type {
  CreatorLibraryFollowLogItem,
  CreatorLibraryFollowLogPayload,
  CreatorLibraryItem,
} from '../_lib/creator-library-types';

interface FollowValues {
  followNote?: string;
}

interface CreatorLibraryFollowModalProps {
  item: CreatorLibraryItem | null;
  open: boolean;
  logs: CreatorLibraryFollowLogItem[];
  loading?: boolean;
  loadErrorMessage?: string | null;
  saving?: boolean;
  deletingLogId?: number | null;
  onCreate: (payload: CreatorLibraryFollowLogPayload) => void;
  onUpdate: (logId: number, payload: CreatorLibraryFollowLogPayload) => void;
  onDelete: (logId: number, expectedUpdatedAt: string) => void;
  onCancel: () => void;
}

export function CreatorLibraryFollowModal({
  item,
  open,
  logs,
  loading,
  loadErrorMessage,
  saving,
  deletingLogId,
  onCreate,
  onUpdate,
  onDelete,
  onCancel,
}: CreatorLibraryFollowModalProps) {
  const [form] = Form.useForm<FollowValues>();
  const [editingLog, setEditingLog] = useState<CreatorLibraryFollowLogItem | null>(null);
  const canSubmitFollowLog = editingLog ? Boolean(editingLog.canEdit) : Boolean(item?.canEdit);
  const canShowFollowForm = Boolean(item?.canEdit || editingLog);
  const isMutating = Boolean(saving || deletingLogId);

  useEffect(() => {
    if (!open) {
      setEditingLog(null);
      form.resetFields();
      return;
    }

    form.setFieldsValue({
      followNote: editingLog?.followNote || undefined,
    });
  }, [editingLog, form, open]);

  useEffect(() => {
    if (!editingLog) {
      return;
    }

    const latestLog = logs.find((log) => log.id === editingLog.id);
    if (!latestLog) {
      setEditingLog(null);
      return;
    }
    if (latestLog !== editingLog) {
      setEditingLog(latestLog);
    }
  }, [editingLog, logs]);

  const columns: ColumnsType<CreatorLibraryFollowLogItem> = [
    {
      title: <span className={styles.followHistoryColumnTitle}>日期</span>,
      dataIndex: 'followedAt',
      key: 'followedAt',
      width: 168,
      align: 'center',
      render: (value?: string | null) => (
        <span className={styles.followLogDate}>{formatDateTimeText(value)}</span>
      ),
    },
    {
      title: <span className={styles.followHistoryColumnTitle}>跟进记录</span>,
      dataIndex: 'followNote',
      key: 'followNote',
      render: (value: string | null | undefined) => (
        <div className={styles.followLogNoteCell}>
          <span>{formatOptionalText(value)}</span>
        </div>
      ),
    },
    {
      title: <span className={styles.followHistoryColumnTitle}>操作</span>,
      key: 'actions',
      width: 128,
      align: 'center',
      render: (_, record) => (
        <Space size={4} wrap={false}>
          <Tooltip title={record.canEdit ? undefined : '当前记录无编辑权限'}>
            <Button
              size="small"
              type="link"
              disabled={!record.canEdit || isMutating}
              onClick={() => {
                setEditingLog(record);
                form.setFieldsValue({
                  followNote: record.followNote || undefined,
                });
              }}
            >
              编辑
            </Button>
          </Tooltip>
          <Tooltip title={record.canDelete ? undefined : '当前记录无删除权限'}>
            <Popconfirm
              title="删除跟进记录"
              description="删除后该条历史跟进不可恢复。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={!record.canDelete || isMutating}
              onConfirm={() => onDelete(record.id, record.updatedAt)}
            >
              <Button
                size="small"
                type="link"
                danger
                disabled={!record.canDelete || isMutating}
                loading={deletingLogId === record.id}
              >
                删除
              </Button>
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const handleSubmit = (values: FollowValues) => {
    if (!canSubmitFollowLog || isMutating) {
      return;
    }

    const note = values.followNote?.trim();
    if (!note) {
      return;
    }

    const payload = editingLog
      ? { follow_note: note, expected_updated_at: editingLog.updatedAt }
      : { follow_note: note };
    if (editingLog) {
      onUpdate(editingLog.id, payload);
      return;
    }
    onCreate(payload);
  };

  return (
    <Modal
      title={item ? `跟进历史：${item.influencerName}` : '跟进历史'}
      open={open}
      confirmLoading={saving}
      okText={editingLog ? '保存修改' : '新增记录'}
      cancelText="关闭"
      width={760}
      okButtonProps={{ disabled: !canSubmitFollowLog || isMutating }}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnHidden
    >
      <div className={styles.followModalStack}>
        {canShowFollowForm ? (
          <Form<FollowValues>
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="followNote"
              label={editingLog ? '编辑跟进记录' : '本次跟进备注'}
              rules={[{ required: true, message: '请输入本次跟进备注' }]}
            >
              <Input.TextArea
                rows={4}
                placeholder="记录本次沟通结论、报价、样品、内容限制等"
                showCount
                maxLength={1000}
                disabled={isMutating}
              />
            </Form.Item>
            {editingLog ? (
              <Button
                size="small"
                type="link"
                disabled={isMutating}
                onClick={() => setEditingLog(null)}
              >
                {item?.canEdit ? '退出编辑，新增一条跟进' : '退出编辑'}
              </Button>
            ) : null}
          </Form>
        ) : (
          <Alert
            showIcon
            type="info"
            message="当前达人无新增跟进权限"
            description="你仍可查看历史跟进记录；如需新增，请联系达人归属 BD 或管理员。"
          />
        )}

        <section className={styles.followHistorySection}>
          {loadErrorMessage ? (
            <Alert
              showIcon
              type="error"
              message="跟进历史加载失败"
              description={loadErrorMessage}
            />
          ) : null}
          <div className={styles.followHistoryHeader}>
            <h3>历史跟进</h3>
            <span>{logs.length ? `${logs.length} 条记录` : '无记录'}</span>
          </div>
          <Table<CreatorLibraryFollowLogItem>
            className={styles.followHistoryTable}
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={logs}
            loading={loading}
            pagination={false}
            locale={{
              emptyText: (
                <Empty
                  description="暂无历史跟进记录"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
          />
        </section>
      </div>
    </Modal>
  );
}
