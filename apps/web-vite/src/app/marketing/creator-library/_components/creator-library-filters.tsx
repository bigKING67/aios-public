import type { ReactNode } from 'react';
import { Button, Form, Input, Select, Space } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
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
import { normalizeCreatorTagKey } from '../_lib/creator-library-tags';
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
  const [form] = Form.useForm<CreatorLibraryFilters>();
  const selectedAnchorTags = (Form.useWatch('anchorTags', form) ?? []) as string[];
  const ownerFilterFieldName = filterOptions.bdUsers.length > 0 ? 'ownerUserId' : 'ownerName';
  const ownerFilterOptions = filterOptions.bdUsers.length
    ? buildBdUserSelectOptions(filterOptions.bdUsers)
    : buildPlainSelectOptions(filterOptions.owners);

  return (
    <section className={styles.filterPanel}>
      <Form
        form={form}
        layout="vertical"
        initialValues={filters}
        onFinish={(values) =>
          onSearch({
            ...values,
            ownerName: values.ownerUserId ? undefined : values.ownerName,
          })
        }
      >
        <div className={styles.filterHeader}>
          <div className={styles.filterRail} aria-label="达人筛选项">
            <Form.Item name="platform" className={styles.filterRailItem}>
              <Select
                allowClear
                aria-label="平台"
                placeholder="平台"
                optionFilterProp="searchText"
                filterOption={filterSelectOption}
                options={buildPlatformSelectOptions(filterOptions.platforms)}
              />
            </Form.Item>
            <Form.Item name="anchorTags" className={styles.filterRailItem}>
              <Select<string[]>
                allowClear
                className={styles.anchorTagFilterSelect}
                mode="multiple"
                maxTagCount="responsive"
                showSearch={false}
                aria-label="主播标签"
                placeholder="主播标签"
                optionFilterProp="searchText"
                filterOption={filterSelectOption}
                popupClassName={sharedStyles.anchorTagDropdown}
                optionRender={(option) =>
                  renderAnchorTagOption(option.value, option.label, selectedAnchorTags)
                }
                options={buildPlainSelectOptions(filterOptions.anchorTags)}
              />
            </Form.Item>
            <Form.Item name="fansBand" className={styles.filterRailItem}>
              <Select allowClear aria-label="粉丝量级" placeholder="粉丝量级" options={FANS_BAND_OPTIONS} />
            </Form.Item>
            <Form.Item name="anchorLevel" className={styles.filterRailItem}>
              <Select
                allowClear
                aria-label="达人等级"
                placeholder="达人等级"
                optionFilterProp="searchText"
                filterOption={filterSelectOption}
                options={buildCreatorAnchorLevelSelectOptions(filterOptions.anchorLevels)}
              />
            </Form.Item>
            <Form.Item name="cooperationStatus" className={styles.filterRailItem}>
              <Select
                allowClear
                aria-label="合作状态"
                placeholder="合作状态"
                optionFilterProp="searchText"
                filterOption={filterSelectOption}
                options={buildCooperationStatusSelectOptions(filterOptions.cooperationStatuses)}
              />
            </Form.Item>
            <Form.Item name={ownerFilterFieldName} className={styles.filterRailItem}>
              <Select
                allowClear
                showSearch
                aria-label="归属BD"
                placeholder="归属BD"
                optionFilterProp="searchText"
                filterOption={filterSelectOption}
                options={ownerFilterOptions}
              />
            </Form.Item>
          </div>
        </div>

        <div className={styles.searchRow}>
          <Form.Item name="keyword" className={styles.searchField}>
            <Input
              allowClear
              size="large"
              placeholder="请输入达人昵称 / 达人ID"
            />
          </Form.Item>
          <Form.Item className={styles.searchAction}>
            <Space wrap>
              <Button type="primary" size="large" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button
                size="large"
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields();
                  onReset();
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </div>
      </Form>
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

function renderAnchorTagOption(
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

function filterSelectOption(
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
