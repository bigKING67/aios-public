import { useEffect, useMemo } from 'react';
import { Button, confirmModal, Drawer, Input, Switch, TextArea } from '@lobehub/ui';
import { FormField } from '@/components/molecules/form-field';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import {
  bindSelectField,
  bindTextField,
  type ControlledFormRules,
  useControlledForm,
} from '@/hooks/use-controlled-form';
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
} from './creator-library-form-drawer-options';

interface CreatorLibraryFormDrawerProps {
  open: boolean;
  saving?: boolean;
  item: CreatorLibraryItem | null;
  filterOptions: CreatorLibraryFilterOptions;
  onSubmit: (payload: CreatorLibraryPayload) => void;
  onClose: () => void;
}

const FORM_RULES: ControlledFormRules<CreatorLibraryFormValues> = {
  platform: [{ required: true, message: '请选择平台' }],
  influencerName: [{ required: true, message: '请输入达人昵称' }],
  influencerId: [{ required: true, message: '请输入达人ID' }],
};

export function CreatorLibraryFormDrawer({
  open,
  saving,
  item,
  filterOptions,
  onSubmit,
  onClose,
}: CreatorLibraryFormDrawerProps) {
  const isEditing = !!item;
  const anchorTagOptions = useMemo(
    () => buildPlainOptions(filterOptions.anchorTags),
    [filterOptions.anchorTags]
  );
  const bdUserOptions = useMemo(
    () => buildBdUserOptions(filterOptions, item),
    [filterOptions, item]
  );
  const hasAssignableBdOptions = bdUserOptions.length > 0;
  // Hidden fields (抖音号, 电话, MCN, 类目, 销售额, 主播描述) ride along in the values untouched.
  const form = useControlledForm<CreatorLibraryFormValues>({
    initialValues: item ? itemToFormValues(item) : DEFAULT_NEW_CREATOR_VALUES,
    rules: FORM_RULES,
    onFinish: (values) => {
      const nextOwnerUserId = normalizeOptionalFormText(values.ownerUserId);
      const payload = formValuesToPayload({
        ...values,
        ownerName: nextOwnerUserId ? normalizeOptionalFormText(values.ownerName) : undefined,
        ownerUserId: nextOwnerUserId,
      });
      onSubmit(item ? withCreatorUpdateVersion(payload, item) : payload);
    },
  });

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, item, open]);

  const handleCooperableChange = (checked: boolean) => {
    form.change('isCooperable', checked);
    if (!checked) {
      form.setFieldValue('cooperationStatus', NOT_COOPERABLE_STATUS_VALUE);
      return;
    }
    if (form.getFieldValue('cooperationStatus') === NOT_COOPERABLE_STATUS_VALUE) {
      form.setFieldValue('cooperationStatus', UNCLASSIFIED_STATUS_VALUE);
    }
  };

  const handleCooperationStatusChange = (value?: string) => {
    form.change('cooperationStatus', value);
    form.setFieldValue('isCooperable', value !== NOT_COOPERABLE_STATUS_VALUE);
  };

  const handleOwnerChange = (value?: string) => {
    const selected = bdUserOptions.find((option) => option.value === value);
    form.setFieldValue('ownerName', value ? selected?.displayName : undefined);
    form.change('ownerUserId', normalizeOptionalFormText(value));
  };

  const addTagValue = (value: string) => {
    const normalized = normalizeCreatorTagText(value);
    if (!normalized) {
      return;
    }
    const currentTags = normalizeFormTagValues(form.getFieldValue('tags'));
    if (currentTags.some((tag) => normalizeCreatorTagKey(tag) === normalizeCreatorTagKey(normalized))) {
      return;
    }
    form.change('tags', [...currentTags, normalized]);
  };

  // Removing keeps the rest; a picked or typed tag is normalized, and a tag the library does not
  // know yet is created only after confirmation.
  const handleTagsChange = (values: string[]) => {
    const currentTags = normalizeFormTagValues(form.getFieldValue('tags'));
    const currentKeys = new Set(currentTags.map(normalizeCreatorTagKey));
    form.change(
      'tags',
      values.filter((value) => currentKeys.has(normalizeCreatorTagKey(value)))
    );
    for (const rawTag of values.filter((value) => !currentKeys.has(normalizeCreatorTagKey(value)))) {
      const existingTag = findExistingTag(rawTag, filterOptions.anchorTags);
      if (existingTag) {
        addTagValue(existingTag);
        continue;
      }
      confirmModal({
        title: '确认创建新标签',
        content: `确认创建「${normalizeCreatorTagText(rawTag) || rawTag}」为新的主播标签？`,
        okText: '创建并选择',
        cancelText: '取消',
        onOk: () => addTagValue(rawTag),
      });
    }
  };

  return (
    <Drawer
      title={isEditing ? '编辑达人资料' : '新增达人'}
      width={560}
      open={open}
      onClose={onClose}
      footer={
        <div className={styles.drawerFooter}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            保存
          </Button>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.submit();
        }}
      >
        <div className={styles.drawerGrid}>
          <FormField form={form} name="platform" label="平台" required>
            <LabeledSelect
              {...bindSelectField(form, 'platform')}
              allowClear
              placeholder="请选择平台"
              options={buildPlatformSelectOptions(filterOptions.platforms, true)}
            />
          </FormField>
          <FormField form={form} name="influencerName" label="达人昵称" required>
            <Input {...bindTextField(form, 'influencerName')} placeholder="达人昵称" />
          </FormField>
          <FormField form={form} name="influencerId" label="达人ID" required>
            <Input {...bindTextField(form, 'influencerId')} placeholder="平台内达人ID" />
          </FormField>
          <FormField form={form} name="anchorLevel" label="达人等级">
            <LabeledSelect
              {...bindSelectField(form, 'anchorLevel')}
              allowClear
              placeholder="选择达人等级"
              options={buildCreatorAnchorLevelSelectOptions(filterOptions.anchorLevels)}
            />
          </FormField>
          <FormField form={form} name="mainPlatformFans" label="粉丝数">
            <Input {...bindTextField(form, 'mainPlatformFans')} placeholder="例如：35.6万" />
          </FormField>
          <FormField form={form} name="cooperationStatus" label="合作状态">
            <LabeledSelect
              {...bindSelectField(form, 'cooperationStatus')}
              allowClear
              placeholder="建联中 / 寄样洽谈 / 已合作"
              options={buildCooperationStatusSelectOptions(filterOptions.cooperationStatuses)}
              onChange={handleCooperationStatusChange}
            />
          </FormField>
          <FormField form={form} name="ownerUserId" label="归属BD">
            <LabeledSelect
              {...bindSelectField(form, 'ownerUserId')}
              allowClear
              showSearch
              placeholder={hasAssignableBdOptions ? '选择负责BD' : '请先初始化BD账号'}
              disabled={!hasAssignableBdOptions}
              options={bdUserOptions}
              onChange={handleOwnerChange}
            />
          </FormField>
          <FormField form={form} name="isCooperable" label="是否可合作">
            <Switch
              id={form.fieldId('isCooperable')}
              checked={Boolean(form.values.isCooperable)}
              checkedChildren="可合作"
              unCheckedChildren="不可合作"
              onChange={handleCooperableChange}
            />
          </FormField>
        </div>

        <FormField form={form} name="tags" label="主播标签" extra="输入新标签后按 Enter 添加">
          <LabeledSelect
            id={form.fieldId('tags')}
            allowClear
            showSearch
            mode="tags"
            placeholder="选择或输入主播标签"
            options={anchorTagOptions}
            value={form.values.tags ?? []}
            onChange={handleTagsChange}
          />
        </FormField>
        <FormField form={form} name="cooperationDesc" label="合作描述">
          <TextArea {...bindTextField(form, 'cooperationDesc')} rows={4} placeholder="报价、合作限制、内容方向、历史复盘等" />
        </FormField>
      </form>
    </Drawer>
  );
}
