import type {
  ContentAssetDetailResponse,
  ContentAssetFilterOptions,
  ContentAssetProfileUpdatePayload,
} from '../_lib/content-assets-types';
import { resolveContentAssetDisplayTitle } from '../_lib/content-assets-display';
import { normalizeContentAssetTagList } from '../_lib/content-assets-tags';
import {
  normalizeContentAssetProductName,
  scenePathFromContentAsset,
  scenePayloadFromContentAssetPath,
} from '../_lib/content-assets-ui-helpers';

export type NullableBooleanValue = 'unknown' | 'true' | 'false';

export interface ProfileFormValues {
  title: string;
  videoType?: string;
  scenePath?: string[];
  contentScene?: string;
  contentSceneGroup?: string;
  contentSceneSubtype?: string;
  platformNames?: string[];
  productNames?: string[];
  skuNames?: string[];
  creatorName?: string;
  ownerUserId?: string;
  ownerName?: string;
  tags?: string[];
  notes?: string;
  profileStatus: string;
  lifecycleStatus: string;
  authorizationStatus: string;
  commercialUseAllowed: NullableBooleanValue;
  repurposeAllowed: NullableBooleanValue;
  authorizationStartsAt?: string;
  authorizationExpiresAt?: string;
  authorizationNotes?: string;
}

export type PlainSelectOption = {
  label: string;
  value: string;
  searchText: string;
};

export type OwnerSelectOption = PlainSelectOption & {
  displayName: string;
};

export function itemToFormValues(asset: ContentAssetDetailResponse['asset']): ProfileFormValues {
  return {
    title: asset.title || resolveContentAssetDisplayTitle(asset),
    platformNames: normalizePlatformNameList(
      asset.platformNames?.length
        ? asset.platformNames
        : asset.platform
          ? [asset.platform]
          : undefined
    ),
    videoType: asset.videoType || undefined,
    scenePath: scenePathFromContentAsset(asset),
    contentScene: asset.contentScene || undefined,
    contentSceneGroup: asset.contentSceneGroup || undefined,
    contentSceneSubtype: asset.contentSceneSubtype || undefined,
    productNames: normalizeProductNameList(
      asset.productNames?.length
        ? asset.productNames
        : asset.productName
          ? [asset.productName]
          : undefined
    ),
    skuNames: asset.skuNames?.length ? asset.skuNames : undefined,
    creatorName: asset.creatorName || undefined,
    ownerUserId: asset.ownerUserId || undefined,
    ownerName: asset.ownerName || undefined,
    tags: normalizeContentAssetTagList(asset.tags),
    notes: asset.notes || undefined,
    profileStatus: asset.profileStatus || 'incomplete',
    lifecycleStatus: asset.lifecycleStatus || 'draft',
    authorizationStatus: asset.authorizationStatus || 'unknown',
    commercialUseAllowed: booleanToFormValue(asset.commercialUseAllowed),
    repurposeAllowed: booleanToFormValue(asset.repurposeAllowed),
    authorizationStartsAt: dateToInputValue(asset.authorizationStartsAt),
    authorizationExpiresAt: dateToInputValue(asset.authorizationExpiresAt),
    authorizationNotes: asset.authorizationNotes || undefined,
  };
}

export function detailToFormValues(detail: ContentAssetDetailResponse): ProfileFormValues {
  const values = itemToFormValues(detail.asset);
  const shortVideoHint = detail.shortVideoProfileHint ?? null;
  const platformFallbackNames = detail.platformVideos
    .map((item) => item.platform)
    .filter((value): value is string => Boolean(value));
  const creatorNameFallback = shortVideoHint?.creatorName
    || detail.platformVideos.find((item) => item.accountName)?.accountName
    || undefined;
  const scenePathFallback = shortVideoHintSceneSegments(shortVideoHint);
  const mergedScenePath = mergeScenePathFields(values.scenePath, scenePathFallback);

  return {
    ...values,
    platformNames: values.platformNames?.length
      ? values.platformNames
      : normalizePlatformNameList(platformFallbackNames),
    productNames: values.productNames?.length
      ? values.productNames
      : normalizeProductNameList(shortVideoHintProductNamesForPrefill(shortVideoHint)),
    creatorName: values.creatorName || creatorNameFallback,
    videoType: values.videoType || shortVideoHint?.videoType || undefined,
    scenePath: mergedScenePath,
    contentScene: values.contentScene || scenePathFallback[0] || undefined,
    contentSceneGroup: values.contentSceneGroup || scenePathFallback[1] || undefined,
    contentSceneSubtype: values.contentSceneSubtype || scenePathFallback[2] || undefined,
  };
}

