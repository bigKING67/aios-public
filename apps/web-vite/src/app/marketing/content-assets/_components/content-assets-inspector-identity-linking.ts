import type {
  ContentAssetAdMaterial,
  ContentAssetPlatformVideo,
} from '../_lib/content-assets-types';

export interface PlatformVideoIndex {
  byId: Map<string, ContentAssetPlatformVideo>;
  byExternalVideoId: Map<string, ContentAssetPlatformVideo[]>;
  byExternalItemId: Map<string, ContentAssetPlatformVideo[]>;
}

export type AdMaterialPlatformVideoResolution =
  | {
      status: 'matched';
      platformVideo: ContentAssetPlatformVideo;
      matchBy: 'platformVideoId' | 'externalVideoId' | 'externalMaterialId';
    }
  | {
      status: 'ambiguous';
      candidates: ContentAssetPlatformVideo[];
      matchBy: 'externalVideoId' | 'externalMaterialId';
    }
  | {
      status: 'unmatched';
    };

export function buildPlatformVideoIndex(platformVideos: ContentAssetPlatformVideo[]): PlatformVideoIndex {
  const byId = new Map<string, ContentAssetPlatformVideo>();
  const byExternalVideoId = new Map<string, ContentAssetPlatformVideo[]>();
  const byExternalItemId = new Map<string, ContentAssetPlatformVideo[]>();
  for (const item of platformVideos) {
    byId.set(item.platformVideoId, item);
    addPlatformVideoCandidate(byExternalVideoId, item.externalVideoId, item);
    addPlatformVideoCandidate(byExternalItemId, item.externalItemId, item);
  }
  return { byId, byExternalVideoId, byExternalItemId };
}

export function resolveAdMaterialPlatformVideo(
  item: ContentAssetAdMaterial,
  index: PlatformVideoIndex
): AdMaterialPlatformVideoResolution {
  if (item.platformVideoId) {
    const platformVideo = index.byId.get(item.platformVideoId);
    if (platformVideo) return { status: 'matched', platformVideo, matchBy: 'platformVideoId' };
  }
  if (item.externalVideoId) {
    const externalVideoId = normalizedIdentityKey(item.externalVideoId);
    const resolution = resolvePlatformVideoCandidates(
      externalVideoId ? index.byExternalVideoId.get(externalVideoId) : undefined,
      'externalVideoId'
    );
    if (resolution.status !== 'unmatched') return resolution;
  }
  if (item.externalMaterialId && isQianchuanAdMaterial(item)) {
    const externalMaterialId = normalizedIdentityKey(item.externalMaterialId);
    const resolution = resolvePlatformVideoCandidates(
      externalMaterialId ? index.byExternalItemId.get(externalMaterialId) : undefined,
      'externalMaterialId'
    );
    if (resolution.status !== 'unmatched') return resolution;
  }
  return { status: 'unmatched' };
}

export function normalizedIdentityKey(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function isMaterialLinkedToPlatformVideo(
  material: ContentAssetAdMaterial,
  platformVideo: ContentAssetPlatformVideo
): boolean {
  if (material.platformVideoId === platformVideo.platformVideoId) return true;
  if (material.externalVideoId && material.externalVideoId === platformVideo.externalVideoId) return true;
  if (
    material.externalMaterialId
    && isQianchuanAdMaterial(material)
    && material.externalMaterialId === platformVideo.externalItemId
  ) return true;
  return false;
}

export function platformVideoPrimaryId(item: ContentAssetPlatformVideo): { label: string; value: string } {
  if (item.externalVideoId) return { label: '抖音视频ID', value: item.externalVideoId };
  if (item.externalItemId) return { label: '千川素材ID', value: item.externalItemId };
  if (item.externalNoteId) return { label: '小红书笔记ID', value: item.externalNoteId };
  return { label: '主 ID', value: '--' };
}

function addPlatformVideoCandidate(
  index: Map<string, ContentAssetPlatformVideo[]>,
  key: string | null | undefined,
  item: ContentAssetPlatformVideo
) {
  const normalizedKey = normalizedIdentityKey(key);
  if (!normalizedKey) return;
  const candidates = index.get(normalizedKey) || [];
  candidates.push(item);
  index.set(normalizedKey, candidates);
}

function resolvePlatformVideoCandidates(
  candidates: ContentAssetPlatformVideo[] | undefined,
  matchBy: 'externalVideoId' | 'externalMaterialId'
): AdMaterialPlatformVideoResolution {
  if (!candidates?.length) return { status: 'unmatched' };
  if (candidates.length === 1) {
    return { status: 'matched', platformVideo: candidates[0], matchBy };
  }
  return { status: 'ambiguous', candidates, matchBy };
}

function isQianchuanAdMaterial(material: ContentAssetAdMaterial): boolean {
  return material.adPlatform === 'qianchuan' || material.adPlatform === '千川';
}
