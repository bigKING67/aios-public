import type { MouseEvent, ReactNode } from 'react';
import type { SelectProps } from 'antd';
import {
  CONTENT_ASSET_PLATFORM_OPTIONS,
  contentAssetPlatformLabel,
} from '../_lib/content-assets-platforms';
import styles from './content-assets-platform-select.module.css';

export type ContentAssetPlatformSelectOption = {
  value: string;
  label: ReactNode;
  searchText: string;
};

export function buildContentAssetDefaultPlatformOptions(): ContentAssetPlatformSelectOption[] {
  return buildContentAssetPlatformSelectOptions(
    CONTENT_ASSET_PLATFORM_OPTIONS.map((option) => option.value)
  );
}

export function buildContentAssetPlatformSelectOptions(
  values: readonly string[]
): ContentAssetPlatformSelectOption[] {
  return uniquePlatformValues(values).map((value) => ({
    value,
    searchText: `${contentAssetPlatformLabel(value)} ${value}`,
    label: renderContentAssetPlatformPill(value),
  }));
}

export function renderContentAssetPlatformPill(value?: string | null) {
  const normalizedValue = value || 'other';
  return (
    <span className={`${styles.platformPill} ${getPlatformToneClassName(normalizedValue)}`}>
      {contentAssetPlatformLabel(normalizedValue)}
    </span>
  );
}

export const renderContentAssetPlatformSelectTag: NonNullable<SelectProps['tagRender']> = ({
  value,
  closable,
  onClose,
}) => {
  const normalizedValue = String(value || 'other');
  const label = contentAssetPlatformLabel(normalizedValue);

  const handleMouseDown = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose(event);
  };

  return (
    <span
      className={`${styles.platformTag} ${getPlatformToneClassName(normalizedValue)}`}
      onMouseDown={handleMouseDown}
    >
      <span className={styles.platformTagLabel}>{label}</span>
      {closable ? (
        <button
          aria-label={`移除${label}`}
          className={styles.platformTagRemove}
          onClick={handleRemove}
          type="button"
        >
          ×
        </button>
      ) : null}
    </span>
  );
};

function uniquePlatformValues(values: readonly string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (result.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) continue;
    result.push(normalized);
  }
  return result;
}

function getPlatformToneClassName(value: string): string {
  switch (value) {
    case 'douyin':
    case '抖音':
      return styles.platformToneDouyin;
    case 'taobao':
    case 'tmall':
    case '淘宝':
    case '天猫':
      return styles.platformToneTaobao;
    case 'xhs':
    case 'xiaohongshu':
    case '小红书':
      return styles.platformToneXhs;
    case 'kuaishou':
    case '快手':
      return styles.platformToneKuaishou;
    case 'qianchuan':
    case '千川':
    case 'ocean_engine':
      return styles.platformToneQianchuan;
    default:
      return styles.platformToneUnknown;
  }
}
