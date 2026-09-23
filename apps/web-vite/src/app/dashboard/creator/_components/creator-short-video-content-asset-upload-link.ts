import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { normalizeShortVideoArrayValues } from './creator-short-video-array-values';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';

const MAX_SHORT_VIDEO_UPLOAD_PARAM_LENGTH = 180;

function normalizeUploadParam(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > MAX_SHORT_VIDEO_UPLOAD_PARAM_LENGTH
    ? normalized.slice(0, MAX_SHORT_VIDEO_UPLOAD_PARAM_LENGTH)
    : normalized;
}

function firstUploadParamValue(...values: unknown[]): string | null {
  for (const value of values) {
    const normalizedValues = normalizeShortVideoArrayValues(value);
    const normalized = normalizeUploadParam(normalizedValues[0] ?? value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function uniqueUploadParamValues(value: unknown): string[] {
  const normalizedValues = normalizeShortVideoArrayValues(value)
    .map(normalizeUploadParam)
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(normalizedValues));
}

function appendUploadParam(params: URLSearchParams, key: string, value: unknown): void {
  const normalized = normalizeUploadParam(value);
  if (normalized) {
    params.set(key, normalized);
  }
}

function appendUploadParamList(
  params: URLSearchParams,
  key: string,
  values: unknown,
  maxItems: number
): void {
  const normalizedValues = normalizeShortVideoArrayValues(values)
    .map(normalizeUploadParam)
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems);

  for (const value of normalizedValues) {
    params.append(key, value);
  }
}

export function buildShortVideoContentAssetUploadPath(row?: CreatorShortVideoDetailRow | null): string {
  const params = new URLSearchParams({
    upload: '1',
    source: 'creator-short-video',
  });

  if (!row) {
    return `${ROUTE_PATHS.marketingContentAssets}?${params.toString()}`;
  }

  appendUploadParam(params, 'videoId', row.video_id);
  const materialIdCandidates = uniqueUploadParamValues(row.qianchuan_material_ids);
  if (materialIdCandidates.length === 1) {
    appendUploadParam(params, 'materialId', materialIdCandidates[0]);
  } else if (materialIdCandidates.length > 1) {
    appendUploadParamList(params, 'materialIdCandidate', materialIdCandidates, 10);
  } else {
    appendUploadParam(params, 'materialId', firstUploadParamValue(row.qianchuan_material_key));
  }
  appendUploadParam(
    params,
    'title',
    firstUploadParamValue(row.video_title, row.qianchuan_material_video_names)
  );
  appendUploadParamList(params, 'productName', row.asset_product_names, 3);
  appendUploadParam(params, 'creatorName', firstUploadParamValue(row.author_nickname, row.author_name_snapshot, row.influencer_name));
  appendUploadParam(params, 'creatorDouyinId', row.author_douyin_id);
  appendUploadParam(params, 'videoType', firstUploadParamValue(row.asset_video_types));
  appendUploadParam(params, 'contentScene', firstUploadParamValue(row.asset_content_scenes));
  appendUploadParam(params, 'contentSceneGroup', firstUploadParamValue(row.asset_content_scene_groups));
  appendUploadParam(params, 'contentSceneSubtype', firstUploadParamValue(row.asset_content_scene_subtypes));
  appendUploadParam(params, 'statDate', row.stat_date);

  return `${ROUTE_PATHS.marketingContentAssets}?${params.toString()}`;
}
