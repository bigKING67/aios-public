import { AimOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Select } from 'antd';
import { useEffect, useId, useState } from 'react';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { isSellingPointPreset, presetDisplayName } from '../_lib/segment-display';
import { type SegmentDraftErrors, validateSegmentDraft } from '../_lib/segment-form';
import { formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';

export interface SegmentCreateValues {
  startMs: number;
  endMs: number;
  labelKey: string;
  labelKeys?: string[];
  /** Undefined inherits the asset product on the server. */
  productName?: string;
  draft: boolean;
  /** Selling-point presets only: cannot be cut from the previous selling-point segment. */
  continuesPrevious?: boolean;
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
  const [labelKeys, setLabelKeys] = useState<string[]>([]);
  const labelKey = labelKeys[0] ?? '';
  const [productName, setProductName] = useState(assetProductName ?? '');
  const [draft, setDraft] = useState(false);
  const [continuesPrevious, setContinuesPrevious] = useState(false);
  const sellingPoint = isSellingPointPreset(preset);
  const [errors, setErrors] = useState<SegmentDraftErrors>({});

  useEffect(() => setProductName(assetProductName ?? ''), [assetProductName]);
  useEffect(() => setLabelKeys([]), [preset.presetKey, preset.version]);

  const definitions = preset.labels.filter((label) => labelKeys.includes(label.key)).map((label) => label.definition).join('；');

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
      labelKeys: sellingPoint ? labelKeys : undefined,
      productName: trimmedProduct && trimmedProduct !== (assetProductName ?? '') ? trimmedProduct : undefined,
      draft,
      continuesPrevious: sellingPoint ? continuesPrevious : undefined,
    });
    if (saved) {
      // Continue annotating from the previous out-point.
      setStartText(endText);
      setEndText('');
      setContinuesPrevious(false);
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
            mode={sellingPoint ? 'multiple' : undefined}
            value={sellingPoint ? labelKeys : labelKey || undefined}
            placeholder={`选择${presetDisplayName(preset)} 标签`}
            status={errors.label ? 'error' : undefined}
            options={preset.labels.map((label) => ({ value: label.key, label: label.name }))}
            onChange={(next: string | string[]) => setLabelKeys(Array.isArray(next) ? next : [next])}
          />
          <p className={errors.label ? styles.fieldError : styles.fieldHelp}>
            {errors.label ?? (definitions || (sellingPoint ? '一个完整片段可选多个有明确依据的卖点，不需要拆句。' : '选择后显示该标签的判定定义。'))}
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
          <p className={styles.fieldHelp}>混剪按“同产品”替换片段，产品默认取自原片。</p>
        </div>
        {sellingPoint ? <ContinuesPreviousField checked={continuesPrevious} onChange={setContinuesPrevious} /> : null}
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

/**
 * 「连着」: this selling-point segment and the previous one in the same framework
 * segment are one shot or one sentence, so 卖点混剪 keeps them together.
 */
export function ContinuesPreviousField({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className={styles.field}>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
        和上一个卖点片段连着
      </Checkbox>
      <p className={styles.fieldHelp}>同一镜头连续拍下、一句话跨两个卖点时勾选；卖点混剪会把连着的片段整块使用，不在中间切开。</p>
    </div>
  );
}
