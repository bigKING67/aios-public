import { type FormEvent, useState } from 'react';
import { Button, Input } from '@lobehub/ui';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { RotateCw, Search } from 'lucide-react';
import sharedStyles from '../creator-library-shared.module.css';
import styles from './creator-library-filters.module.css';
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
import type { CreatorLibraryFilterOptions, CreatorLibraryFilters } from '../_lib/creator-library-types';

interface CreatorLibraryFiltersProps {
  filters: CreatorLibraryFilters;
  filterOptions: CreatorLibraryFilterOptions;
  onSearch: (filters: CreatorLibraryFilters) => void;
  onReset: () => void;
}

const FANS_BAND_OPTIONS = [
  { value: 'lt_10w', label: '< 10万' },
  { value: '10w_50w', label: '10万 - 50万' },
  { value: '50w_100w', label: '50万 - 100万' },
  { value: '100w_500w', label: '100万 - 500万' },
  { value: 'gte_500w', label: '500万+' },
];

export function CreatorLibraryFilters({
  filters,
  filterOptions,
  onSearch,
  onReset,
}: CreatorLibraryFiltersProps) {
  // Like the antd form it replaces: the draft starts from the filters at mount and 重置 returns to them.
  const [initialFilters] = useState(filters);
  const [draft, setDraft] = useState<CreatorLibraryFilters>(filters);
  const ownerFilterFieldName = filterOptions.bdUsers.length > 0 ? 'ownerUserId' : 'ownerName';
  const ownerFilterOptions = filterOptions.bdUsers.length
    ? buildBdUserSelectOptions(filterOptions.bdUsers)
    : buildPlainSelectOptions(filterOptions.owners);
  const setField = <K extends keyof CreatorLibraryFilters>(name: K, value: CreatorLibraryFilters[K]) =>
    setDraft((current) => ({ ...current, [name]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch({
      ...draft,
      ownerName: draft.ownerUserId ? undefined : draft.ownerName,
    });
  };

  return (
    <section className={styles.filterPanel}>
      <form onSubmit={submit}>
        <div className={styles.filterHeader}>
          <div className={styles.filterRail} role="group" aria-label="达人筛选项">
            <LabeledSelect
              wrapperClassName={styles.filterRailItem}
              allowClear
              label="平台"
              placeholder="平台"
              options={buildPlatformSelectOptions(filterOptions.platforms)}
              value={draft.platform}
              onChange={(value) => setField('platform', value)}
            />
            <LabeledSelect
              wrapperClassName={styles.filterRailItem}
              allowClear
              mode="multiple"
              label="主播标签"
              placeholder="主播标签"
              options={buildPlainSelectOptions(filterOptions.anchorTags)}
              value={draft.anchorTags ?? []}
              onChange={(values) => setField('anchorTags', values)}
            />
            <LabeledSelect
              wrapperClassName={styles.filterRailItem}
              allowClear
              label="粉丝量级"
              placeholder="粉丝量级"
              options={FANS_BAND_OPTIONS}
              value={draft.fansBand}
              onChange={(value) => setField('fansBand', value)}
            />
            <LabeledSelect
              wrapperClassName={styles.filterRailItem}
              allowClear
              label="达人等级"
              placeholder="达人等级"
              options={buildCreatorAnchorLevelSelectOptions(filterOptions.anchorLevels)}
              value={draft.anchorLevel}
              onChange={(value) => setField('anchorLevel', value)}
            />
            <LabeledSelect
              wrapperClassName={styles.filterRailItem}
              allowClear
              label="合作状态"
              placeholder="合作状态"
              options={buildCooperationStatusSelectOptions(filterOptions.cooperationStatuses)}
              value={draft.cooperationStatus}
              onChange={(value) => setField('cooperationStatus', value)}
            />
            <LabeledSelect
              wrapperClassName={styles.filterRailItem}
              allowClear
              showSearch
              label="归属BD"
              placeholder="归属BD"
              options={ownerFilterOptions}
              value={draft[ownerFilterFieldName]}
              onChange={(value) => setField(ownerFilterFieldName, value)}
            />
          </div>
        </div>

        <div className={styles.searchRow}>
          <Input
            className={styles.searchField}
            allowClear
            size="large"
            aria-label="搜索达人"
            placeholder="请输入达人昵称 / 达人ID"
            value={draft.keyword ?? ''}
            onChange={(event) => setField('keyword', event.target.value)}
            onClear={() => setField('keyword', undefined)}
          />
          <div className={styles.searchAction}>
            <Button type="primary" size="large" htmlType="submit" icon={<Search size={14} strokeWidth={1.8} aria-hidden="true" />}>
              查询
            </Button>
            <Button
              size="large"
              icon={<RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />}
              onClick={() => {
                setDraft(initialFilters);
                onReset();
              }}
            >
              重置
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function buildPlatformSelectOptions(values?: string[]) {
  return buildPlatformOptionValues(values).map((value) => ({
    label: (
      <span className={`${sharedStyles.optionPill} ${getPlatformToneClassName(value)}`}>{value}</span>
    ),
    value,
    searchText: value,
  }));
}

function buildCooperationStatusSelectOptions(values?: string[]) {
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

function buildCreatorAnchorLevelSelectOptions(values?: string[]) {
  return buildCreatorAnchorLevelOptions(values).map((option) => ({
    ...option,
    label: (
      <span
        className={`${sharedStyles.levelOptionPill} ${getCreatorAnchorLevelToneClassName(option.value)}`}
      >
        {option.label}
      </span>
    ),
    searchText: option.label,
  }));
}

function buildPlainSelectOptions(values?: string[]) {
  return buildPlainOptionValues(values).map((value) => ({
    label: value,
    value,
    searchText: value,
  }));
}

function buildBdUserSelectOptions(
  values: CreatorLibraryFilterOptions['bdUsers']
) {
  return values.map((user) => {
    const displayName = user.displayName || user.username || user.userId;
    return {
      label: displayName,
      value: user.userId,
      searchText: [displayName, user.username, user.userId, ...user.aliases]
        .filter(Boolean)
        .join(' '),
    };
  });
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
