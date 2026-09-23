import { UNCLASSIFIED_STATUS_VALUE } from '../_lib/creator-library-options';
import type { CreatorLibraryFormValues } from '../_lib/creator-library-types';
import {
  normalizeCreatorTagKey,
  normalizeCreatorTagList,
  normalizeCreatorTagText,
} from '../_lib/creator-library-tags';

export const DEFAULT_NEW_CREATOR_VALUES: Partial<CreatorLibraryFormValues> = {
  platform: undefined,
  influencerName: undefined,
  influencerId: undefined,
  douyinHandle: undefined,
  phone: undefined,
  mcn: undefined,
  category: undefined,
  anchorDesc: undefined,
  anchorLevel: undefined,
  mainPlatformFans: undefined,
  sales30d: undefined,
  sales90d: undefined,
  tags: [],
  cooperationStatus: UNCLASSIFIED_STATUS_VALUE,
  cooperationDesc: undefined,
  ownerName: undefined,
  ownerUserId: undefined,
  isCooperable: true,
};

export function normalizeFormTagValues(value: unknown): string[] {
  return normalizeCreatorTagList(value);
}

export function findExistingTag(rawTag: string, existingTags: string[]): string | null {
  const normalizedRawTag = normalizeCreatorTagText(rawTag);
  if (!normalizedRawTag) {
    return null;
  }
  const targetKey = normalizeCreatorTagKey(normalizedRawTag);
  return existingTags.find((tag) => normalizeCreatorTagKey(tag) === targetKey) || null;
}

export function normalizeOptionalFormText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}
