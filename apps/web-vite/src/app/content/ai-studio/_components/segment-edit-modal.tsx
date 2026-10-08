import { Input, Modal, Select } from 'antd';
import { useEffect, useId, useState } from 'react';
import type { StudioContentSegment, StudioSegmentPreset, StudioUpdateContentSegmentRequest } from '../_lib/ai-studio-api';
import { buildSegmentPatch, type SegmentDraftErrors, validateSegmentDraft } from '../_lib/segment-form';
import { formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';

interface SegmentEditModalProps {
  segment: StudioContentSegment | null;
  preset: StudioSegmentPreset | undefined;
  durationMs: number | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (segment: StudioContentSegment, request: StudioUpdateContentSegmentRequest) => Promise<boolean>;
}

export function SegmentEditModal({ segment, preset, durationMs, busy, onCancel, onSubmit }: SegmentEditModalProps) {
  const id = useId();
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [labelKey, setLabelKey] = useState('');
  const [productName, setProductName] = useState('');
  const [errors, setErrors] = useState<SegmentDraftErrors>({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!segment) return;
    setStartText(formatSegmentTime(segment.startMs));
    setEndText(formatSegmentTime(segment.endMs));
    setLabelKey(segment.labelKey);
    setProductName(segment.productName ?? '');
    setErrors({});
    setNotice('');
  }, [segment]);

  const submit = async () => {
    if (!segment) return;
    const result = validateSegmentDraft({
      startText,
      endText,
      labelKey,
      durationMs,
      original: { startMs: segment.startMs, endMs: segment.endMs },
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const patch = buildSegmentPatch(segment, { startMs: result.startMs, endMs: result.endMs, labelKey, productName });
    if (!patch) {
      setNotice('没有需要保存的修改。');
      return;
    }
    if (await onSubmit(segment, patch)) onCancel();
  };

  return (
    <Modal
      open={segment !== null}
      title={segment ? `编辑片段 ${formatSegmentTime(segment.startMs)}–${formatSegmentTime(segment.endMs)}` : '编辑片段'}
      okText="保存"
      cancelText="取消"
      confirmLoading={busy}
      destroyOnHidden
      onOk={() => void submit()}
      onCancel={onCancel}
    >
      <div className={styles.modalBody}>
        {[
          { field: 'start' as const, label: '入点', value: startText, set: setStartText },
          { field: 'end' as const, label: '出点', value: endText, set: setEndText },
        ].map((item) => (
          <div className={styles.field} key={item.field}>
            <label htmlFor={`${id}-${item.field}`}>{item.label}</label>
            <Input
              id={`${id}-${item.field}`}
              value={item.value}
              status={errors[item.field] ? 'error' : undefined}
              aria-invalid={Boolean(errors[item.field])}
              aria-describedby={errors[item.field] ? `${id}-${item.field}-error` : undefined}
              inputMode="decimal"
              onChange={(event) => item.set(event.target.value)}
            />
            {errors[item.field] ? (
              <p id={`${id}-${item.field}-error`} className={styles.fieldError} role="alert">{errors[item.field]}</p>
            ) : null}
          </div>
        ))}
        <div className={styles.field}>
          <label htmlFor={`${id}-label`}>标签</label>
          <Select
            id={`${id}-label`}
            value={labelKey || undefined}
            options={(preset?.labels ?? []).map((label) => ({ value: label.key, label: label.name }))}
            onChange={(next: string) => setLabelKey(next)}
          />
          <p className={errors.label ? styles.fieldError : styles.fieldHelp}>
            {errors.label ?? preset?.labels.find((label) => label.key === labelKey)?.definition ?? ''}
          </p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-product`}>产品</label>
          <Input
            id={`${id}-product`}
            value={productName}
            maxLength={200}
            placeholder="清空后保存将移除产品"
            onChange={(event) => setProductName(event.target.value)}
          />
        </div>
        {notice ? <p className={styles.fieldHelp} role="status">{notice}</p> : null}
      </div>
    </Modal>
  );
}
