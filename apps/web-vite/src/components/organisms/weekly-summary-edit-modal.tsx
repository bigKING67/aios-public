'use client';

import { useId, type Dispatch, type SetStateAction } from 'react';
import { Alert, Modal, TextArea } from '@lobehub/ui';
import { Save } from 'lucide-react';
import styles from './weekly-summary-card-modern.module.css';

export interface WeeklySummaryEditModalProps {
  open: boolean;
  confirmLoading: boolean;
  editOverall: string;
  editHighlightsText: string;
  editRisksText: string;
  errorText: string | null;
  onCancel: () => void;
  onSave: () => void;
  setEditOverall: Dispatch<SetStateAction<string>>;
  setEditHighlightsText: Dispatch<SetStateAction<string>>;
  setEditRisksText: Dispatch<SetStateAction<string>>;
}

export function WeeklySummaryEditModal({
  open,
  confirmLoading,
  editOverall,
  editHighlightsText,
  editRisksText,
  errorText,
  onCancel,
  onSave,
  setEditOverall,
  setEditHighlightsText,
  setEditRisksText,
}: WeeklySummaryEditModalProps) {
  const fieldIdPrefix = useId();
  const overallId = `${fieldIdPrefix}-overall`;
  const highlightsId = `${fieldIdPrefix}-highlights`;
  const risksId = `${fieldIdPrefix}-risks`;

  return (
    <Modal
      title="手动编辑周报总结"
      open={open}
      onCancel={onCancel}
      onOk={onSave}
      okText="保存总结"
      cancelText="取消"
      confirmLoading={confirmLoading}
      okButtonProps={{
        icon: <Save size={14} strokeWidth={1.8} aria-hidden="true" />,
      }}
    >
      <div className={styles.editModalStack}>
        <Alert
          type="info"
          showIcon
          title="提交后会写入数据库，并覆盖当前 scope 的最新总结。"
        />
        <div>
          <label htmlFor={overallId} className={styles.editFieldLabel}>
            总体概况
          </label>
          <TextArea
            id={overallId}
            rows={4}
            value={editOverall}
            onChange={(event) => setEditOverall(event.target.value)}
            placeholder="输入总体概况"
          />
        </div>
        <div>
          <label htmlFor={highlightsId} className={styles.editFieldLabel}>
            业务亮点（每行一条）
          </label>
          <TextArea
            id={highlightsId}
            rows={5}
            value={editHighlightsText}
            onChange={(event) => setEditHighlightsText(event.target.value)}
            placeholder={'亮点 1\n亮点 2\n亮点 3'}
          />
        </div>
        <div>
          <label htmlFor={risksId} className={styles.editFieldLabel}>
            潜在风险（每行一条）
          </label>
          <TextArea
            id={risksId}
            rows={5}
            value={editRisksText}
            onChange={(event) => setEditRisksText(event.target.value)}
            placeholder={'风险 1\n风险 2'}
          />
        </div>
        {errorText ? (
          <Alert type="error" showIcon title={errorText} />
        ) : null}
      </div>
    </Modal>
  );
}
