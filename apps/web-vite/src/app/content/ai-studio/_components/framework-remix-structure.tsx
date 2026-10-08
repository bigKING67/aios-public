import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { MAX_REMIX_SLOTS, referenceAssetOptions, type ReferenceAssetOption, type RemixStructure } from '../_lib/remix-form';
import { RemixReferencePicker } from './remix-reference-picker';
import { useRemixConfirmedSegments } from './use-remix-batches';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';

interface FrameworkRemixStructureProps {
  preset: StudioSegmentPreset;
  value: RemixStructure;
  onChange: (value: RemixStructure) => void;
  /** Called with the picked reference original, so the form can default to its product. */
  onReferencePicked?: (option: ReferenceAssetOption) => void;
  disabled: boolean;
}

/** Structure body: reference cards, or the manual slot editor. The mode switch lives in the form. */
export function FrameworkRemixStructure({ preset, value, onChange, onReferencePicked, disabled }: FrameworkRemixStructureProps) {
  const confirmed = useRemixConfirmedSegments(preset, value.mode === 'reference');
  const references = referenceAssetOptions(
    (confirmed.data?.items ?? []).filter((segment) => segment.presetVersion === preset.version),
  );
  const labelOptions = preset.labels.map((label) => ({ value: label.key, label: label.name }));

  const updateLabels = (labels: string[]) => onChange({ mode: 'manual', labels });

  return (
    <div className={styles.field}>
      {value.mode === 'reference' ? (
        <RemixReferencePicker
          preset={preset}
          references={references}
          loading={confirmed.isPending}
          error={confirmed.isError}
          truncated={Boolean(confirmed.data?.truncated)}
          selectedId={value.sourceAssetId}
          disabled={disabled}
          onPick={(option) => {
            onChange({ mode: 'reference', sourceAssetId: option.assetId });
            onReferencePicked?.(option);
          }}
          onClear={() => onChange({ mode: 'reference', sourceAssetId: null })}
        />
      ) : (
        <>
          <ol className={remixStyles.slotList} aria-label="框架顺序">
            {value.labels.map((labelKey, index) => (
              <li key={`${index}-${labelKey}`} className={remixStyles.slotRow}>
                <span className={remixStyles.slotIndex}>{index + 1}</span>
                <Select
                  aria-label={`第 ${index + 1} 位框架`}
                  value={labelKey}
                  options={labelOptions}
                  disabled={disabled}
                  onChange={(next: string) => updateLabels(value.labels.map((key, i) => (i === index ? next : key)))}
                />
                <span className={styles.rowActions}>
                  <Button
                    aria-label={`上移第 ${index + 1} 位`}
                    icon={<ArrowUpOutlined />}
                    disabled={disabled || index === 0}
                    onClick={() => updateLabels(move(value.labels, index, index - 1))}
                  />
                  <Button
                    aria-label={`下移第 ${index + 1} 位`}
                    icon={<ArrowDownOutlined />}
                    disabled={disabled || index === value.labels.length - 1}
                    onClick={() => updateLabels(move(value.labels, index, index + 1))}
                  />
                  <Button
                    aria-label={`删除第 ${index + 1} 位`}
                    icon={<DeleteOutlined />}
                    disabled={disabled}
                    onClick={() => updateLabels(value.labels.filter((_, i) => i !== index))}
                  />
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.rowActions}>
            <Button
              icon={<PlusOutlined />}
              disabled={disabled || value.labels.length >= MAX_REMIX_SLOTS || labelOptions.length === 0}
              onClick={() => updateLabels([...value.labels, labelOptions[0]?.value ?? ''])}
            >
              添加一位
            </Button>
            <span className={styles.fieldHelp}>最多 {MAX_REMIX_SLOTS} 位，同一框架可以出现多次。</span>
          </div>
        </>
      )}
    </div>
  );
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
