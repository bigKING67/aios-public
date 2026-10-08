import { AimOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Select } from 'antd';
import { useEffect, useId, useState } from 'react';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { presetDisplayName } from '../_lib/segment-display';
import { type SegmentDraftErrors, validateSegmentDraft } from '../_lib/segment-form';
import { formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';

export interface SegmentCreateValues {
  startMs: number;
  endMs: number;
  labelKey: string;
  /** Undefined inherits the asset product on the server. */
  productName?: string;
  draft: boolean;
}

interface SegmentCreateFormProps {
  preset: StudioSegmentPreset;
  assetProductName: string | null;
  durationMs: number | null;
  busy: boolean;
  readCurrentMs: (() => number) | null;
  onSubmit: (values: SegmentCreateValues) => Promise<boolean>;
}

export function SegmentCreateForm({ preset, assetProductName, durationMs, busy, readCurrentMs, onSubmit }: SegmentCreateFormProps) {
  const id = useId();
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [labelKey, setLabelKey] = useState('');
  const [productName, setProductName] = useState(assetProductName ?? '');
  const [draft, setDraft] = useState(false);
  const [errors, setErrors] = useState<SegmentDraftErrors>({});

  useEffect(() => setProductName(assetProductName ?? ''), [assetProductName]);
  useEffect(() => setLabelKey(''), [preset.presetKey, preset.version]);

  const selectedLabel = preset.labels.find((label) => label.key === labelKey);

  const submit = async () => {
    const result = validateSegmentDraft({ startText, endText, labelKey, durationMs });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const trimmedProduct = productName.trim();
    const saved = await onSubmit({
      startMs: result.startMs,
      endMs: result.endMs,
      labelKey,
      productName: trimmedProduct && trimmedProduct !== (assetProductName ?? '') ? trimmedProduct : undefined,
      draft,
    });
    if (saved) {
      // Continue annotating from the previous out-point.
      setStartText(endText);
      setEndText('');
    }
  };

  const timeField = (
    field: 'start' | 'end',
    label: string,
    value: string,
    setValue: (next: string) => void,
  ) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${field}`}>{label}</label>
      <div className={styles.timeInputRow}>
        <Input
          id={`${id}-${field}`}
          value={value}
          placeholder="如 0:12.5"
          title="分:秒.十分之一秒"
          status={errors[field] ? 'error' : undefined}
          aria-invalid={Boolean(errors[field])}
          aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
          inputMode="decimal"
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          className={styles.touchButton}
          icon={<AimOutlined />}
          disabled={!readCurrentMs}
          onClick={() => readCurrentMs && setValue(formatSegmentTime(readCurrentMs()))}
        >
          取当前时间
        </Button>
      </div>
      {errors[field] ? <p id={`${id}-${field}-error`} className={styles.fieldError} role="alert">{errors[field]}</p> : null}
    </div>
  );

  return (
    <form
      className={styles.createForm}
      aria-label="新建片段"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className={styles.formGrid}>
        {timeField('start', '入点', startText, setStartText)}
        {timeField('end', '出点', endText, setEndText)}
        <div className={styles.field}>
          <label htmlFor={`${id}-label`}>标签</label>
          <Select
            id={`${id}-label`}
            value={labelKey || undefined}
            placeholder={`选择${presetDisplayName(preset)} 标签`}
            status={errors.label ? 'error' : undefined}
            options={preset.labels.map((label) => ({ value: label.key, label: label.name }))}
            onChange={(next: string) => setLabelKey(next)}
          />
          <p className={errors.label ? styles.fieldError : styles.fieldHelp}>
            {errors.label ?? selectedLabel?.definition ?? '选择后显示该标签的判定定义。'}
          </p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-product`}>产品</label>
          <Input
            id={`${id}-product`}
            value={productName}
            maxLength={200}
            placeholder="留空则继承原片产品"
            onChange={(event) => setProductName(event.target.value)}
          />
          <p className={styles.fieldHelp}>框架混剪按“同产品”替换片段，产品默认取自原片。</p>
        </div>
      </div>
      <div className={styles.formFooter}>
        <Checkbox checked={draft} onChange={(event) => setDraft(event.target.checked)}>
          存为草稿（待确认，不进入片段池）
        </Checkbox>
        <Button type="primary" htmlType="submit" className={styles.touchButton} loading={busy}>
          新建片段
        </Button>
      </div>
    </form>
  );
}
