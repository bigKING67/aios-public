import { useMemo, useState } from 'react';
import { Button, Select, Tooltip } from 'antd';
import { FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  CONTENT_ASSET_PLATFORM_OPTIONS,
  contentAssetPlatformLabel,
} from '../_lib/content-assets-platforms';
import type { ContentAssetFilterOptions, ContentAssetTodoFilter } from '../_lib/content-assets-types';
import {
  contentAssetTodoFilterLabel,
  contentAssetStatusLabel,
  contentAssetVideoTypeLabel,
  formatContentAssetScenePath,
  resolveContentAssetProductOptions,
  lifecycleStatusLabel,
  resolveContentAssetVideoTypeOptions,
  toSelectOption,
} from '../_lib/content-assets-ui-helpers';
import { ContentAssetsAdvancedFilterDrawer } from './content-assets-advanced-filter-drawer';
import { buildContentAssetPlatformSelectOptions } from './content-assets-platform-select';
import styles from './content-assets-controls.module.css';

const FALLBACK_LIFECYCLE_STATUSES = [
  'draft',
  'waiting_analysis',
  'testable',
  'testing',
  'scaling',
  'repurpose',
  'rejected',
  'expired',
];

export function ContentAssetsFilterBar({
  filterOptions,
  platform,
  productName,
  creatorName,
  ownerUserId,
  contentScene,
  contentSceneGroup,
  contentSceneSubtype,
  tags,
  videoType,
  assetStatus,
  lifecycleStatus,
  todo,
  externalOnly,
  isFetching,
  onPlatformChange,
  onProductNameChange,
  onCreatorNameChange,
  onOwnerUserIdChange,
  onContentSceneChange,
  onContentSceneGroupChange,
  onContentSceneSubtypeChange,
  onTagsChange,
  onVideoTypeChange,
  onAssetStatusChange,
  onLifecycleStatusChange,
  onTodoChange,
  onExternalOnlyChange,
  onReset,
  onSearch,
  onRefresh,
}: {
  filterOptions: ContentAssetFilterOptions;
  platform?: string;
  productName?: string;
  creatorName?: string;
  ownerUserId?: string;
  contentScene?: string;
  contentSceneGroup?: string;
  contentSceneSubtype?: string;
  tags?: string[];
  videoType?: string;
  assetStatus?: string;
  lifecycleStatus?: string;
  todo?: ContentAssetTodoFilter;
  externalOnly: 'all' | 'true' | 'false';
  isFetching: boolean;
  onPlatformChange: (value?: string) => void;
  onProductNameChange: (value?: string) => void;
  onCreatorNameChange: (value?: string) => void;
  onOwnerUserIdChange: (value?: string) => void;
  onContentSceneChange: (value?: string) => void;
  onContentSceneGroupChange: (value?: string) => void;
  onContentSceneSubtypeChange: (value?: string) => void;
  onTagsChange: (value: string[]) => void;
  onVideoTypeChange: (value?: string) => void;
  onAssetStatusChange: (value?: string) => void;
  onLifecycleStatusChange: (value?: string) => void;
  onTodoChange: (value?: ContentAssetTodoFilter) => void;
  onExternalOnlyChange: (value: 'all' | 'true' | 'false') => void;
  onReset: () => void;
  onSearch: () => void;
  onRefresh: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selectedTags = tags || [];
  const lifecycleOptions = useMemo(() => {
    const values = filterOptions.lifecycleStatuses.length > 0
      ? filterOptions.lifecycleStatuses
      : FALLBACK_LIFECYCLE_STATUSES;
    return values.map((value) => ({ label: lifecycleStatusLabel(value), value }));
  }, [filterOptions.lifecycleStatuses]);
  const assetStatusOptions = useMemo(
    () => filterOptions.assetStatuses.map((value) => ({ label: contentAssetStatusLabel(value), value })),
    [filterOptions.assetStatuses]
  );
  const videoTypeOptions = useMemo(
    () => resolveContentAssetVideoTypeOptions(filterOptions.videoTypes),
    [filterOptions.videoTypes]
  );
  const productOptions = useMemo(
    () => resolveContentAssetProductOptions(filterOptions.products),
    [filterOptions.products]
  );
  const platformOptions = useMemo(
    () => buildContentAssetPlatformSelectOptions([
      ...CONTENT_ASSET_PLATFORM_OPTIONS.map((option) => option.value),
      ...filterOptions.platforms,
    ]),
    [filterOptions.platforms]
  );
  const ownerOptions = useMemo(() => buildOwnerOptions(filterOptions), [filterOptions]);
  const ownerLabel = useMemo(
    () => ownerOptions.find((option) => option.value === ownerUserId)?.displayName || ownerUserId || '',
    [ownerOptions, ownerUserId]
  );
  const advancedFilterCount = [
    lifecycleStatus,
    todo,
    externalOnly !== 'all' ? externalOnly : undefined,
    selectedTags.length > 0 ? selectedTags.length : undefined,
    contentScene || contentSceneGroup || contentSceneSubtype ? 'scene' : undefined,
  ].filter(Boolean).length;
  const sceneFilterValues = [contentScene, contentSceneGroup, contentSceneSubtype]
    .filter((value): value is string => Boolean(value?.trim()));
  const sceneFilterPath = formatContentAssetScenePath(sceneFilterValues);
  const activeFilterChips = [
    ...selectedTags.map((tag) => ({
      key: `tag:${tag}`,
      label: `标签：${tag}`,
      onClear: () => onTagsChange(selectedTags.filter((currentTag) => currentTag !== tag)),
    })),
    platform
      ? {
          key: 'platform',
          label: `平台：${contentAssetPlatformLabel(platform)}`,
          onClear: () => onPlatformChange(undefined),
        }
      : undefined,
    productName
      ? {
          key: 'productName',
          label: `产品：${productName}`,
          onClear: () => onProductNameChange(undefined),
        }
      : undefined,
    creatorName
      ? {
          key: 'creatorName',
          label: `达人：${creatorName}`,
          onClear: () => onCreatorNameChange(undefined),
        }
      : undefined,
    ownerUserId
      ? {
          key: 'ownerUserId',
          label: `负责人：${ownerLabel}`,
          onClear: () => onOwnerUserIdChange(undefined),
        }
      : undefined,
    videoType
      ? {
          key: 'videoType',
          label: `视频类型：${contentAssetVideoTypeLabel(videoType)}`,
          onClear: () => onVideoTypeChange(undefined),
        }
      : undefined,
    sceneFilterValues.length > 0
      ? {
          key: 'contentScenePath',
          label: `场景：${sceneFilterPath}`,
          onClear: () => {
            onContentSceneChange(undefined);
            onContentSceneGroupChange(undefined);
            onContentSceneSubtypeChange(undefined);
          },
        }
      : undefined,
    assetStatus
      ? {
          key: 'assetStatus',
          label: `状态：${contentAssetStatusLabel(assetStatus)}`,
          onClear: () => onAssetStatusChange(undefined),
        }
      : undefined,
    lifecycleStatus
      ? {
          key: 'lifecycleStatus',
          label: `阶段：${lifecycleStatusLabel(lifecycleStatus)}`,
          onClear: () => onLifecycleStatusChange(undefined),
        }
      : undefined,
    todo
      ? {
          key: 'todo',
          label: `待办：${contentAssetTodoFilterLabel(todo)}`,
          onClear: () => onTodoChange(undefined),
        }
      : undefined,
    externalOnly !== 'all'
      ? {
          key: 'externalOnly',
          label: `入库：${externalOnly === 'true' ? '待补源' : '已入库'}`,
          onClear: () => onExternalOnlyChange('all'),
        }
      : undefined,
  ].filter((chip): chip is { key: string; label: string; onClear: () => void } => Boolean(chip));

  return (
    <section className={styles.filterStack} aria-label="素材筛选">
      <div className={styles.filterPanelHeader}>
        <strong>筛选</strong>
        <span>主筛选优先负责人、内容类型、平台归档、产品、达人和状态；标签与内容场景放高级筛选。</span>
      </div>
      <div className={styles.filterPrimaryRow}>
        <Select
          allowClear
          showSearch={false}
          aria-label="负责人"
          placeholder="负责人"
          optionFilterProp="searchText"
          value={ownerUserId}
          options={ownerOptions}
          onChange={onOwnerUserIdChange}
        />
        <Select
          allowClear
          showSearch={false}
          aria-label="视频类型"
          placeholder="视频类型"
          optionFilterProp="label"
          value={videoType}
          options={videoTypeOptions}
          onChange={onVideoTypeChange}
        />
        <Select
          allowClear
          showSearch={false}
          aria-label="平台"
          placeholder="平台"
          optionFilterProp="searchText"
          value={platform}
          options={platformOptions}
          onChange={onPlatformChange}
        />
        <Select
          allowClear
          showSearch={false}
          aria-label="产品"
          placeholder="产品"
          optionFilterProp="searchText"
          value={productName}
          options={productOptions}
          onChange={onProductNameChange}
        />
        <Select
          allowClear
          showSearch={false}
          aria-label="达人或账号"
          placeholder="达人/账号"
          optionFilterProp="label"
          value={creatorName}
          options={filterOptions.creators.map(toSelectOption)}
          onChange={onCreatorNameChange}
        />
        <Select
          allowClear
          showSearch={false}
          aria-label="资产状态"
          placeholder="资产状态"
          optionFilterProp="label"
          value={assetStatus}
          options={assetStatusOptions}
          onChange={onAssetStatusChange}
        />
      </div>
      {activeFilterChips.length > 0 ? (
        <div className={`${styles.activeFilterSummary} status-panel status-panel-info`} aria-label="已选筛选条件">
          <span className={styles.activeFilterLabel}>已选</span>
          <div className={styles.activeFilterChips}>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.activeFilterChip}
                aria-label={`清除${chip.label}`}
                onClick={chip.onClear}
              >
                <span>{chip.label}</span>
                <span className={styles.activeFilterChipRemove} aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={styles.filterFooter}>
        <span className={styles.filterHint}>高级筛选包含标签、待办、入库范围、生命周期与内容场景路径</span>
        <div className={styles.filterActions}>
          <Button onClick={onReset}>重置</Button>
          <Button
            className={advancedFilterCount ? styles.activeFilterButton : undefined}
            icon={<FilterOutlined />}
            onClick={() => setAdvancedOpen(true)}
          >
            高级筛选{advancedFilterCount ? ` ${advancedFilterCount}` : ''}
          </Button>
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
            搜索
          </Button>
          <Tooltip title="刷新列表">
            <Button icon={<ReloadOutlined />} loading={isFetching} onClick={onRefresh} />
          </Tooltip>
        </div>
      </div>
      <ContentAssetsAdvancedFilterDrawer
        assetStatus={assetStatus}
        assetStatusOptions={assetStatusOptions}
        contentScene={contentScene}
        contentSceneGroup={contentSceneGroup}
        contentSceneSubtype={contentSceneSubtype}
        externalOnly={externalOnly}
        filterOptions={filterOptions}
        lifecycleOptions={lifecycleOptions}
        lifecycleStatus={lifecycleStatus}
        onTagsChange={onTagsChange}
        onAssetStatusChange={onAssetStatusChange}
        onClose={() => setAdvancedOpen(false)}
        onContentSceneChange={onContentSceneChange}
        onContentSceneGroupChange={onContentSceneGroupChange}
        onContentSceneSubtypeChange={onContentSceneSubtypeChange}
        onExternalOnlyChange={onExternalOnlyChange}
        onLifecycleStatusChange={onLifecycleStatusChange}
        onReset={onReset}
        onSearch={onSearch}
        onTodoChange={onTodoChange}
        open={advancedOpen}
        tags={selectedTags}
        todo={todo}
      />
    </section>
  );
}

function buildOwnerOptions(filterOptions: ContentAssetFilterOptions) {
  return filterOptions.ownerOptions.map((owner) => {
    const displayName = owner.displayName || owner.username || owner.userId;
    return {
      label: owner.isManager ? `${displayName}（负责人）` : displayName,
      value: owner.userId,
      searchText: [displayName, owner.username, owner.userId, ...owner.roles].filter(Boolean).join(' '),
      displayName,
    };
  });
}
