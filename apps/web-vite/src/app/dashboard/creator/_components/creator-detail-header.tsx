'use client';

import { Button, Select, type SelectProps } from 'antd';
import {
  CreatorDetailExportActions,
  type CreatorDetailExportMenuItem,
} from './creator-detail-export-actions';
import styles from './creator-live-dashboard.module.css';

export type { CreatorDetailExportMenuItem } from './creator-detail-export-actions';

type DetailFilterValue = string | undefined;
type DetailFilterOptions = SelectProps<string>['options'];
type DetailFilterOption = NonNullable<DetailFilterOptions>[number];

interface DetailFilterSelectProps {
  placeholder: string;
  minWidth: number;
  value: DetailFilterValue;
  options: DetailFilterOptions;
  onChange: (value: DetailFilterValue) => void;
}

interface DetailFilterControlsProps {
  selectMinWidth: number;
  creatorValue?: DetailFilterValue;
  creatorOptions?: DetailFilterOptions;
  creatorFilterPlaceholder?: string;
  onCreatorChange?: (value: DetailFilterValue) => void;
  cooperationStatusValue: DetailFilterValue;
  cooperationStatusOptions: DetailFilterOptions;
  cooperationStatusFilterPlaceholder?: string;
  onCooperationStatusChange: (value: DetailFilterValue) => void;
  ownerValue: DetailFilterValue;
  ownerOptions: DetailFilterOptions;
  ownerFilterPlaceholder?: string;
  onOwnerChange: (value: DetailFilterValue) => void;
  platformValue: DetailFilterValue;
  platformOptions: DetailFilterOptions;
  platformFilterPlaceholder?: string;
  onPlatformChange: (value: DetailFilterValue) => void;
  filterCountText: string;
  onResetFilters: () => void;
  resetDisabled: boolean;
}

function normalizeDetailFilterSearchText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, '');
}

function filterDetailFilterOption(inputValue: string, option?: DetailFilterOption): boolean {
  const normalizedInput = normalizeDetailFilterSearchText(inputValue);
  if (!normalizedInput) {
    return true;
  }

  return [option?.label, option?.value].some((candidate) =>
    normalizeDetailFilterSearchText(candidate).includes(normalizedInput)
  );
}

export interface CreatorDetailHeaderProps {
  title: string;
  subtitle: string;
  headerVariant?: 'default' | 'inlineActions';
  isMobile: boolean;
  creatorValue?: DetailFilterValue;
  creatorOptions?: DetailFilterOptions;
  creatorFilterPlaceholder?: string;
  onCreatorChange?: (value: DetailFilterValue) => void;
  cooperationStatusValue: DetailFilterValue;
  cooperationStatusOptions: DetailFilterOptions;
  cooperationStatusFilterPlaceholder?: string;
  onCooperationStatusChange: (value: DetailFilterValue) => void;
  ownerValue: DetailFilterValue;
  ownerOptions: DetailFilterOptions;
  ownerFilterPlaceholder?: string;
  onOwnerChange: (value: DetailFilterValue) => void;
  platformValue: DetailFilterValue;
  platformOptions: DetailFilterOptions;
  platformFilterPlaceholder?: string;
  onPlatformChange: (value: DetailFilterValue) => void;
  filterCountText: string;
  onResetFilters: () => void;
  resetDisabled: boolean;
  exportLoading: boolean;
  exportDisabled: boolean;
  exportButtonLabel?: string;
  exportButtonTitle?: string;
  exportMenuItems?: readonly CreatorDetailExportMenuItem[];
  onExport: () => void | Promise<void>;
  isAuthenticated: boolean;
  onNavigateToLogin: () => void;
}

function DetailFilterSelect({
  placeholder,
  minWidth,
  value,
  options,
  onChange,
}: DetailFilterSelectProps) {
  return (
    <Select
      allowClear
      showSearch={{
        filterOption: filterDetailFilterOption,
        optionFilterProp: 'label',
      }}
      placeholder={placeholder}
      style={{ minWidth }}
      value={value}
      options={options}
      notFoundContent="无匹配结果"
      onChange={(nextValue) => onChange(nextValue || undefined)}
    />
  );
}

