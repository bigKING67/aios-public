import { useMemo, useState } from 'react';
import type {
  ContentAssetProcessingJobQueryParams,
  ContentAssetProcessingJobStatus,
  ContentAssetProcessingJobType,
  ContentAssetQueryParams,
  ContentAssetSort,
  ContentAssetTodoFilter,
  ContentAssetUnmatchedStatsMatchTypeFilter,
  ContentAssetUnmatchedStatsQueryParams,
  ContentAssetView,
} from '../_lib/content-assets-types';
import {
  isContentAssetSceneVideoType,
  normalizeContentAssetVideoTypeValue,
} from '../_lib/content-assets-ui-helpers';
import type { ContentAssetsModuleKey } from './content-assets-module-nav-config';
import type { AssetListPreset } from './content-assets-workspace-types';

export function useContentAssetsClientState() {
  const [activeModule, setActiveModule] = useState<ContentAssetsModuleKey>('home');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [platform, setPlatform] = useState<string | undefined>();
  const [productName, setProductName] = useState<string | undefined>();
  const [creatorName, setCreatorName] = useState<string | undefined>();
  const [ownerUserId, setOwnerUserId] = useState<string | undefined>();
  const [videoType, setVideoType] = useState<string | undefined>();
  const [contentScene, setContentScene] = useState<string | undefined>();
  const [contentSceneGroup, setContentSceneGroup] = useState<string | undefined>();
  const [contentSceneSubtype, setContentSceneSubtype] = useState<string | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [assetStatus, setAssetStatus] = useState<string | undefined>();
  const [lifecycleStatus, setLifecycleStatus] = useState<string | undefined>();
  const [todo, setTodo] = useState<ContentAssetTodoFilter | undefined>();
  const [externalOnly, setExternalOnly] = useState<'all' | 'true' | 'false'>('all');
  const [sort, setSort] = useState<ContentAssetSort>('recommended');
  const [view, setView] = useState<ContentAssetView>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [videoJobStatus, setVideoJobStatus] = useState<'all' | ContentAssetProcessingJobStatus>('all');
  const [videoJobType, setVideoJobType] = useState<'all' | ContentAssetProcessingJobType>('all');
  const [aiJobStatus, setAiJobStatus] = useState<'all' | ContentAssetProcessingJobStatus>('all');
  const [aiJobType, setAiJobType] = useState<'analysis' | 'transcript'>('analysis');
  const [unmatchedStatsMatchType, setUnmatchedStatsMatchType] =
    useState<ContentAssetUnmatchedStatsMatchTypeFilter>('all');
  const [unmatchedBindTargetAssetId, setUnmatchedBindTargetAssetId] = useState<string | null>(null);

  const queryParams = useMemo<ContentAssetQueryParams>(
    () => ({
      keyword,
      platform,
      productName,
      creatorName,
      ownerUserId,
      videoType,
      contentScene,
      contentSceneGroup,
      contentSceneSubtype,
      tags,
      assetStatus,
      lifecycleStatus,
      todo,
      externalOnly: externalOnly === 'all' ? undefined : externalOnly === 'true',
      page,
      pageSize,
      sort,
    }),
    [
      assetStatus,
      creatorName,
      contentScene,
      contentSceneGroup,
      contentSceneSubtype,
      externalOnly,
      keyword,
      lifecycleStatus,
      ownerUserId,
      page,
      pageSize,
      platform,
      productName,
      sort,
      tags,
      todo,
      videoType,
    ]
  );

  const videoProcessingJobsQuery = useMemo<ContentAssetProcessingJobQueryParams>(
    () => ({
      limit: 30,
      status: videoJobStatus === 'all' ? undefined : videoJobStatus,
      jobType: videoJobType === 'all' ? undefined : videoJobType,
    }),
    [videoJobStatus, videoJobType]
  );

  const aiProcessingJobsQuery = useMemo<ContentAssetProcessingJobQueryParams>(
    () => ({
      limit: 50,
      status: aiJobStatus === 'all' ? undefined : aiJobStatus,
      jobType: aiJobType,
    }),
    [aiJobStatus, aiJobType]
  );

  const assetProcessingJobsQuery = useMemo<ContentAssetProcessingJobQueryParams>(
    () => ({
      limit: 100,
    }),
    []
  );

  const unmatchedStatsQuery = useMemo<ContentAssetUnmatchedStatsQueryParams>(
    () => ({
      limit: 50,
      matchType: unmatchedStatsMatchType === 'all' ? undefined : unmatchedStatsMatchType,
    }),
    [unmatchedStatsMatchType]
  );

  const applySearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
    setActiveModule('assets');
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setPlatform(undefined);
    setProductName(undefined);
    setCreatorName(undefined);
    setOwnerUserId(undefined);
    setVideoType(undefined);
    setContentScene(undefined);
    setContentSceneGroup(undefined);
    setContentSceneSubtype(undefined);
    setTags([]);
    setAssetStatus(undefined);
    setLifecycleStatus(undefined);
    setTodo(undefined);
    setExternalOnly('all');
    setSort('recommended');
    setPage(1);
  };

  const updatePlatform = (value: string | undefined) => { setPlatform(value); setPage(1); };
  const updateProductName = (value: string | undefined) => { setProductName(value); setPage(1); };
  const updateCreatorName = (value: string | undefined) => { setCreatorName(value); setPage(1); };
  const updateOwnerUserId = (value: string | undefined) => { setOwnerUserId(value); setPage(1); };
  const updateVideoType = (value: string | undefined) => {
    const normalized = normalizeContentAssetVideoTypeValue(value) || undefined;
    setVideoType(normalized);
    if (!isContentAssetSceneVideoType(normalized)) {
      setContentScene(undefined);
      setContentSceneGroup(undefined);
      setContentSceneSubtype(undefined);
    }
    setPage(1);
  };
  const updateContentScene = (value: string | undefined) => {
    if (value && videoType && !isContentAssetSceneVideoType(videoType)) setVideoType(undefined);
    setContentScene(value);
    setPage(1);
  };
  const updateContentSceneGroup = (value: string | undefined) => {
    if (value && videoType && !isContentAssetSceneVideoType(videoType)) setVideoType(undefined);
    setContentSceneGroup(value);
    setPage(1);
  };
  const updateContentSceneSubtype = (value: string | undefined) => {
    if (value && videoType && !isContentAssetSceneVideoType(videoType)) setVideoType(undefined);
    setContentSceneSubtype(value);
    setPage(1);
  };
  const updateTags = (value: string[]) => { setTags(value); setPage(1); };
  const updateAssetStatus = (value: string | undefined) => { setAssetStatus(value); setPage(1); };
  const updateLifecycleStatus = (value: string | undefined) => { setLifecycleStatus(value); setPage(1); };
  const updateTodo = (value: ContentAssetTodoFilter | undefined) => { setTodo(value); setPage(1); };
  const updateExternalOnly = (value: 'all' | 'true' | 'false') => { setExternalOnly(value); setPage(1); };

  const openAssetsWithTodo = (value: ContentAssetTodoFilter) => {
    openAssetsWithPreset({ todo: value });
  };

  const openAssetsWithPreset = (preset: AssetListPreset) => {
    setExternalOnly(preset.externalOnly ?? 'all');
    setAssetStatus(preset.assetStatus);
    setLifecycleStatus(preset.lifecycleStatus);
    setTodo(preset.todo);
    setPage(1);
    setActiveModule('assets');
  };

  return {
    activeModule,
    keywordInput,
    platform,
    productName,
    creatorName,
    ownerUserId,
    videoType,
    contentScene,
    contentSceneGroup,
    contentSceneSubtype,
    tags,
    assetStatus,
    lifecycleStatus,
    todo,
    externalOnly,
    sort,
    view,
    page,
    pageSize,
    videoJobStatus,
    videoJobType,
    aiJobStatus,
    aiJobType,
    unmatchedStatsMatchType,
    unmatchedBindTargetAssetId,
    queryParams,
    videoProcessingJobsQuery,
    aiProcessingJobsQuery,
    assetProcessingJobsQuery,
    unmatchedStatsQuery,
    applySearch,
    resetFilters,
    updatePlatform,
    updateProductName,
    updateCreatorName,
    updateOwnerUserId,
    updateVideoType,
    updateContentScene,
    updateContentSceneGroup,
    updateContentSceneSubtype,
    updateTags,
    updateAssetStatus,
    updateLifecycleStatus,
    updateTodo,
    updateExternalOnly,
    openAssetsWithTodo,
    openAssetsWithPreset,
    setActiveModule,
    setKeywordInput,
    setSort,
    setView,
    setPage,
    setPageSize,
    setVideoJobStatus,
    setVideoJobType,
    setAiJobStatus,
    setAiJobType,
    setUnmatchedStatsMatchType,
    setUnmatchedBindTargetAssetId,
  };
}
