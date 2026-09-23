import type { ReactNode } from 'react';
import sharedStyles from '../creator-library-shared.module.css';
import {
  buildCreatorAnchorLevelOptions,
  resolveCreatorAnchorLevelTone,
} from '../_lib/creator-library-levels';
import {
  buildCooperationStatusOptionValues,
  buildPlatformOptionValues,
  buildPlainOptionValues,
  formatCooperationStatusLabel,
  resolveCooperationStatusTone,
  resolvePlatformTone,
} from '../_lib/creator-library-options';
import type { CreatorLibraryFilterOptions, CreatorLibraryItem } from '../_lib/creator-library-types';
import { normalizeCreatorTagKey } from '../_lib/creator-library-tags';

export function buildPlainOptions(values: string[]) {
  return buildPlainOptionValues(values).map((value) => ({
    label: value,
    value,
    searchText: value,
  }));
}

export function buildBdUserOptions(
  filterOptions: CreatorLibraryFilterOptions,
  item: CreatorLibraryItem | null
) {
  const options = filterOptions.bdUsers.map((user) => {
    const displayName = user.displayName || user.username || user.userId;
    return {
      label: displayName,
      value: user.userId,
      searchText: [displayName, user.username, user.userId, ...user.aliases]
        .filter(Boolean)
        .join(' '),
      displayName,
    };
  });
  if (item?.ownerUserId && !options.some((option) => option.value === item.ownerUserId)) {
    options.push({
      label: item.ownerName || item.ownerUserId,
      value: item.ownerUserId,
      searchText: [item.ownerName, item.ownerUserId].filter(Boolean).join(' '),
      displayName: item.ownerName || item.ownerUserId,
    });
  }
  return options;
}

export function renderAnchorTagOption(
  value: unknown,
  label: ReactNode,
  selectedValues: string[]
) {
  const optionValue = String(value ?? '');
  const checked = selectedValues.some(
    (selected) => normalizeCreatorTagKey(selected) === normalizeCreatorTagKey(optionValue)
  );
  return (
    <span className={sharedStyles.checkboxOption}>
      <span
        className={`${sharedStyles.checkboxOptionBox} ${
          checked ? sharedStyles.checkboxOptionBoxChecked : ''
        }`}
        aria-hidden
      />
      <span className={sharedStyles.checkboxOptionLabel}>{label}</span>
    </span>
  );
}

export function buildPlatformSelectOptions(values: string[], includeUnconfirmed = false) {
  return buildPlatformOptionValues(values, { includeUnconfirmed }).map((value) => ({
    label: (
      <span className={`${sharedStyles.optionPill} ${getPlatformToneClassName(value)}`}>{value}</span>
    ),
    value,
    searchText: value,
  }));
}

export function buildCooperationStatusSelectOptions(values: string[]) {
  return buildCooperationStatusOptionValues(values).map((value) => ({
    label: (
      <span className={`${sharedStyles.statusOptionPill} ${getCooperationToneClassName(value)}`}>
        {formatCooperationStatusLabel(value)}
      </span>
    ),
    value,
    searchText: `${value} ${formatCooperationStatusLabel(value)}`,
  }));
}

export function buildCreatorAnchorLevelSelectOptions(values?: string[]) {
  return buildCreatorAnchorLevelOptions(values).map((option) => ({
    ...option,
    label: (
      <span
        className={`${sharedStyles.levelOptionPill} ${getCreatorAnchorLevelToneClassName(option.value)}`}
      >
        {option.label}
      </span>
    ),
    value: option.value,
    searchText: option.label,
  }));
}

export function filterSelectOption(
  inputValue: string,
  option?: { value?: string | number | null; searchText?: string }
) {
  const keyword = inputValue.toLowerCase();
  const searchText = String(option?.searchText ?? option?.value ?? '').toLowerCase();
  return searchText.includes(keyword);
}

function getPlatformToneClassName(value: string): string {
  const tone = resolvePlatformTone(value);
  switch (tone) {
    case 'tmall':
      return sharedStyles.platformToneTmall;
    case 'douyin':
      return sharedStyles.platformToneDouyin;
    case 'xiaohongshu':
      return sharedStyles.platformToneXiaohongshu;
    case 'kuaishou':
      return sharedStyles.platformToneKuaishou;
    case 'jd':
      return sharedStyles.platformToneJd;
    case 'wechat':
      return sharedStyles.platformToneWechat;
    case 'multi':
      return sharedStyles.platformToneMulti;
    default:
      return sharedStyles.platformToneUnknown;
  }
}

function getCooperationToneClassName(value: string): string {
  const tone = resolveCooperationStatusTone(value);
  switch (tone) {
    case 'initialContact':
      return sharedStyles.cooperationToneInitial;
    case 'sampleNegotiation':
      return sharedStyles.cooperationToneSample;
    case 'notConsidering':
      return sharedStyles.cooperationToneNotConsidering;
    case 'paused':
      return sharedStyles.cooperationTonePaused;
    case 'liveStarted':
      return sharedStyles.cooperationToneLiveStarted;
    case 'blacklist':
      return sharedStyles.cooperationToneBlacklist;
    case 'notCooperable':
      return sharedStyles.cooperationToneNotCooperable;
    default:
      return sharedStyles.cooperationToneUnclassified;
  }
}

function getCreatorAnchorLevelToneClassName(value: string): string {
  const tone = resolveCreatorAnchorLevelTone(value);
  switch (tone) {
    case 's':
      return sharedStyles.levelToneS;
    case 'a':
      return sharedStyles.levelToneA;
    case 'b':
      return sharedStyles.levelToneB;
    case 'c':
      return sharedStyles.levelToneC;
    case 'd':
      return sharedStyles.levelToneD;
    default:
      return sharedStyles.levelToneUnknown;
  }
}
