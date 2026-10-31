import { Input, type SelectOption, TextArea } from '@lobehub/ui';
import type { ContentAssetFilterOptions } from '../_lib/content-assets-types';
import {
  authorizationStatusLabel,
  lifecycleStatusLabel,
  profileStatusLabel,
  type ContentAssetSceneCascaderOption,
} from '../_lib/content-assets-ui-helpers';
import styles from '../content-assets.module.css';
import { FormField, TextFormField } from '@/components/molecules/form-field';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import {
  emptyToNull,
  resolveOwnerDisplayName,
  type NullableBooleanValue,
  type OwnerSelectOption,
  type PlainSelectOption,
  type ProfileFormValues,
} from './content-assets-profile-modal-values';
import { ContentAssetsScenePathSelect } from './content-assets-scene-path-select';
import { ContentAssetsTagPicker } from './content-assets-tag-picker';
import { bindSelectField, bindTextField, type ControlledForm } from '@/hooks/use-controlled-form';

const PROFILE_STATUS_OPTIONS = [
  'incomplete',
  'basic_complete',
  'platform_bound',
  'performance_ready',
  'verified',
].map((value) => ({ value, label: profileStatusLabel(value) }));

const LIFECYCLE_STATUS_OPTIONS = [
  'draft',
  'waiting_analysis',
  'testable',
  'testing',
  'scaling',
  'repurpose',
  'rejected',
  'expired',
].map((value) => ({ value, label: lifecycleStatusLabel(value) }));

const AUTHORIZATION_STATUS_OPTIONS = [
  'unknown',
  'authorized',
  'pending',
  'expired',
  'restricted',
].map((value) => ({ value, label: authorizationStatusLabel(value) }));

const NULLABLE_BOOLEAN_OPTIONS = [
  { value: 'unknown', label: '待确认' },
  { value: 'true', label: '允许' },
  { value: 'false', label: '限制' },
] satisfies Array<{ value: NullableBooleanValue; label: string }>;

type ProfileForm = ControlledForm<ProfileFormValues>;
type SingleSelectName = 'videoType' | 'profileStatus' | 'lifecycleStatus' | 'authorizationStatus';

function SingleSelectField({
  form,
  name,
  label,
  options,
  placeholder,
  allowClear = false,
}: {
  form: ProfileForm;
  name: SingleSelectName;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  allowClear?: boolean;
}) {
  return (
    <FormField form={form} name={name} label={label}>
      <LabeledSelect
        {...bindSelectField(form, name)}
        onChange={(value) => form.change(name, value as ProfileFormValues[SingleSelectName])}
        allowClear={allowClear}
        placeholder={placeholder}
        options={options}
      />
    </FormField>
  );
}

function PermissionSelectField({ form, name, label }: { form: ProfileForm; name: 'commercialUseAllowed' | 'repurposeAllowed'; label: string }) {
  return (
    <FormField form={form} name={name} label={label}>
      <LabeledSelect<NullableBooleanValue>
        {...bindSelectField(form, name)}
        onChange={(value) => value && form.change(name, value)}
        options={NULLABLE_BOOLEAN_OPTIONS}
      />
    </FormField>
  );
}

interface ContentAssetsProfileFormFieldsProps {
  form: ProfileForm;
  saving?: boolean;
  filterOptions: ContentAssetFilterOptions;
  displayTitleHint: string | undefined;
  platformOptions: SelectOption[];
  productOptions: SelectOption[];
  ownerOptions: OwnerSelectOption[];
  videoTypeOptions: SelectOption[];
  skuOptions: PlainSelectOption[];
  contentSceneOptions: PlainSelectOption[];
  contentSceneGroupOptions: PlainSelectOption[];
  contentSceneSubtypeOptions: PlainSelectOption[];
  sceneOptions: ContentAssetSceneCascaderOption[];
  sceneOptionsConfigured: boolean;
  sceneSelectionDisabled: boolean;
  showSceneCascade: boolean;
}

