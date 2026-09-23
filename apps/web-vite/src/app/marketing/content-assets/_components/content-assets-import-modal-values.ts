import type {
  ContentAssetFilterOptions,
  ContentAssetUploadMutationPayload,
} from '../_lib/content-assets-types';
import { normalizeContentAssetTagList } from '../_lib/content-assets-tags';
import {
  normalizeContentAssetVideoTypeValue,
  normalizeContentAssetProductName,
  scenePayloadFromContentAssetPath,
} from '../_lib/content-assets-ui-helpers';

export type UploadFormValues = {
  title?: string;
  videoType?: string;
  scenePath?: string[];
  contentScene?: string;
  contentSceneGroup?: string;
  contentSceneSubtype?: string;
  platformNames?: string[];
  externalUrl?: string;
  externalVideoId?: string;
  externalItemId?: string;
  externalNoteId?: string;
  productNames?: string[];
  skuNames?: string[];
  creatorName?: string;
  creatorDouyinId?: string;
  ownerUserId?: string;
  ownerName?: string;
  tags?: string[];
  notes?: string;
};

export type ContentAssetUploadPrefill = {
  materialIdCandidates?: string[];
  notice: string | null;
  requiresMaterialConfirmation: boolean;
  source: string | null;
  values: UploadFormValues;
};

export type PlainSelectOption = {
  label: string;
  value: string;
  searchText: string;
};

export type OwnerSelectOption = PlainSelectOption & {
  displayName: string;
};

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'];

export const CONTENT_ASSET_UPLOAD_PREFILL_QUERY_KEYS = [
  'upload',
  'source',
  'from',
  'videoId',
  'materialId',
  'materialIdCandidate',
  'title',
  'product',
  'productName',
  'creator',
  'creatorName',
  'creatorDouyinId',
  'douyinId',
  'videoType',
  'contentScene',
  'scene',
  'contentSceneGroup',
  'sceneGroup',
  'contentSceneSubtype',
  'sceneSubtype',
  'statDate',
] as const;

export function buildUploadMetadataPayload(
  values: UploadFormValues,
  ownerOptions: OwnerSelectOption[]
): Pick<ContentAssetUploadMutationPayload, 'metadata' | 'platformVideo'> {
  const productNames = normalizeProductNameList(values.productNames);
  const skuNames = normalizeStringList(values.skuNames);
  const platformNames = normalizePlatformNameList(values.platformNames);
  const ownerUserId = emptyToNull(values.ownerUserId);
  const scenePayload = scenePayloadFromContentAssetPath(values.videoType, scenePathFromUploadValues(values));
  return {
    metadata: {
      title: values.title,
      videoType: emptyToNull(values.videoType),
      ...scenePayload,
      platform: platformNames[0] || null,
      platformNames,
      productName: productNames.join(' / ') || null,
      productNames,
      skuNames,
      creatorName: values.creatorName,
      ownerUserId,
      ownerName: ownerUserId ? resolveOwnerDisplayName(ownerUserId, ownerOptions) : null,
      tags: normalizeContentAssetTagList(values.tags),
      notes: values.notes,
    },
    platformVideo: platformVideoPayloadFromUploadValues(values),
  };
}

export function getFileExt(fileName: string): string {
  return fileName.split('.').pop()?.trim().toLowerCase() || '';
}

export function inferTitle(fileName: string): string {
  const lastSegment = fileName.split('/').pop() || fileName;
  const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').trim() || '未命名素材';
}

export function emptyToNull(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function buildPlainSelectOptions(values: string[]): PlainSelectOption[] {
  return normalizeStringList(values).map((value) => ({
    label: value,
    value,
    searchText: value,
  }));
}

export function buildOwnerSelectOptions(filterOptions: ContentAssetFilterOptions): OwnerSelectOption[] {
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

export function buildContentAssetUploadPrefillFromSearch(search: string): ContentAssetUploadPrefill | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (!shouldOpenUploadPrefill(params)) {
    return null;
  }

  const source = readFirstSearchParam(params, 'source', 'from');
  const externalVideoId = readFirstSearchParam(params, 'videoId');
  const externalItemId = readFirstSearchParam(params, 'materialId');
  const materialIdCandidates = normalizeStringList(params.getAll('materialIdCandidate')).slice(0, 10);
  const title = readFirstSearchParam(params, 'title');
  const productNames = normalizePrefillProductNames([
    ...params.getAll('productName'),
    ...params.getAll('product'),
  ]);
  const videoType = normalizeContentAssetVideoTypeValue(readFirstSearchParam(params, 'videoType'));
  const contentScene = readFirstSearchParam(params, 'contentScene', 'scene');
  const contentSceneGroup = readFirstSearchParam(params, 'contentSceneGroup', 'sceneGroup');
  const contentSceneSubtype = readFirstSearchParam(params, 'contentSceneSubtype', 'sceneSubtype');
  const scenePath = [contentScene, contentSceneGroup, contentSceneSubtype]
    .filter((value): value is string => Boolean(value));
  const creatorName = readFirstSearchParam(params, 'creatorName', 'creator');
  const creatorDouyinId = readFirstSearchParam(params, 'creatorDouyinId', 'douyinId');
  const platformNames = externalVideoId || externalItemId || materialIdCandidates.length || source === 'creator-short-video'
    ? ensureDouyinPlatform()
    : undefined;
  const values: UploadFormValues = {
    title: title || undefined,
    productNames: productNames.length ? productNames : undefined,
    platformNames,
    externalVideoId: externalVideoId || undefined,
    externalItemId: externalItemId || undefined,
    creatorName: creatorName || undefined,
    creatorDouyinId: creatorDouyinId || undefined,
    videoType: videoType || undefined,
    contentScene: contentScene || undefined,
    contentSceneGroup: contentSceneGroup || undefined,
    contentSceneSubtype: contentSceneSubtype || undefined,
    scenePath: scenePath.length ? scenePath : undefined,
  };

  return {
    notice: buildContentAssetUploadPrefillNotice({
      source,
      externalVideoId,
      externalItemId,
      materialIdCandidates,
      creatorDouyinId,
      statDate: readFirstSearchParam(params, 'statDate'),
    }),
    materialIdCandidates,
    requiresMaterialConfirmation: Boolean(externalItemId),
    source,
    values,
  };
}

export function ensureDouyinPlatform(values?: string[]): string[] {
  const normalized = normalizePlatformNameList(values);
  if (normalized.some((value) => value.toLowerCase() === 'douyin' || value === '抖音')) {
    return normalized;
  }
  return ['douyin', ...normalized].slice(0, 10);
}

function shouldOpenUploadPrefill(params: URLSearchParams): boolean {
  const upload = params.get('upload')?.trim().toLowerCase();
  return upload === '1' || upload === 'true' || upload === 'video';
}

function readFirstSearchParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    for (const value of params.getAll(key)) {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function normalizePrefillProductNames(values: string[]): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const productName = normalizeContentAssetProductName(value);
    if (!productName) continue;
    if (normalized.some((existing) => existing.toLowerCase() === productName.toLowerCase())) continue;
    normalized.push(productName);
  }

  return normalized.slice(0, 10);
}

