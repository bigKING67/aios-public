import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { App, Select } from 'antd';
import {
  findExistingContentAssetTag,
  mergeContentAssetTagOptions,
  normalizeContentAssetTagKey,
  normalizeContentAssetTagList,
  normalizeContentAssetTagText,
  splitContentAssetTagText,
} from '../_lib/content-assets-tags';
import styles from './content-assets-tag-picker.module.css';

interface ContentAssetsTagPickerProps {
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

export function ContentAssetsTagPicker({
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
  const { modal } = App.useApp();
  const [searchValue, setSearchValue] = useState('');
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

  const addTagsFromText = (rawText: string) => {
    const inputTags = splitContentAssetTagText(rawText);
    const normalizedTags = inputTags.length > 0 ? inputTags : [normalizeContentAssetTagText(rawText)].filter(Boolean);
    if (normalizedTags.length === 0) {
      return;
    }
    const currentKeys = new Set(selectedTags.map(normalizeContentAssetTagKey));
    const nextTags = normalizedTags
      .map((tag) => findExistingContentAssetTag(tag, options) || tag)
      .filter((tag) => !currentKeys.has(normalizeContentAssetTagKey(tag)));

    emitChange([...selectedTags, ...nextTags]);
    setSearchValue('');
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    const rawTag = searchValue.trim();
    if (!rawTag) {
      return;
    }
    if (!allowCreate) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const existingTag = findExistingContentAssetTag(rawTag, options);
    if (existingTag) {
      addTagsFromText(existingTag);
      return;
    }

    const parsedTags = splitContentAssetTagText(rawTag);
    const newTags = parsedTags.filter((tag) => !findExistingContentAssetTag(tag, options));
    if (parsedTags.length > 1 && newTags.length === 0) {
      addTagsFromText(rawTag);
      return;
    }

    const createLabel = newTags.length > 0 ? newTags.join('、') : normalizeContentAssetTagText(rawTag);
    modal.confirm({
      title: '确认创建新标签',
      content: `确认创建「${createLabel || rawTag}」为新的素材标签？`,
      okText: '创建并选择',
      cancelText: '取消',
      onOk: () => addTagsFromText(rawTag),
    });
  };

  return (
    <Select
      allowClear
      aria-label={ariaLabel}
      showSearch
      disabled={disabled}
      mode="multiple"
      maxTagCount="responsive"
      placeholder={placeholder}
      className={[styles.tagPicker, className].filter(Boolean).join(' ')}
      classNames={{ popup: { root: styles.tagDropdown } }}
      optionFilterProp="searchText"
      filterOption={filterTagOption}
      options={mergedOptions}
      value={selectedTags}
      searchValue={searchValue}
      optionRender={(option) => renderTagOption(option.value, option.label, selectedTags)}
      notFoundContent={searchValue.trim() && allowCreate ? '按 Enter 创建新标签' : '暂无可选标签'}
      onSearch={setSearchValue}
      onInputKeyDown={handleInputKeyDown}
      onChange={(nextValue) => {
        emitChange(nextValue);
        setSearchValue('');
      }}
    />
  );
}

function renderTagOption(value: unknown, label: ReactNode, selectedTags: string[]) {
  const optionValue = String(value ?? '');
  const checked = selectedTags.some(
    (tag) => normalizeContentAssetTagKey(tag) === normalizeContentAssetTagKey(optionValue)
  );
  return (
    <span className={styles.checkboxOption}>
      <span
        className={`${styles.checkboxBox} ${checked ? styles.checkboxBoxChecked : ''}`}
        aria-hidden
      />
      <span className={styles.checkboxLabel}>{label}</span>
    </span>
  );
}

function filterTagOption(
  inputValue: string,
  option?: { value?: string | number | null; searchText?: string }
) {
  const keyword = inputValue.toLocaleLowerCase('zh-CN');
  const searchText = String(option?.searchText ?? option?.value ?? '').toLocaleLowerCase('zh-CN');
  return searchText.includes(keyword);
}
