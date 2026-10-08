import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { StudioSegmentPresetLabel } from '../_lib/ai-studio-api';
import suggestStyles from './segment-suggest.module.css';
import workbenchStyles from './studio-workbench.module.css';

interface SuggestionLabelPickerProps {
  labels: readonly StudioSegmentPresetLabel[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Noun for the labels, e.g. 框架 or 画面类型. */
  noun?: string;
}

/**
 * Candidate labels for one AI 切段 request, as toggle chips (native checkboxes
 * underneath for keyboard and screen readers). The model may only use the
 * checked labels; the parent keeps them in preset order and blocks an empty set.
 */
export function SuggestionLabelPicker({ labels, value, onChange, disabled, noun = '框架' }: SuggestionLabelPickerProps) {
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(labels.filter((label) => next.has(label.key)).map((label) => label.key));
  };

  return (
    <fieldset className={suggestStyles.labelPicker}>
      <legend className={suggestStyles.labelLegend}>
        候选{noun}
        <Tooltip title={`模型只会在选中的${noun}中打标签。本批原片中确定不会出现的${noun}可以取消，减少误判。`} trigger={['hover', 'focus']}>
          <InfoCircleOutlined className={workbenchStyles.infoIcon} tabIndex={0} aria-label={`候选${noun}说明`} />
        </Tooltip>
      </legend>
      <div className={suggestStyles.labelChips}>
        {labels.map((label) => {
          const checked = value.includes(label.key);
          return (
            <Tooltip key={label.key} title={label.definition || '无补充定义，按名称判断。'} trigger={['hover']}>
              <label className={`${suggestStyles.labelChip} ${checked ? suggestStyles.labelChipOn : ''} ${disabled ? suggestStyles.labelChipDisabled : ''}`}>
                <input
                  type="checkbox"
                  className={suggestStyles.labelChipInput}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggle(label.key, event.target.checked)}
                />
                {label.name}
              </label>
            </Tooltip>
          );
        })}
      </div>
      {value.length === 0 ? (
        <p className={suggestStyles.jobError} role="alert">
          至少选择 1 个候选{noun}。
        </p>
      ) : null}
    </fieldset>
  );
}
