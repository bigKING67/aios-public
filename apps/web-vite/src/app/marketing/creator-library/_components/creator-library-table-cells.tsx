import { Tag, Tooltip } from 'antd';
import sharedStyles from '../creator-library-shared.module.css';
import tableStyles from '../creator-library-table.module.css';
import { formatOptionalText } from '../_lib/creator-library-formatters';
import {
  formatCreatorAnchorLevel,
  resolveCreatorAnchorLevelTone,
} from '../_lib/creator-library-levels';
import {
  formatCooperationStatusLabel,
  normalizePlatformLabel,
  resolveCooperationStatusTone,
  resolveDisplayCooperationStatus,
  resolvePlatformTone,
} from '../_lib/creator-library-options';
import { resolveCreatorDisplayTags } from '../_lib/creator-library-tags';
import type { CreatorLibraryItem } from '../_lib/creator-library-types';

export function renderCreatorTags(record: CreatorLibraryItem) {
  const tags = resolveCreatorDisplayTags(record);
  return (
    <div className={tableStyles.tagList}>
      {tags.slice(0, 3).map((tag) => (
        <Tag key={tag}>{tag}</Tag>
      ))}
      {!tags.length ? <span className={tableStyles.emptyText}>--</span> : null}
    </div>
  );
}

export function renderPlatformTag(value: string) {
  return (
    <span className={`${tableStyles.platformTag} ${resolvePlatformClassName(value)}`}>
      {normalizePlatformLabel(value)}
    </span>
  );
}

export function renderCreatorLevelTag(value?: string | null) {
  return (
    <span className={`${tableStyles.levelTag} ${resolveLevelClassName(value)}`}>
      {formatCreatorAnchorLevel(value)}
    </span>
  );
}

export function renderCooperationStatusTag(record: CreatorLibraryItem) {
  const displayStatus = resolveDisplayCooperationStatus(record);
  return (
    <Tag className={resolveStatusClassName(displayStatus)}>
      {formatCooperationStatusLabel(displayStatus)}
    </Tag>
  );
}

export function renderFollowLogCount(value?: number | null): string {
  const count = Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
  return count > 0 ? `${count} 条记录` : '无记录';
}

export function renderDescriptionText(value?: string | null) {
  const text = value?.trim();
  return (
    <Tooltip title={text || undefined}>
      <span className={tableStyles.descriptionText}>{formatOptionalText(text)}</span>
    </Tooltip>
  );
}

function resolvePlatformClassName(value: string): string {
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

function resolveLevelClassName(value?: string | null): string {
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

function resolveStatusClassName(status: string): string {
  const tone = resolveCooperationStatusTone(status);
  switch (tone) {
    case 'initialContact':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneInitial}`;
    case 'sampleNegotiation':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneSample}`;
    case 'notConsidering':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneNotConsidering}`;
    case 'paused':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationTonePaused}`;
    case 'liveStarted':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneLiveStarted}`;
    case 'blacklist':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneBlacklist}`;
    case 'notCooperable':
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneNotCooperable}`;
    default:
      return `${tableStyles.statusTag} ${sharedStyles.cooperationToneUnclassified}`;
  }
}