export function formValuesToPayload(
  values: ProfileFormValues,
  ownerOptions: OwnerSelectOption[]
): ContentAssetProfileUpdatePayload {
  const productNames = normalizeProductNameList(values.productNames);
  const skuNames = normalizeStringList(values.skuNames);
  const platformNames = normalizePlatformNameList(values.platformNames);
  const ownerUserId = emptyToNull(values.ownerUserId);
  const scenePayload = scenePayloadFromContentAssetPath(values.videoType, scenePathFromProfileValues(values));
  return {
    title: values.title,
    platform: platformNames[0] || null,
    platformNames,
    videoType: emptyToNull(values.videoType),
    ...scenePayload,
    productName: productNames.join(' / ') || null,
    productNames,
    skuNames,
    creatorName: emptyToNull(values.creatorName),
    ownerUserId,
    ownerName: ownerUserId ? resolveOwnerDisplayName(ownerUserId, ownerOptions) : null,
    tags: normalizeContentAssetTagList(values.tags),
    notes: emptyToNull(values.notes),
    profileStatus: values.profileStatus,
    lifecycleStatus: values.lifecycleStatus,
    authorizationStatus: values.authorizationStatus,
    commercialUseAllowed: formValueToBoolean(values.commercialUseAllowed),
    repurposeAllowed: formValueToBoolean(values.repurposeAllowed),
    authorizationStartsAt: emptyToNull(values.authorizationStartsAt),
    authorizationExpiresAt: emptyToNull(values.authorizationExpiresAt),
    authorizationNotes: emptyToNull(values.authorizationNotes),
  };
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

export function buildOwnerSelectOptions(
  filterOptions: ContentAssetFilterOptions,
  asset: ContentAssetDetailResponse['asset'] | undefined
): OwnerSelectOption[] {
  const options = filterOptions.ownerOptions.map((owner) => {
    const displayName = owner.displayName || owner.username || owner.userId;
    return {
      label: owner.isManager ? `${displayName}（负责人）` : displayName,
      value: owner.userId,
      searchText: [displayName, owner.username, owner.userId, ...owner.roles].filter(Boolean).join(' '),
      displayName,
    };
  });
  if (asset?.ownerUserId && !options.some((option) => option.value === asset.ownerUserId)) {
    options.push({
      label: asset.ownerName || asset.ownerUserId,
      value: asset.ownerUserId,
      searchText: [asset.ownerName, asset.ownerUserId].filter(Boolean).join(' '),
      displayName: asset.ownerName || asset.ownerUserId,
    });
  }
  return options;
}

export function resolveOwnerDisplayName(ownerUserId: string, options: OwnerSelectOption[]): string | null {
  return options.find((option) => option.value === ownerUserId)?.displayName || ownerUserId || null;
}

function booleanToFormValue(value: boolean | null | undefined): NullableBooleanValue {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}

function formValueToBoolean(value: NullableBooleanValue): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function dateToInputValue(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
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

function scenePathFromProfileValues(values: ProfileFormValues): string[] | undefined {
  const path = values.scenePath?.length
    ? values.scenePath
    : [values.contentScene, values.contentSceneGroup, values.contentSceneSubtype];
  const normalized = path
    ?.map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return normalized?.length ? normalized : undefined;
}

function shortVideoHintSceneSegments(
  hint: ContentAssetDetailResponse['shortVideoProfileHint'] | null
): Array<string | undefined> {
  if (!hint) return [];
  return [hint.contentScene, hint.contentSceneGroup, hint.contentSceneSubtype]
    .map((value) => value?.trim())
    .map((value) => value || undefined);
}

function mergeScenePathFields(
  assetScenePath: string[] | undefined,
  hintScenePath: Array<string | undefined>
): string[] | undefined {
  const mergedFields = [0, 1, 2]
    .map((index) => assetScenePath?.[index]?.trim() || hintScenePath[index]);
  if (!mergedFields[0]) return undefined;

  const mergedPath: string[] = [];
  for (const value of mergedFields) {
    if (!value) break;
    mergedPath.push(value);
  }
  return mergedPath.length ? mergedPath : undefined;
}

function shortVideoHintProductNamesForPrefill(
  hint: ContentAssetDetailResponse['shortVideoProfileHint'] | null
): string[] | undefined {
  if (!hint) return undefined;
  const productNames = normalizeProductNameList(hint.productNames);
  if (hint.matchStatus === 'unique' || productNames.length <= 1) {
    return productNames;
  }
  return undefined;
}
