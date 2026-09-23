import type {
  ContentAssetCoverageSummary,
  ContentAssetFilterOptions,
  ContentAssetItem,
  ContentAssetSummary,
  ContentAssetTodoFilter,
} from './content-assets-types';

export const CONTENT_ASSET_KOL_SEEDING_VIDEO_TYPE_VALUE = 'kol_seeding_video';
export const CONTENT_ASSET_KOC_SEEDING_VIDEO_TYPE_VALUE = 'koc_seeding_video';
export const CONTENT_ASSET_KOC_CART_VIDEO_TYPE_VALUE = 'koc_shoppable_video';
export const CONTENT_ASSET_STORE_LIVE_VIDEO_TYPE_VALUE = 'store_live_video';

export const CONTENT_ASSET_PRODUCT_OPTIONS = [
  '焕活精华（绿瓶）',
  '白金精华（白瓶60ml）',
  '发际线精华（20ml）',
  '洗发水（油头）',
  '洗发水（干头）',
] as const;

export type ContentAssetProductSceneFamily = 'serum' | 'shampoo';

const PRODUCT_SCENE_FAMILY_BY_PRODUCT: Record<
  typeof CONTENT_ASSET_PRODUCT_OPTIONS[number],
  ContentAssetProductSceneFamily
> = {
  '焕活精华（绿瓶）': 'serum',
  '白金精华（白瓶60ml）': 'serum',
  '发际线精华（20ml）': 'serum',
  '洗发水（油头）': 'shampoo',
  '洗发水（干头）': 'shampoo',
};

const PRODUCT_ALIASES: Record<string, string> = {
  '唤活精华（绿瓶）': '焕活精华（绿瓶）',
  小绿瓶: '焕活精华（绿瓶）',
  白金发际线20ml: '发际线精华（20ml）',
  白金发际线60ml: '白金精华（白瓶60ml）',
};

const PRODUCT_SEARCH_ALIASES = new Map<string, string[]>(
  CONTENT_ASSET_PRODUCT_OPTIONS.map((value) => [
    value,
    Object.entries(PRODUCT_ALIASES)
      .filter(([, canonical]) => canonical === value)
      .map(([alias]) => alias),
  ])
);

const VIDEO_TYPE_OPTIONS = [
  {
    value: CONTENT_ASSET_KOL_SEEDING_VIDEO_TYPE_VALUE,
    label: 'KOL种草视频',
    aliases: ['KOL种草视频', 'kol_seeding_video', 'kolSeedingVideo', 'kol seeding video'],
  },
  {
    value: CONTENT_ASSET_KOC_SEEDING_VIDEO_TYPE_VALUE,
    label: 'KOC种草',
    aliases: ['KOC种草', 'KOC种草视频', 'koc_seeding_video', 'kocSeedingVideo', 'koc seeding video'],
  },
  {
    value: CONTENT_ASSET_KOC_CART_VIDEO_TYPE_VALUE,
    label: 'KOC挂车视频',
    aliases: ['KOC挂车视频', 'koc_shoppable_video', 'kocShoppableVideo', 'koc shoppable video'],
  },
  {
    value: CONTENT_ASSET_STORE_LIVE_VIDEO_TYPE_VALUE,
    label: '店播视频',
    aliases: ['店播视频', 'store_live_video', 'storeLiveVideo', 'store live video'],
  },
] as const;

const CONTENT_ASSET_SCENE_GROUP_ALIASES: Record<string, string> = {
  '发量→脸型': '发量',
  '发际线→年轻感': '发际线',
  '头皮→面部紧致': '头皮',
};

export interface ContentAssetSceneCascaderOption {
  label: string;
  value: string;
  children?: ContentAssetSceneCascaderOption[];
}

export const CONTENT_ASSET_SHAMPOO_SCENE_OPTIONS: ContentAssetSceneCascaderOption[] = [
  {
    label: '原点场景',
    value: '原点场景',
    children: [
      {
        label: '头皮',
        value: '头皮',
        children: [
          { label: '油头扁塌', value: '油头扁塌' },
          { label: '敏感泛红', value: '敏感泛红' },
          { label: '防脱初尝者', value: '防脱初尝者' },
          { label: '干枯受损党', value: '干枯受损党' },
        ],
      },
    ],
  },
  {
    label: '拓展场景',
    value: '拓展场景',
    children: [
      {
        label: '孕期',
        value: '孕期',
        children: [
          { label: '产前预防', value: '产前预防' },
          { label: '产中维稳', value: '产中维稳' },
          { label: '产后修护', value: '产后修护' },
        ],
      },
    ],
  },
  {
    label: '联想场景',
    value: '联想场景',
    children: [
      {
        label: '定向',
        value: '定向',
        children: [
          { label: '重度脱发', value: '重度脱发' },
          { label: '植发犹豫', value: '植发犹豫' },
          { label: '成分进阶', value: '成分进阶' },
        ],
      },
    ],
  },
];