function DetailFilterControls({
  selectMinWidth,
  creatorValue,
  creatorOptions,
  creatorFilterPlaceholder = '按达人筛选',
  onCreatorChange,
  cooperationStatusValue,
  cooperationStatusOptions,
  cooperationStatusFilterPlaceholder = '按合作状态筛选',
  onCooperationStatusChange,
  ownerValue,
  ownerOptions,
  ownerFilterPlaceholder = '按负责人筛选',
  onOwnerChange,
  platformValue,
  platformOptions,
  platformFilterPlaceholder = '按平台筛选',
  onPlatformChange,
  filterCountText,
  onResetFilters,
  resetDisabled,
}: DetailFilterControlsProps) {
  const showCreatorFilter = Boolean(onCreatorChange);
  const detailFiltersClassName = [
    styles.detailFilters,
    showCreatorFilter ? styles.detailFiltersFour : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const detailFilterControlsClassName = [
    styles.detailFilterControls,
    showCreatorFilter ? styles.detailFilterControlsFour : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={detailFiltersClassName}>
      <div className={detailFilterControlsClassName}>
        {showCreatorFilter ? (
          <DetailFilterSelect
            placeholder={creatorFilterPlaceholder}
            minWidth={selectMinWidth}
            value={creatorValue}
            options={creatorOptions}
            onChange={(nextValue) => onCreatorChange?.(nextValue)}
          />
        ) : null}
        <DetailFilterSelect
          placeholder={cooperationStatusFilterPlaceholder}
          minWidth={selectMinWidth}
          value={cooperationStatusValue}
          options={cooperationStatusOptions}
          onChange={onCooperationStatusChange}
        />
        <DetailFilterSelect
          placeholder={ownerFilterPlaceholder}
          minWidth={selectMinWidth}
          value={ownerValue}
          options={ownerOptions}
          onChange={onOwnerChange}
        />
        <DetailFilterSelect
          placeholder={platformFilterPlaceholder}
          minWidth={selectMinWidth}
          value={platformValue}
          options={platformOptions}
          onChange={onPlatformChange}
        />
      </div>
      <div className={styles.detailFilterFooter}>
        <span className={styles.detailFilterCount}>{filterCountText}</span>
        <Button
          type="link"
          size="small"
          className={styles.detailFilterReset}
          onClick={onResetFilters}
          disabled={resetDisabled}
        >
          清空筛选
        </Button>
      </div>
    </div>
  );
}

export function CreatorDetailHeader({
  title,
  subtitle,
  headerVariant = 'default',
  isMobile,
  creatorValue,
  creatorOptions,
  creatorFilterPlaceholder,
  onCreatorChange,
  cooperationStatusValue,
  cooperationStatusOptions,
  cooperationStatusFilterPlaceholder,
  onCooperationStatusChange,
  ownerValue,
  ownerOptions,
  ownerFilterPlaceholder,
  onOwnerChange,
  platformValue,
  platformOptions,
  platformFilterPlaceholder,
  onPlatformChange,
  filterCountText,
  onResetFilters,
  resetDisabled,
  exportLoading,
  exportDisabled,
  exportButtonLabel,
  exportButtonTitle,
  exportMenuItems,
  onExport,
  isAuthenticated,
  onNavigateToLogin,
}: CreatorDetailHeaderProps) {
  const selectMinWidth = isMobile ? 132 : 156;
  const isInlineActions = headerVariant === 'inlineActions';
  const detailHeadClassName = [
    styles.detailHead,
    isInlineActions ? styles.detailHeadInlineActions : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const filterControls = (
    <DetailFilterControls
      selectMinWidth={selectMinWidth}
      creatorValue={creatorValue}
      creatorOptions={creatorOptions}
      creatorFilterPlaceholder={creatorFilterPlaceholder}
      onCreatorChange={onCreatorChange}
      cooperationStatusValue={cooperationStatusValue}
      cooperationStatusOptions={cooperationStatusOptions}
      cooperationStatusFilterPlaceholder={cooperationStatusFilterPlaceholder}
      onCooperationStatusChange={onCooperationStatusChange}
      ownerValue={ownerValue}
      ownerOptions={ownerOptions}
      ownerFilterPlaceholder={ownerFilterPlaceholder}
      onOwnerChange={onOwnerChange}
      platformValue={platformValue}
      platformOptions={platformOptions}
      platformFilterPlaceholder={platformFilterPlaceholder}
      onPlatformChange={onPlatformChange}
      filterCountText={filterCountText}
      onResetFilters={onResetFilters}
      resetDisabled={resetDisabled}
    />
  );
  const exportActions = (
    <CreatorDetailExportActions
      exportLoading={exportLoading}
      exportDisabled={exportDisabled}
      exportButtonLabel={exportButtonLabel}
      exportButtonTitle={exportButtonTitle}
      exportMenuItems={exportMenuItems}
      onExport={onExport}
      isAuthenticated={isAuthenticated}
      onNavigateToLogin={onNavigateToLogin}
    />
  );

  return (
    <header className={detailHeadClassName}>
      <div className={styles.detailMeta}>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {isInlineActions ? (
        <div className={styles.detailToolbar}>
          {filterControls}
          {exportActions}
        </div>
      ) : (
        <>
          {filterControls}
          {exportActions}
        </>
      )}
    </header>
  );
}