/** Field grid of the 编辑档案 modal; the modal owns the form state and the scene rules. */
export function ContentAssetsProfileFormFields({
  form,
  saving,
  filterOptions,
  displayTitleHint,
  platformOptions,
  productOptions,
  ownerOptions,
  videoTypeOptions,
  skuOptions,
  contentSceneOptions,
  contentSceneGroupOptions,
  contentSceneSubtypeOptions,
  sceneOptions,
  sceneOptionsConfigured,
  sceneSelectionDisabled,
  showSceneCascade,
}: ContentAssetsProfileFormFieldsProps) {
  const hasOwnerOptions = ownerOptions.length > 0;
  return (
    <>
      <div className={styles.formGrid}>
        <FormField form={form} name="title" label="素材标题" required className={styles.formWide} extra={displayTitleHint}>
          <Input {...bindTextField(form, 'title')} placeholder="例如：控油洗发水-达人口播-油头痛点版" maxLength={160} />
        </FormField>
        <FormField form={form} name="platformNames" label="平台">
          <LabeledSelect
            {...bindSelectField(form, 'platformNames')}
            onChange={(value: string[]) => form.change('platformNames', value)}
            allowClear
            mode="multiple"
            placeholder="可多选：抖音 / 快手 / 淘宝 / 小红书"
            options={platformOptions}
          />
        </FormField>
        <FormField form={form} name="productNames" label="产品" className={styles.formWide}>
          <LabeledSelect
            {...bindSelectField(form, 'productNames')}
            onChange={(value: string[]) => form.change('productNames', value)}
            allowClear
            mode="multiple"
            placeholder="选择产品，可多选"
            options={productOptions}
          />
        </FormField>
        <FormField form={form} name="ownerUserId" label="负责人">
          <LabeledSelect
            {...bindSelectField(form, 'ownerUserId')}
            allowClear
            disabled={!hasOwnerOptions}
            placeholder={hasOwnerOptions ? '选择素材库负责人' : '请先配置素材库成员'}
            options={ownerOptions}
            onChange={(value) => {
              form.change('ownerUserId', value);
              const ownerUserId = emptyToNull(value);
              form.setFieldValue('ownerName', (ownerUserId && resolveOwnerDisplayName(ownerUserId, ownerOptions)) || undefined);
            }}
          />
        </FormField>
        <SingleSelectField form={form} name="videoType" label="视频类型" allowClear placeholder="选择视频类型" options={videoTypeOptions} />
        {showSceneCascade && sceneOptionsConfigured ? (
          <FormField
            form={form}
            name="scenePath"
            label="场景路径"
            className={styles.formWide}
            extra={sceneSelectionDisabled
              ? '请先选择单一产品品类后维护场景分层。'
              : '按“场景类型｜大场景 › 细分场景”维护；标签里的“/”保留为业务词组。'}
          >
            <ContentAssetsScenePathSelect
              id={form.fieldId('scenePath')}
              label="场景路径"
              disabled={sceneSelectionDisabled}
              disabledPlaceholder="先选择单一产品品类"
              options={sceneOptions}
              value={form.values.scenePath ?? []}
              onChange={(path) => form.change('scenePath', path)}
            />
          </FormField>
        ) : null}
        {showSceneCascade && !sceneOptionsConfigured ? (
          <>
            <TextFormField
              form={form}
              name="contentScene"
              label="场景类型"
              extra="场景映射树待确认前，先保留可编辑字段；后续可切换为固定级联选项。"
              list="content-asset-profile-content-scene-options"
              placeholder="例如：原点场景"
              maxLength={120}
            />
            <TextFormField form={form} name="contentSceneGroup" label="大场景" list="content-asset-profile-content-scene-group-options" placeholder="输入大场景" maxLength={120} />
            <TextFormField form={form} name="contentSceneSubtype" label="细分场景" list="content-asset-profile-content-scene-subtype-options" placeholder="输入细分场景" maxLength={120} />
          </>
        ) : null}
        <FormField form={form} name="skuNames" label="SKU">
          <LabeledSelect
            {...bindSelectField(form, 'skuNames')}
            onChange={(value: string[]) => form.change('skuNames', value)}
            allowClear
            showSearch
            mode="tags"
            tokenSeparators={[',', '，', '/']}
            placeholder="选择或输入 SKU，可多选"
            options={skuOptions}
          />
        </FormField>
        <TextFormField form={form} name="creatorName" label="达人昵称" placeholder="请输入达人昵称" maxLength={120} />
        <SingleSelectField form={form} name="profileStatus" label="档案状态" options={PROFILE_STATUS_OPTIONS} />
        <SingleSelectField form={form} name="lifecycleStatus" label="流转阶段" options={LIFECYCLE_STATUS_OPTIONS} />
        <SingleSelectField form={form} name="authorizationStatus" label="授权状态" options={AUTHORIZATION_STATUS_OPTIONS} />
        <PermissionSelectField form={form} name="commercialUseAllowed" label="可商用" />
        <PermissionSelectField form={form} name="repurposeAllowed" label="可复剪" />
        <TextFormField form={form} name="authorizationStartsAt" label="授权开始" type="date" />
        <TextFormField form={form} name="authorizationExpiresAt" label="授权到期" type="date" />
        <FormField form={form} name="tags" label="标签" className={styles.formWide}>
          <ContentAssetsTagPicker
            {...bindSelectField(form, 'tags')}
            disabled={saving}
            options={filterOptions.tags}
            placeholder="搜索或新增标签，例如：卖点、场景、钩子、产品线"
          />
        </FormField>
        <FormField form={form} name="notes" label="业务备注" className={styles.formWide}>
          <TextArea {...bindTextField(form, 'notes')} rows={3} placeholder="补充素材来源、使用限制、复剪方向或业务判断" maxLength={2000} />
        </FormField>
        <FormField form={form} name="authorizationNotes" label="授权备注" className={styles.formWide}>
          <TextArea {...bindTextField(form, 'authorizationNotes')} rows={2} placeholder="补充授权范围、到期提醒、合同或沟通记录" maxLength={1000} />
        </FormField>
      </div>
      <datalist id="content-asset-profile-content-scene-options">
        {contentSceneOptions.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
      <datalist id="content-asset-profile-content-scene-group-options">
        {contentSceneGroupOptions.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
      <datalist id="content-asset-profile-content-scene-subtype-options">
        {contentSceneSubtypeOptions.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
    </>
  );
}
