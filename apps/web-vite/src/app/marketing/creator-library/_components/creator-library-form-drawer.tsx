import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { App, Drawer, Form, Input, Select, Switch } from 'antd';
import sharedStyles from '../creator-library-shared.module.css';
import styles from './creator-library-form-drawer.module.css';
import {
  formValuesToPayload,
  itemToFormValues,
  withCreatorUpdateVersion,
} from '../_lib/creator-library-form';
import {
  NOT_COOPERABLE_STATUS_VALUE,
  UNCLASSIFIED_STATUS_VALUE,
} from '../_lib/creator-library-options';
import type {
  CreatorLibraryFilterOptions,
  CreatorLibraryFormValues,
  CreatorLibraryItem,
  CreatorLibraryPayload,
} from '../_lib/creator-library-types';
import {
  normalizeCreatorTagKey,
  normalizeCreatorTagText,
} from '../_lib/creator-library-tags';
import {
  findExistingTag,
  DEFAULT_NEW_CREATOR_VALUES,
  normalizeFormTagValues,
  normalizeOptionalFormText,
} from './creator-library-form-drawer-model';
import {
  buildBdUserOptions,
  buildCooperationStatusSelectOptions,
  buildCreatorAnchorLevelSelectOptions,
  buildPlatformSelectOptions,
  buildPlainOptions,
  filterSelectOption,
  renderAnchorTagOption,
} from './creator-library-form-drawer-options';

interface CreatorLibraryFormDrawerProps {
  open: boolean;
  saving?: boolean;
  item: CreatorLibraryItem | null;
  filterOptions: CreatorLibraryFilterOptions;
  onSubmit: (payload: CreatorLibraryPayload) => void;
  onClose: () => void;
}

