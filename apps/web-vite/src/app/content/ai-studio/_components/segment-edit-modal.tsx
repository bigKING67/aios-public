import { Input, Modal, Select } from 'antd';
import { useEffect, useId, useState } from 'react';
import type { StudioContentSegment, StudioSegmentPreset, StudioUpdateContentSegmentRequest } from '../_lib/ai-studio-api';
import { isSellingPointPreset } from '../_lib/segment-display';
import { buildSegmentPatch, type SegmentDraftErrors, validateSegmentDraft } from '../_lib/segment-form';
import { formatSegmentTime } from '../_lib/segment-time';
import { ContinuesPreviousField } from './segment-create-form';
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
  const [labelKeys, setLabelKeys] = useState<string[]>([]);
  const labelKey = labelKeys[0] ?? '';
  const [productName, setProductName] = useState('');
  const [continuesPrevious, setContinuesPrevious] = useState(false);
  const sellingPoint = isSellingPointPreset(preset);
  const [errors, setErrors] = useState<SegmentDraftErrors>({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!segment) return;
    setStartText(formatSegmentTime(segment.startMs));
    setEndText(formatSegmentTime(segment.endMs));
    setLabelKeys([segment.labelKey, ...(segment.labelKeys ?? []).filter((key) => key !== segment.labelKey)]);
    setProductName(segment.productName ?? '');
    setContinuesPrevious(segment.continuesPrevious);
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
    const patch = buildSegmentPatch(segment, {
      startMs: result.startMs,
      endMs: result.endMs,
      labelKey,
      labelKeys: sellingPoint ? labelKeys : undefined,
      productName,
      continuesPrevious: sellingPoint ? continuesPrevious : undefined,
    });
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
            mode={sellingPoint ? 'multiple' : undefined}
            value={sellingPoint ? labelKeys : labelKey || undefined}
            options={(preset?.labels ?? []).map((label) => ({ value: label.key, label: label.name }))}
            onChange={(next: string | string[]) => setLabelKeys(Array.isArray(next) ? next : [next])}
          />
          <p className={errors.label ? styles.fieldError : styles.fieldHelp}>
            {errors.label ?? (preset?.labels.filter((label) => labelKeys.includes(label.key)).map((label) => label.definition).join('；') || (sellingPoint ? '选择这段完整内容实际表达的全部卖点。' : ''))}
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
        {sellingPoint ? <ContinuesPreviousField checked={continuesPrevious} onChange={setContinuesPrevious} /> : null}
        {notice ? <p className={styles.fieldHelp} role="status">{notice}</p> : null}
      </div>
    </Modal>
  );
}
