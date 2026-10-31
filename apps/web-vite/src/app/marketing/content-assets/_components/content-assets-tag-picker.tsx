import { useMemo } from 'react';
import { confirmModal } from '@lobehub/ui';
import {
  findExistingContentAssetTag,
  mergeContentAssetTagOptions,
  normalizeContentAssetTagKey,
  normalizeContentAssetTagList,
  normalizeContentAssetTagText,
  splitContentAssetTagText,
} from '../_lib/content-assets-tags';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import styles from './content-assets-tag-picker.module.css';

interface ContentAssetsTagPickerProps {
  id?: string;
  value?: string[];
  options?: string[];
  allowCreate?: boolean;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  maxCount?: number;
  onChange?: (value: string[]) => void;
}

/** Typed text may hold several tags (「控油、遮瑕」); each resolves to an existing tag when one matches. */
function resolveTypedTags(rawText: string, options: string[]): string[] {
  const inputTags = splitContentAssetTagText(rawText);
  const normalizedTags = inputTags.length > 0 ? inputTags : [normalizeContentAssetTagText(rawText)].filter(Boolean);
  return normalizedTags.map((tag) => findExistingContentAssetTag(tag, options) || tag);
}

export function ContentAssetsTagPicker({
  id,
  allowCreate = true,
  ariaLabel,
  className,
  value,
  options = [],
  placeholder = '搜索或新增标签',
  disabled,
  maxCount = 20,
  onChange,
}: ContentAssetsTagPickerProps) {
  const selectedTags = useMemo(() => normalizeContentAssetTagList(value || [], maxCount), [maxCount, value]);
  const mergedOptions = useMemo(
    () => mergeContentAssetTagOptions(options, selectedTags).map((tag) => ({
      label: tag,
      value: tag,
      searchText: tag,
    })),
    [options, selectedTags]
  );

  const emitChange = (nextTags: string[]) => {
    onChange?.(normalizeContentAssetTagList(nextTags, maxCount));
  };

  // Picking or removing listed tags applies at once; typed text that would create a tag asks first.
  const handleChange = (nextValue: string[]) => {
    const currentKeys = new Set(selectedTags.map(normalizeContentAssetTagKey));
    const nextKeys = new Set(nextValue.map(normalizeContentAssetTagKey));
    const kept = selectedTags.filter((tag) => nextKeys.has(normalizeContentAssetTagKey(tag)));
    const added = nextValue
      .filter((tag) => !currentKeys.has(normalizeContentAssetTagKey(tag)))
      .flatMap((tag) => resolveTypedTags(tag, options))
      .filter((tag) => !currentKeys.has(normalizeContentAssetTagKey(tag)));
    const newTags = added.filter((tag) => !findExistingContentAssetTag(tag, options));
    if (newTags.length === 0) {
      emitChange([...kept, ...added]);
      return;
    }
    if (!allowCreate) {
      emitChange([...kept, ...added.filter((tag) => !newTags.includes(tag))]);
      return;
    }
    confirmModal({
      title: '确认创建新标签',
      content: `确认创建「${newTags.join('、')}」为新的素材标签？`,
      okText: '创建并选择',
      cancelText: '取消',
      onOk: () => emitChange([...kept, ...added]),
    });
  };

  return (
    <LabeledSelect
      id={id}
      label={ariaLabel ?? (id ? undefined : placeholder)}
      wrapperClassName={[styles.tagPicker, className].filter(Boolean).join(' ')}
      allowClear
      showSearch
      disabled={disabled}
      mode={allowCreate ? 'tags' : 'multiple'}
      placeholder={placeholder}
      options={mergedOptions}
      value={selectedTags}
      onChange={handleChange}
    />
  );
}
