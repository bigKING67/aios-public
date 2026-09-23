import type { ContentAssetDetailResponse } from './content-assets-types';

export function resolveDouyinVideoIdSummary(detail: ContentAssetDetailResponse): string {
  return formatIdentitySummary([
    ...(detail.shortVideoProfileHint?.videoIds || []),
    ...detail.platformVideos
      .map((item) => item.externalVideoId)
      .filter((value): value is string => Boolean(value)),
    ...detail.adMaterials
      .map((item) => item.externalVideoId)
      .filter((value): value is string => Boolean(value)),
  ]);
}

export function resolveQianchuanMaterialIdSummary(detail: ContentAssetDetailResponse): string {
  return formatIdentitySummary([
    ...(detail.shortVideoProfileHint?.qianchuanMaterialIds || []),
    ...detail.platformVideos
      .map((item) => item.externalItemId)
      .filter((value): value is string => Boolean(value)),
    ...detail.adMaterials
      .map((item) => item.externalMaterialId)
      .filter((value): value is string => Boolean(value)),
  ]);
}

export function resolveCreatorNameSummary(detail: ContentAssetDetailResponse): string {
  return formatIdentitySummary([
    detail.asset.creatorName,
    detail.shortVideoProfileHint?.creatorName,
    ...detail.platformVideos.map((item) => item.accountName),
  ].filter((value): value is string => Boolean(value)));
}

export function resolveCreatorAccountIdSummary(detail: ContentAssetDetailResponse): string {
  return formatIdentitySummary([
    detail.shortVideoProfileHint?.creatorAccountId,
    ...detail.platformVideos.map((item) => item.accountId),
  ].filter((value): value is string => Boolean(value)));
}

function formatIdentitySummary(rawValues: string[]): string {
  const values = Array.from(new Set(rawValues.map((value) => value.trim()).filter(Boolean)));
  if (values.length === 0) return '--';
  return values.slice(0, 2).join(' / ') + (values.length > 2 ? ` 等 ${values.length} 个` : '');
}
