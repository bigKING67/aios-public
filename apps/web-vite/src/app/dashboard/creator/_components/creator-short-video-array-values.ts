import type {
  CreatorShortVideoAssetArrayFieldKey,
  CreatorShortVideoDetailRow,
} from './creator-short-video-dashboard-types';

const SHORT_VIDEO_ASSET_VIDEO_TYPE_LABELS = {
  kol_seeding_video: 'KOL种草视频',
  koc_seeding_video: 'KOC种草',
  koc_shoppable_video: 'KOC挂车视频',
  store_live_video: '店播视频',
} as const;

const SHORT_VIDEO_ASSET_VIDEO_TYPE_ALIASES: Record<string, keyof typeof SHORT_VIDEO_ASSET_VIDEO_TYPE_LABELS> = {
  kolseedingvideo: 'kol_seeding_video',
  'kol种草视频': 'kol_seeding_video',
  kocseedingvideo: 'koc_seeding_video',
  'koc种草': 'koc_seeding_video',
  'koc种草视频': 'koc_seeding_video',
  kocshoppablevideo: 'koc_shoppable_video',
  'koc挂车视频': 'koc_shoppable_video',
  storelivevideo: 'store_live_video',
  店播视频: 'store_live_video',
};

export const CREATOR_SHORT_VIDEO_ASSET_ARRAY_FIELD_KEYS: readonly CreatorShortVideoAssetArrayFieldKey[] = [
  'asset_product_names',
  'asset_owner_names',
  'asset_owner_user_ids',
  'asset_video_types',
  'asset_content_scenes',
  'asset_content_scene_groups',
  'asset_content_scene_subtypes',
];

export function normalizeShortVideoArrayValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  const scalar = String(value ?? '').trim();
  return scalar ? [scalar] : [];
}

export function formatShortVideoAssetVideoType(value: unknown): string {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  const normalizedKey = normalizeShortVideoAssetVideoTypeKey(normalizedValue);
  return SHORT_VIDEO_ASSET_VIDEO_TYPE_LABELS[normalizedKey] ?? normalizedValue;
}

function normalizeShortVideoAssetVideoTypeKey(value: string): keyof typeof SHORT_VIDEO_ASSET_VIDEO_TYPE_LABELS {
  const compactKey = value.toLowerCase().replace(/[\s_-]+/g, '');
  return SHORT_VIDEO_ASSET_VIDEO_TYPE_ALIASES[compactKey]
    ?? (value.toLowerCase() as keyof typeof SHORT_VIDEO_ASSET_VIDEO_TYPE_LABELS);
}

export function formatShortVideoAssetVideoTypeValues(value: unknown): string[] {
  return Array.from(
    new Set(
      normalizeShortVideoArrayValues(value)
        .map(formatShortVideoAssetVideoType)
        .filter(Boolean)
    )
  );
}

export function compactShortVideoArrayValues(
  values: readonly unknown[] | null | undefined,
  fallback: string
): string[] {
  const normalizedValues = values
    ? normalizeShortVideoArrayValues(values)
    : [];

  return normalizedValues.length ? Array.from(new Set(normalizedValues)) : [fallback];
}

export function readFirstShortVideoDisplayValue(
  row: CreatorShortVideoDetailRow,
  sourceKeys: readonly string[]
): unknown {
  const record = row as unknown as Record<string, unknown>;
  for (const key of sourceKeys) {
    const value = record[key];
    if (normalizeShortVideoArrayValues(value).length) {
      return value;
    }
  }

  return null;
}
