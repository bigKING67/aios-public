import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Button, Cascader, Drawer, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import {
  CONTENT_ASSET_EXTERNAL_OPTIONS,
  CONTENT_ASSET_TODO_OPTIONS,
} from '../_lib/content-assets-filter-constants';
import {
  CONTENT_ASSET_SCENE_OPTIONS,
  formatContentAssetScenePath,
  isContentAssetSceneOptionsConfigured,
  toSelectOption,
} from '../_lib/content-assets-ui-helpers';
import type { ContentAssetFilterOptions, ContentAssetTodoFilter } from '../_lib/content-assets-types';
import { ContentAssetsTagPicker } from './content-assets-tag-picker';
import styles from './content-assets-controls.module.css';

export function ContentAssetsAdvancedFilterDrawer({
  assetStatus,
  assetStatusOptions,
  contentScene,
  contentSceneGroup,
  contentSceneSubtype,
  externalOnly,
  filterOptions,
  lifecycleOptions,
  lifecycleStatus,
  onAssetStatusChange,
  onClose,
  onContentSceneChange,
  onContentSceneGroupChange,
  onContentSceneSubtypeChange,
  onExternalOnlyChange,
  onLifecycleStatusChange,
  onReset,
  onSearch,
  onTagsChange,
  onTodoChange,
  open,
  tags,
  todo,
}: {
  assetStatus?: string;
  assetStatusOptions: Array<{ label: string; value: string }>;
  contentScene?: string;
  contentSceneGroup?: string;
  contentSceneSubtype?: string;
  externalOnly: 'all' | 'true' | 'false';
  filterOptions: ContentAssetFilterOptions;
  lifecycleOptions: Array<{ label: string; value: string }>;
  lifecycleStatus?: string;
  onAssetStatusChange: (value?: string) => void;
  onClose: () => void;
  onContentSceneChange: (value?: string) => void;
  onContentSceneGroupChange: (value?: string) => void;
  onContentSceneSubtypeChange: (value?: string) => void;
  onExternalOnlyChange: (value: 'all' | 'true' | 'false') => void;
  onLifecycleStatusChange: (value?: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onTagsChange: (value: string[]) => void;
  onTodoChange: (value?: ContentAssetTodoFilter) => void;
  open: boolean;
  tags: string[];
  todo?: ContentAssetTodoFilter;
}) {
  const sceneOptionsConfigured = isContentAssetSceneOptionsConfigured();
  const scenePath = useMemo(
    () => [contentScene, contentSceneGroup, contentSceneSubtype].filter((value): value is string => Boolean(value)),
    [contentScene, contentSceneGroup, contentSceneSubtype]
  );
  const contentSceneOptions = useMemo(
    () => (filterOptions.contentScenes || []).map(toSelectOption),
    [filterOptions.contentScenes]
  );
  const contentSceneGroupOptions = useMemo(
    () => (filterOptions.contentSceneGroups || []).map(toSelectOption),
    [filterOptions.contentSceneGroups]
  );
  const contentSceneSubtypeOptions = useMemo(
    () => (filterOptions.contentSceneSubtypes || []).map(toSelectOption),
    [filterOptions.contentSceneSubtypes]
  );
  const clearSceneFilters = () => {
    onContentSceneChange(undefined);
    onContentSceneGroupChange(undefined);
    onContentSceneSubtypeChange(undefined);
  };

  return (
    <Drawer
      title="高级筛选"
      size="min(420px, calc(100vw - 24px))"
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className={styles.advancedDrawerFooter}>
          <Button onClick={onReset}>重置全部</Button>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => {
              onSearch();
              onClose();
            }}
          >
            应用筛选
          </Button>
        </div>
      }
    >
      <div className={styles.advancedFilterStack}>
        <AdvancedFilterBlock
          title="内容场景路径"
          description="用于 KOL种草视频、KOC种草、KOC挂车视频、店播视频；显示为“场景类型｜大场景 › 细分场景”。"
        >
          {sceneOptionsConfigured ? (
            <Cascader
              allowClear
              changeOnSelect
              displayRender={(labels) => formatContentAssetScenePath(labels.map((label) => String(label)))}
              options={CONTENT_ASSET_SCENE_OPTIONS}
              placeholder="选择场景类型 → 大场景 → 细分场景"
              value={scenePath.length > 0 ? scenePath : undefined}
              onChange={(value) => {
                const path = Array.isArray(value) ? value.map(String) : [];
                onContentSceneChange(path[0]);
                onContentSceneGroupChange(path[1]);
                onContentSceneSubtypeChange(path[2]);
              }}
            />
          ) : (
            <div className={styles.advancedFilterStack}>
              {/* Fallback keeps historical free-form scene values searchable if the fixed tree changes. */}
              <Select
                allowClear
                showSearch={false}
                placeholder="场景"
                optionFilterProp="label"
                value={contentScene}
                options={contentSceneOptions}
                onChange={onContentSceneChange}
              />
              <Select
                allowClear
                showSearch={false}
                placeholder="大场景"
                optionFilterProp="label"
                value={contentSceneGroup}
                options={contentSceneGroupOptions}
                onChange={onContentSceneGroupChange}
              />
              <Select
                allowClear
                showSearch={false}
                placeholder="细分场景"
                optionFilterProp="label"
                value={contentSceneSubtype}
                options={contentSceneSubtypeOptions}
                onChange={onContentSceneSubtypeChange}
              />
              {scenePath.length > 0 ? <Button onClick={clearSceneFilters}>清除场景筛选</Button> : null}
            </div>
          )}
        </AdvancedFilterBlock>
        <AdvancedFilterBlock
          title="辅助标签"
          description="标签作为补充分类，不再挤占主筛选区。"
        >
          <ContentAssetsTagPicker
            allowCreate={false}
            ariaLabel="标签"
            placeholder="标签"
            value={tags}
            options={filterOptions.tags}
            onChange={onTagsChange}
          />
        </AdvancedFilterBlock>
        <AdvancedFilterBlock
          title="内容待办"
          description="按 AI、脚本、视频 ID、广告素材 ID 和授权覆盖缺口筛选。"
        >
          <Select<ContentAssetTodoFilter>
            allowClear
            placeholder="选择待办状态"
            value={todo}
            options={CONTENT_ASSET_TODO_OPTIONS}
            onChange={onTodoChange}
          />
        </AdvancedFilterBlock>
        <AdvancedFilterBlock
          title="生命周期阶段"
          description="按待分析、可测试、投放中、待复剪等业务流转状态筛选。"
        >
          <Select
            allowClear
            placeholder="选择生命周期阶段"
            value={lifecycleStatus}
            options={lifecycleOptions}
            onChange={onLifecycleStatusChange}
          />
        </AdvancedFilterBlock>
        <AdvancedFilterBlock
          title="资产状态"
          description="区分已就绪、待补源、待生成、处理中、失败和归档素材。"
        >
          <Select
            allowClear
            placeholder="选择资产状态"
            value={assetStatus}
            options={assetStatusOptions}
            onChange={onAssetStatusChange}
          />
        </AdvancedFilterBlock>
        <AdvancedFilterBlock
          title="入库范围"
          description="控制只看 TOS 已入库素材，或定位仍在外链/网盘的待补源视频。"
        >
          <Select<'all' | 'true' | 'false'>
            value={externalOnly}
            options={[...CONTENT_ASSET_EXTERNAL_OPTIONS]}
            onChange={onExternalOnlyChange}
          />
        </AdvancedFilterBlock>
      </div>
    </Drawer>
  );
}

function AdvancedFilterBlock({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className={styles.advancedFilterBlock}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}