export const CONTENT_ASSET_SERUM_SCENE_OPTIONS: ContentAssetSceneCascaderOption[] = [
  {
    label: '原点场景',
    value: '原点场景',
    children: [
      {
        label: '变美',
        value: '变美',
        children: [
          { label: '职场/熬夜压力', value: '职场/熬夜压力' },
          { label: '细软塌', value: '细软塌' },
          { label: '发缝/发际线焦虑', value: '发缝/发际线焦虑' },
        ],
      },
    ],
  },
  {
    label: '拓展场景',
    value: '拓展场景',
    children: [
      {
        label: '孕期',
        value: '孕期',
        children: [
          { label: '产后脱发修护', value: '产后脱发修护' },
          { label: '哺乳期安全养护', value: '哺乳期安全养护' },
        ],
      },
    ],
  },
  {
    label: '联想场景',
    value: '联想场景',
    children: [
      {
        label: '定向',
        value: '定向',
        children: [
          { label: '医美替代', value: '医美替代' },
          { label: '男性脱发', value: '男性脱发' },
          { label: '头面部抗衰', value: '头面部抗衰' },
        ],
      },
    ],
  },
];

export const CONTENT_ASSET_SCENE_OPTIONS: ContentAssetSceneCascaderOption[] = [
  ...mergeContentAssetSceneOptions(CONTENT_ASSET_SHAMPOO_SCENE_OPTIONS, CONTENT_ASSET_SERUM_SCENE_OPTIONS),
];

export function createEmptyContentAssetSummary(): ContentAssetSummary {
  return {
    totalAssets: 0,
    readyAssets: 0,
    externalOnlyAssets: 0,
    pendingAssets: 0,
    failedAssets: 0,
    totalRawSizeBytes: 0,
    latestUpdatedAt: null,
  };
}

export function createEmptyContentAssetFilterOptions(): ContentAssetFilterOptions {
  return {
    platforms: [],
    products: [],
    skus: [],
    creators: [],
    ownerOptions: [],
    assetStatuses: [],
    lifecycleStatuses: [],
    videoTypes: [],
    contentScenes: [],
    contentSceneGroups: [],
    contentSceneSubtypes: [],
    tags: [],
  };
}

export function createEmptyContentAssetCoverage(): ContentAssetCoverageSummary {
  return {
    totalAssets: 0,
    readyAssets: 0,
    rawReadyAssets: 0,
    previewReadyAssets: 0,
    coverReadyAssets: 0,
    aiAnalyzedAssets: 0,
    transcriptReadyAssets: 0,
    platformBoundAssets: 0,
    adMaterialBoundAssets: 0,
    authorizationKnownAssets: 0,
    repurposeKnownAssets: 0,
    externalOnlyAssets: 0,
    pendingAssets: 0,
    failedAssets: 0,
    totalRawSizeBytes: 0,
    analysisFailedJobs: 0,
    transcriptFailedJobs: 0,
    latestUpdatedAt: null,
  };
}

export function createContentAssetCoverageFromSummary(summary: ContentAssetSummary): ContentAssetCoverageSummary {
  const rawReadyAssets = Math.max(summary.totalAssets - summary.externalOnlyAssets, 0);

  return {
    totalAssets: summary.totalAssets,
    readyAssets: summary.readyAssets,
    rawReadyAssets,
    previewReadyAssets: summary.readyAssets,
    coverReadyAssets: summary.readyAssets,
    aiAnalyzedAssets: 0,
    transcriptReadyAssets: 0,
    platformBoundAssets: 0,
    adMaterialBoundAssets: 0,
    authorizationKnownAssets: 0,
    repurposeKnownAssets: 0,
    externalOnlyAssets: summary.externalOnlyAssets,
    pendingAssets: summary.pendingAssets,
    failedAssets: summary.failedAssets,
    totalRawSizeBytes: summary.totalRawSizeBytes,
    analysisFailedJobs: 0,
    transcriptFailedJobs: 0,
    latestUpdatedAt: summary.latestUpdatedAt,
  };
}

export function toSelectOption(value: string) {
  return { label: value, value };
}

export function resolveContentAssetProductOptions(_values?: string[] | null) {
  return CONTENT_ASSET_PRODUCT_OPTIONS.map((value) => ({
    label: value,
    value,
    searchText: [value, ...(PRODUCT_SEARCH_ALIASES.get(value) || [])].join(' '),
  }));
}

