'use client';

import type { SelectOption, SelectProps } from '@lobehub/ui';
import type { ReactNode } from 'react';
import styles from './creator-short-video-manual-attrs.module.css';
import type { ManualSelectOption, ManualTagKind } from './creator-short-video-manual-attrs-utils';

type ManualSelectProps = SelectProps<string>;

export function resolveManualTagClassName(kind: ManualTagKind): string {
  const toneClassName = kind === 'creatorType' ? styles.manualAttrTagCreatorType : styles.manualAttrTagMcn;

  return [styles.manualAttrTag, toneClassName].filter(Boolean).join(' ');
}

function resolveManualTagLabel(label: ReactNode, value: string): string {
  if (typeof label === 'string' || typeof label === 'number') return String(label);

  return value;
}

function createManualLabelRender(kind: ManualTagKind): NonNullable<ManualSelectProps['labelRender']> {
  return function manualLabelRender({ label, value }) {
    const labelText = resolveManualTagLabel(label, String(value ?? ''));
    if (!labelText) return null;

    return <span className={resolveManualTagClassName(kind)}>{labelText}</span>;
  };
}

function createManualOptionRender(kind: ManualTagKind): NonNullable<ManualSelectProps['optionRender']> {
  return function manualOptionRender(option) {
    const value = String(option.value ?? '');
    const labelText = resolveManualTagLabel(option.label, value);

    return (
      <span className={styles.manualAttrOption}>
        <span className={resolveManualTagClassName(kind)}>{labelText}</span>
        {(option as SelectOption<string> & Pick<ManualSelectOption, 'isInput'>).isInput ? (
          <span className={styles.manualAttrOptionHint}>
            {kind === 'creatorType' ? '新增标签' : '新增 MCN'}
          </span>
        ) : null}
      </span>
    );
  };
}

export const CREATOR_TYPE_LABEL_RENDER = createManualLabelRender('creatorType');
export const MCN_LABEL_RENDER = createManualLabelRender('mcn');
export const CREATOR_TYPE_OPTION_RENDER = createManualOptionRender('creatorType');
export const MCN_OPTION_RENDER = createManualOptionRender('mcn');