function buildContentAssetUploadPrefillNotice({
  source,
  externalVideoId,
  externalItemId,
  materialIdCandidates,
  creatorDouyinId,
  statDate,
}: {
  source: string | null;
  externalVideoId: string | null;
  externalItemId: string | null;
  materialIdCandidates: string[];
  creatorDouyinId: string | null;
  statDate: string | null;
}): string | null {
  if (source !== 'creator-short-video') {
    return null;
  }

  const idSummary = [
    externalVideoId ? `抖音视频ID ${externalVideoId}` : null,
    externalItemId ? `千川素材ID ${externalItemId}` : null,
  ].filter(Boolean).join(' / ');
  const materialCandidateNotice = buildMaterialIdCandidateNotice(materialIdCandidates);
  const contextSummary = [
    statDate ? `日期 ${statDate}` : null,
    creatorDouyinId ? `达人抖音号 ${creatorDouyinId}` : null,
  ].filter(Boolean).join('，');
  return [
    '已从短视频看板带入当前行信息。',
    idSummary ? `已带入：${idSummary}。` : null,
    materialCandidateNotice,
    contextSummary ? `参考：${contextSummary}。` : null,
    '请核对后上传；保存后会通过视频ID/千川素材ID回流到短视频明细。',
  ].filter(Boolean).join('');
}

function buildMaterialIdCandidateNotice(materialIds: string[]): string | null {
  const normalized = normalizeStringList(materialIds);
  if (normalized.length <= 1) {
    return null;
  }

  const visibleIds = normalized.slice(0, 3).join('、');
  const suffix = normalized.length > 3 ? ` 等 ${normalized.length} 个` : '';
  return `短视频明细命中多个千川素材 ID：${visibleIds}${suffix}。系统不会自动预填，请业务核对后手动填写。`;
}

export function resolveOwnerDisplayName(ownerUserId: string, options: OwnerSelectOption[]): string | null {
  return options.find((option) => option.value === ownerUserId)?.displayName || ownerUserId || null;
}

function normalizeStringList(values?: string[]): string[] {
  const normalized: string[] = [];
  for (const value of values || []) {
    const item = value.trim();
    if (!item) continue;
    if (normalized.some((existing) => existing.toLowerCase() === item.toLowerCase())) continue;
    normalized.push(item);
  }
  return normalized;
}

function normalizePlatformNameList(values?: string[]): string[] {
  return normalizeStringList(values).slice(0, 10);
}

function normalizeProductNameList(values?: string[]): string[] {
  const normalized: string[] = [];
  for (const value of values || []) {
    const item = normalizeContentAssetProductName(value);
    if (!item) continue;
    if (normalized.some((existing) => existing.toLowerCase() === item.toLowerCase())) continue;
    normalized.push(item);
  }
  return normalized;
}

function scenePathFromUploadValues(values: UploadFormValues): string[] | undefined {
  const path = values.scenePath?.length
    ? values.scenePath
    : [values.contentScene, values.contentSceneGroup, values.contentSceneSubtype];
  const normalized = path
    ?.map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return normalized?.length ? normalized : undefined;
}

function platformVideoPayloadFromUploadValues(values: UploadFormValues) {
  const externalVideoId = emptyToNull(values.externalVideoId);
  const externalItemId = emptyToNull(values.externalItemId);
  const externalNoteId = emptyToNull(values.externalNoteId);
  const externalUrl = emptyToNull(values.externalUrl);
  if (!externalVideoId && !externalItemId && !externalNoteId && !externalUrl) return null;
  const platformNames = normalizePlatformNameList(values.platformNames);
  return {
    platform: platformNames[0] || '',
    accountId: emptyToNull(values.creatorDouyinId),
    accountName: emptyToNull(values.creatorName),
    externalVideoId,
    externalItemId,
    externalNoteId,
    externalUrl,
    publishTitle: emptyToNull(values.title),
    publishStatus: 'unknown',
  };
}