export function normalizeContentAssetProductName(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) return null;
  const canonical = PRODUCT_ALIASES[trimmed] || trimmed;
  return CONTENT_ASSET_PRODUCT_OPTIONS.includes(canonical as typeof CONTENT_ASSET_PRODUCT_OPTIONS[number])
    ? canonical
    : null;
}

export function resolveContentAssetVideoTypeOptions(values?: string[] | null) {
  const options: Array<{ label: string; value: string }> = [
    ...VIDEO_TYPE_OPTIONS.map(({ label, value }) => ({ label, value })),
  ];
  for (const rawValue of values || []) {
    const value = normalizeContentAssetVideoTypeValue(rawValue);
    if (!value) continue;
    if (options.some((option) => option.value === value)) continue;
    options.push({
      label: contentAssetVideoTypeLabel(value),
      value,
    });
  }
  return options;
}

export function contentAssetVideoTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeContentAssetVideoTypeValue(value);
  if (!normalized) return '--';
  return VIDEO_TYPE_OPTIONS.find((option) => option.value === normalized)?.label || normalized;
}

export function normalizeContentAssetVideoTypeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const compact = trimmed
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
  const option = VIDEO_TYPE_OPTIONS.find((item) =>
    item.aliases.some((alias) => alias.replace(/[\s_-]+/g, '').toLowerCase() === compact)
  );
  return option?.value || null;
}

export function isContentAssetSceneVideoType(value: string | null | undefined): boolean {
  const normalized = normalizeContentAssetVideoTypeValue(value);
  return normalized === CONTENT_ASSET_KOL_SEEDING_VIDEO_TYPE_VALUE
    || normalized === CONTENT_ASSET_KOC_SEEDING_VIDEO_TYPE_VALUE
    || normalized === CONTENT_ASSET_KOC_CART_VIDEO_TYPE_VALUE
    || normalized === CONTENT_ASSET_STORE_LIVE_VIDEO_TYPE_VALUE;
}

export function isContentAssetSceneOptionsConfigured(): boolean {
  return CONTENT_ASSET_SCENE_OPTIONS.length > 0;
}

export function resolveContentAssetProductSceneFamily(
  values?: string | readonly (string | null | undefined)[] | null
): ContentAssetProductSceneFamily | null {
  const productNames = normalizeContentAssetProductNameList(values);
  if (productNames.length === 0) return null;
  const families = new Set<ContentAssetProductSceneFamily>();
  for (const productName of productNames) {
    families.add(PRODUCT_SCENE_FAMILY_BY_PRODUCT[productName]);
  }
  return families.size === 1 ? [...families][0] : null;
}

export function resolveContentAssetSceneOptionsForProducts(
  values?: string | readonly (string | null | undefined)[] | null
): ContentAssetSceneCascaderOption[] {
  const family = resolveContentAssetProductSceneFamily(values);
  if (family === 'shampoo') return CONTENT_ASSET_SHAMPOO_SCENE_OPTIONS;
  if (family === 'serum') return CONTENT_ASSET_SERUM_SCENE_OPTIONS;
  return [];
}

export function isContentAssetScenePathValidForProducts(
  path?: readonly (string | null | undefined)[] | null,
  products?: string | readonly (string | null | undefined)[] | null
): boolean {
  const normalizedPath = normalizeContentAssetScenePath(path);
  if (normalizedPath.length === 0) return true;
  const options = resolveContentAssetSceneOptionsForProducts(products);
  if (options.length === 0) return false;
  return contentAssetScenePathExists(normalizedPath, options);
}

export function scenePathFromContentAsset(asset: Pick<
  ContentAssetItem,
  'contentScene' | 'contentSceneGroup' | 'contentSceneSubtype'
>): string[] | undefined {
  const scene = normalizeOptionalText(asset.contentScene);
  if (!scene) return undefined;

  const path = [scene];
  const sceneGroup = normalizeContentAssetSceneGroupValue(asset.contentSceneGroup);
  const sceneSubtype = normalizeOptionalText(asset.contentSceneSubtype);
  if (sceneGroup) path.push(sceneGroup);
  if (sceneSubtype) path.push(sceneSubtype);

  return path.length > 0 ? path : undefined;
}

export function formatContentAssetScenePath(
  path?: readonly (string | null | undefined)[] | null
): string {
  const labels = (path || [])
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value));

  if (labels.length === 0) return '--';
  if (labels.length === 1) return labels[0];
  return `${labels[0]}｜${labels.slice(1).join(' › ')}`;
}

