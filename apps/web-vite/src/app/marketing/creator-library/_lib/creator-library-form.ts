import type {
  CreatorLibraryFormValues,
  CreatorLibraryItem,
  CreatorLibraryPayload,
} from './creator-library-types';
import { normalizeCreatorAnchorLevel } from './creator-library-levels';
import {
  normalizePlatformLabel,
  NOT_COOPERABLE_STATUS_VALUE,
} from './creator-library-options';
import {
  normalizeCreatorTagList,
  resolveCreatorDisplayTags,
  splitCreatorTagText,
} from './creator-library-tags';

export function itemToFormValues(item: CreatorLibraryItem): CreatorLibraryFormValues {
  return {
    platform: normalizePlatformLabel(item.platform),
    influencerName: item.influencerName,
    influencerId: item.influencerId || undefined,
    douyinHandle: item.douyinHandle || undefined,
    phone: item.phone || undefined,
    mcn: item.mcn || undefined,
    category: item.category || undefined,
    anchorDesc: item.anchorDesc || undefined,
    anchorLevel: normalizeCreatorAnchorLevel(item.anchorLevel),
    mainPlatformFans: item.mainPlatformFans || undefined,
    sales30d: item.sales30d || undefined,
    sales90d: item.sales90d || undefined,
    tags: resolveCreatorDisplayTags(item),
    cooperationStatus: item.isCooperable
      ? item.cooperationStatus || undefined
      : NOT_COOPERABLE_STATUS_VALUE,
    cooperationDesc: item.cooperationDesc || undefined,
    ownerName: item.ownerName || undefined,
    ownerUserId: item.ownerUserId || undefined,
    isCooperable: item.isCooperable,
  };
}

export function formValuesToPayload(values: CreatorLibraryFormValues): CreatorLibraryPayload {
  const tags = normalizeCreatorTagList(values.tags);
  const anchorDesc = values.anchorDesc || (tags.length ? tags.join('、') : undefined);
  const normalizedAnchorTags = tags.length ? tags : splitCreatorTagText(values.anchorDesc);

  return {
    platform: normalizePlatformLabel(values.platform),
    influencer_name: values.influencerName || '',
    influencer_id: values.influencerId,
    douyin_handle: values.douyinHandle,
    phone: values.phone,
    mcn: values.mcn,
    category: values.category,
    anchor_desc: normalizedAnchorTags.length ? normalizedAnchorTags.join('、') : anchorDesc,
    anchor_level: normalizeCreatorAnchorLevel(values.anchorLevel),
    main_platform_fans: values.mainPlatformFans,
    sales_30d: values.sales30d,
    sales_90d: values.sales90d,
    tags: normalizedAnchorTags,
    cooperation_status:
      values.isCooperable === false ? NOT_COOPERABLE_STATUS_VALUE : values.cooperationStatus,
    cooperation_desc: values.cooperationDesc,
    owner_name: values.ownerName,
    owner_user_id: values.ownerUserId,
    is_cooperable: values.isCooperable ?? true,
    expected_updated_at: undefined,
    updated_at: undefined,
  };
}

export function withCreatorUpdateVersion(
  payload: CreatorLibraryPayload,
  item: CreatorLibraryItem
): CreatorLibraryPayload {
  return {
    ...payload,
    expected_updated_at: item.updatedAt,
  };
}
