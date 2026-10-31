'use client';

import type { SelectOption, SelectProps } from '@lobehub/ui';
import type { KeyboardEvent } from 'react';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import styles from './creator-short-video-manual-attrs.module.css';
import { filterManualSelectOption, type ManualSelectOption } from './creator-short-video-manual-attrs-utils';

type ManualSelectProps = SelectProps<string>;

const MANUAL_SELECT_POPUP_CLASS_NAME = styles.manualAttrSelectPopup;

function isComposingEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229);
}

function filterManualOption(inputValue: string, option: SelectOption<string>): boolean {
  return filterManualSelectOption(inputValue, option as ManualSelectOption);
}

interface ManualTagSelectProps {
  label: string;
  placeholder: string;
  options: ManualSelectOption[];
  value: string | null;
  optionRender: NonNullable<ManualSelectProps['optionRender']>;
  labelRender: NonNullable<ManualSelectProps['labelRender']>;
  onSearch: (value: string) => void;
  onChange: (value: string | null | undefined) => void;
  onCommitSearch: (reason?: 'blur' | 'enter') => void;
}

/**
 * Pick an existing tag or type a new one. lobe Select keeps its search box inside the popup, so
 * Enter is caught on the way down (capture) and closing the popup stands in for the antd blur.
 */
export function ManualTagSelect({
  label,
  placeholder,
  options,
  value,
  optionRender,
  labelRender,
  onSearch,
  onChange,
  onCommitSearch,
}: ManualTagSelectProps) {
  return (
    <div
      className={[styles.manualAttrSelect, styles.manualAttrTagSelect].join(' ')}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' && !isComposingEnter(event)) {
          onCommitSearch('enter');
        }
      }}
    >
      <LabeledSelect<string>
        label={label}
        size="small"
        allowClear
        showSearch
        placeholder={placeholder}
        popupClassName={MANUAL_SELECT_POPUP_CLASS_NAME}
        classNames={{ trigger: styles.manualAttrSelectTrigger }}
        filterOption={filterManualOption}
        optionRender={optionRender}
        labelRender={labelRender}
        options={options}
        value={value ?? undefined}
        onSearch={onSearch}
        onChange={(nextValue) => onChange(nextValue ?? null)}
        onOpenChange={(open) => {
          if (!open) {
            onCommitSearch('blur');
          }
        }}
      />
    </div>
  );
}