export function CreatorLibraryFormDrawer({
  open,
  saving,
  item,
  filterOptions,
  onSubmit,
  onClose,
}: CreatorLibraryFormDrawerProps) {
  const { modal } = App.useApp();
  const [form] = Form.useForm<CreatorLibraryFormValues>();
  const [tagSearchValue, setTagSearchValue] = useState('');
  const isEditing = !!item;
  const selectedTagValues = (Form.useWatch('tags', form) ?? []) as string[];
  const shouldHideEmptyTagCaret = !tagSearchValue.trim();
  const anchorTagOptions = useMemo(
    () => buildPlainOptions(filterOptions.anchorTags),
    [filterOptions.anchorTags]
  );
  const bdUserOptions = useMemo(
    () => buildBdUserOptions(filterOptions, item),
    [filterOptions, item]
  );
  const hasAssignableBdOptions = bdUserOptions.length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    setTagSearchValue('');
    form.setFieldsValue(item ? itemToFormValues(item) : DEFAULT_NEW_CREATOR_VALUES);
  }, [form, item, open]);

  const handleCooperableChange = (checked: boolean) => {
    if (!checked) {
      form.setFieldValue('cooperationStatus', NOT_COOPERABLE_STATUS_VALUE);
      return;
    }
    if (form.getFieldValue('cooperationStatus') === NOT_COOPERABLE_STATUS_VALUE) {
      form.setFieldValue('cooperationStatus', UNCLASSIFIED_STATUS_VALUE);
    }
  };

  const handleCooperationStatusChange = (value?: string) => {
    if (value === NOT_COOPERABLE_STATUS_VALUE) {
      form.setFieldValue('isCooperable', false);
      return;
    }
    form.setFieldValue('isCooperable', true);
  };

  const addTagValue = (value: string) => {
    const normalized = normalizeCreatorTagText(value);
    if (!normalized) {
      return;
    }

    const currentTags = normalizeFormTagValues(form.getFieldValue('tags'));
    const currentKeys = new Set(currentTags.map(normalizeCreatorTagKey));
    if (currentKeys.has(normalizeCreatorTagKey(normalized))) {
      setTagSearchValue('');
      return;
    }

    form.setFieldValue('tags', [...currentTags, normalized]);
    setTagSearchValue('');
  };

  const handleTagInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    const rawTag = tagSearchValue.trim();
    if (!rawTag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const existingTag = findExistingTag(rawTag, filterOptions.anchorTags);
    if (existingTag) {
      addTagValue(existingTag);
      return;
    }

    modal.confirm({
      title: '确认创建新标签',
      content: `确认创建「${normalizeCreatorTagText(rawTag) || rawTag}」为新的主播标签？`,
      okText: '创建并选择',
      cancelText: '取消',
      onOk: () => addTagValue(rawTag),
    });
  };

  return (
    <Drawer
      title={isEditing ? '编辑达人资料' : '新增达人'}
      size={560}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={null}
      footer={
        <div className={styles.drawerFooter}>
          <button type="button" className={styles.ghostButton} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={saving}
            onClick={() => form.submit()}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      }
    >
      <Form<CreatorLibraryFormValues>
        form={form}
        layout="vertical"
        initialValues={item ? itemToFormValues(item) : DEFAULT_NEW_CREATOR_VALUES}
        onFinish={(values) => {
          const nextOwnerUserId = normalizeOptionalFormText(values.ownerUserId);
          const payload = formValuesToPayload({
            ...values,
            ownerName: nextOwnerUserId ? normalizeOptionalFormText(values.ownerName) : undefined,
            ownerUserId: nextOwnerUserId,
          });
          onSubmit(item ? withCreatorUpdateVersion(payload, item) : payload);
        }}
      >
        <div className={styles.drawerGrid}>
          <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
            <Select
              allowClear
              placeholder="请选择平台"
              options={buildPlatformSelectOptions(filterOptions.platforms, true)}
            />
          </Form.Item>
          <Form.Item
            name="influencerName"
            label="达人昵称"
            rules={[{ required: true, message: '请输入达人昵称' }]}
          >
            <Input placeholder="达人昵称" />
          </Form.Item>
          <Form.Item
            name="influencerId"
            label="达人ID"
            rules={[{ required: true, message: '请输入达人ID' }]}
          >
            <Input placeholder="平台内达人ID" />
          </Form.Item>
          <Form.Item name="douyinHandle" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="phone" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="mcn" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="category" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="anchorLevel" label="达人等级">
            <Select
              allowClear
              placeholder="选择达人等级"
              options={buildCreatorAnchorLevelSelectOptions(filterOptions.anchorLevels)}
            />
          </Form.Item>
          <Form.Item name="mainPlatformFans" label="粉丝数">
            <Input placeholder="例如：35.6万" />
          </Form.Item>
          <Form.Item name="sales30d" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="sales90d" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="cooperationStatus" label="合作状态">
            <Select
              allowClear
              placeholder="建联中 / 寄样洽谈 / 已合作"
              options={buildCooperationStatusSelectOptions(filterOptions.cooperationStatuses)}
              onChange={handleCooperationStatusChange}
            />
          </Form.Item>
          <Form.Item name="ownerUserId" label="归属BD">
            <Select
              allowClear
              showSearch
              placeholder={hasAssignableBdOptions ? '选择负责BD' : '请先初始化BD账号'}
              disabled={!hasAssignableBdOptions}
              optionFilterProp="searchText"
              filterOption={filterSelectOption}
              options={bdUserOptions}
              onChange={(value, option) => {
                const selected = Array.isArray(option) ? undefined : option;
                form.setFieldValue('ownerName', value ? selected?.displayName : undefined);
                form.setFieldValue('ownerUserId', normalizeOptionalFormText(value));
              }}
            />
          </Form.Item>
          <Form.Item name="ownerName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="isCooperable" label="是否可合作" valuePropName="checked">
            <Switch
              checkedChildren="可合作"
              unCheckedChildren="不可合作"
              onChange={handleCooperableChange}
            />
          </Form.Item>
        </div>

        <Form.Item name="tags" label="主播标签">
          <Select
            allowClear
            showSearch
            mode="multiple"
            maxTagCount="responsive"
            placeholder="Enter输入新标签"
            className={`${styles.anchorTagSelect} ${
              shouldHideEmptyTagCaret ? styles.anchorTagSelectPristine : ''
            }`}
            optionFilterProp="searchText"
            filterOption={filterSelectOption}
            options={anchorTagOptions}
            searchValue={tagSearchValue}
            popupClassName={sharedStyles.anchorTagDropdown}
            optionRender={(option) =>
              renderAnchorTagOption(option.value, option.label, selectedTagValues)
            }
            notFoundContent={tagSearchValue.trim() ? 'Enter输入新标签' : '暂无可选标签'}
            onSearch={setTagSearchValue}
            onInputKeyDown={handleTagInputKeyDown}
            onChange={() => setTagSearchValue('')}
          />
        </Form.Item>
        <Form.Item name="anchorDesc" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="cooperationDesc" label="合作描述">
          <Input.TextArea rows={4} placeholder="报价、合作限制、内容方向、历史复盘等" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