export function scenePayloadFromContentAssetPath(
  videoType: string | null | undefined,
  path?: string[] | null
): {
  contentScene: string | null;
  contentSceneGroup: string | null;
  contentSceneSubtype: string | null;
} {
  if (!isContentAssetSceneVideoType(videoType)) {
    return {
      contentScene: null,
      contentSceneGroup: null,
      contentSceneSubtype: null,
    };
  }

  return {
    contentScene: normalizeOptionalText(path?.[0]),
    contentSceneGroup: normalizeContentAssetSceneGroupValue(path?.[1]),
    contentSceneSubtype: normalizeOptionalText(path?.[2]),
  };
}

export function formatContentAssetSceneSummary(asset: Pick<
  ContentAssetItem,
  'contentScene' | 'contentSceneGroup' | 'contentSceneSubtype'
>): string {
  return formatContentAssetScenePath(scenePathFromContentAsset(asset));
}

export function contentAssetStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    ready: '已就绪',
    external_only: '待补源',
    uploading: '上传中',
    pending_processing: '待生成',
    processing: '处理中',
    failed: '失败',
    archived: '已归档',
  };
  return labels[value] || value;
}

export function profileStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    incomplete: '待补充',
    complete: '已完整',
    basic_complete: '基础完整',
    platform_bound: '已绑平台',
    performance_ready: '可回流',
    verified: '已核验',
  };
  return labels[value] || value;
}

export function lifecycleStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    active: '启用中',
    draft: '草稿',
    waiting_analysis: '待分析',
    testable: '可测试',
    testing: '投放测试',
    scaling: '已放量',
    repurpose: '待复剪',
    rejected: '已淘汰',
    expired: '授权到期',
  };
  return labels[value] || value;
}

export function contentAssetTodoFilterLabel(value: ContentAssetTodoFilter | string): string {
  const labels: Record<string, string> = {
    missing_ai: '待 AI 分析',
    missing_transcript: '待生成脚本',
    missing_platform_video: '待绑定视频 ID',
    missing_ad_material: '待绑定素材 ID',
    authorization_unknown: '授权待确认',
    repurpose_unknown: '复剪权限待确认',
  };
  return labels[value] || value;
}

export function authorizationStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    unknown: '待确认',
    authorized: '已授权',
    pending: '待授权',
    expired: '已过期',
    restricted: '受限制',
  };
  return labels[value] || value;
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeContentAssetProductNameList(
  values?: string | readonly (string | null | undefined)[] | null
): Array<typeof CONTENT_ASSET_PRODUCT_OPTIONS[number]> {
  const rawValues = Array.isArray(values) ? values : [values];
  const normalized: Array<typeof CONTENT_ASSET_PRODUCT_OPTIONS[number]> = [];
  for (const value of rawValues) {
    const productName = normalizeContentAssetProductName(value);
    if (!productName) continue;
    if (normalized.includes(productName as typeof CONTENT_ASSET_PRODUCT_OPTIONS[number])) continue;
    normalized.push(productName as typeof CONTENT_ASSET_PRODUCT_OPTIONS[number]);
  }
  return normalized;
}

function normalizeContentAssetScenePath(path?: readonly (string | null | undefined)[] | null): string[] {
  return (path || [])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function contentAssetScenePathExists(
  path: string[],
  options: ContentAssetSceneCascaderOption[]
): boolean {
  let currentOptions = options;
  for (const segment of path) {
    const matched = currentOptions.find((option) => option.value === segment);
    if (!matched) return false;
    currentOptions = matched.children || [];
  }
  return true;
}

function mergeContentAssetSceneOptions(
  ...optionGroups: ContentAssetSceneCascaderOption[][]
): ContentAssetSceneCascaderOption[] {
  const mergedOptions: ContentAssetSceneCascaderOption[] = [];
  for (const optionGroup of optionGroups) {
    for (const option of optionGroup) {
      const existingOption = mergedOptions.find((currentOption) => currentOption.value === option.value);
      if (!existingOption) {
        mergedOptions.push({
          label: option.label,
          value: option.value,
          children: option.children ? mergeContentAssetSceneOptions(option.children) : undefined,
        });
        continue;
      }
      if (option.children) {
        existingOption.children = mergeContentAssetSceneOptions(existingOption.children || [], option.children);
      }
    }
  }
  return mergedOptions;
}

function normalizeContentAssetSceneGroupValue(value?: string | null): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? CONTENT_ASSET_SCENE_GROUP_ALIASES[normalized] || normalized : null;
}

export function resolveContentAssetRequestError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '请求失败');
  }
  return '请求失败';
}
