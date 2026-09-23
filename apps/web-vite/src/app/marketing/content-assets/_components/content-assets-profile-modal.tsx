import { useCallback, useEffect, useMemo } from 'react';
import { Alert, Cascader, Form, Input, Modal, Select } from 'antd';
import type {
  ContentAssetDetailResponse,
  ContentAssetFilterOptions,
  ContentAssetProfileUpdatePayload,
} from '../_lib/content-assets-types';
import { resolveContentAssetDisplayTitle } from '../_lib/content-assets-display';
import { CONTENT_ASSET_PLATFORM_OPTIONS } from '../_lib/content-assets-platforms';
import {
  authorizationStatusLabel,
  formatContentAssetScenePath,
  isContentAssetScenePathValidForProducts,
  isContentAssetSceneOptionsConfigured,
  isContentAssetSceneVideoType,
  lifecycleStatusLabel,
  profileStatusLabel,
  resolveContentAssetProductOptions,
  resolveContentAssetSceneOptionsForProducts,
  resolveContentAssetVideoTypeOptions,
  type ContentAssetSceneCascaderOption,
} from '../_lib/content-assets-ui-helpers';
import styles from '../content-assets.module.css';
import { buildContentAssetPlatformSelectOptions, renderContentAssetPlatformSelectTag } from './content-assets-platform-select';
import platformSelectStyles from './content-assets-platform-select.module.css';
import {
  buildOwnerSelectOptions,
  buildPlainSelectOptions,
  detailToFormValues,
  emptyToNull,
  formValuesToPayload,
  resolveOwnerDisplayName,
  type NullableBooleanValue,
  type ProfileFormValues,
} from './content-assets-profile-modal-values';
import { ContentAssetsTagPicker } from './content-assets-tag-picker';

interface ContentAssetProfileModalProps {
  open: boolean;
  detail: ContentAssetDetailResponse | null;
  saving?: boolean;
  filterOptions: ContentAssetFilterOptions;
  onCancel: () => void;
  onSubmit: (payload: ContentAssetProfileUpdatePayload) => void;
}

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

const EMPTY_SCENE_FIELDS = {
  scenePath: undefined,
  contentScene: undefined,
  contentSceneGroup: undefined,
  contentSceneSubtype: undefined,
} satisfies Partial<ProfileFormValues>;


export function ContentAssetProfileModal({
  open,
  detail,
  saving,
  filterOptions,
  onCancel,
  onSubmit,
}: ContentAssetProfileModalProps) {
  const [form] = Form.useForm<ProfileFormValues>();
  const videoType = Form.useWatch('videoType', form);
  const productNames = Form.useWatch('productNames', form);
  const scenePath = Form.useWatch('scenePath', form);
  const asset = detail?.asset;
  const shortVideoProfileHint = detail?.shortVideoProfileHint ?? null;
  const displayTitle = asset ? resolveContentAssetDisplayTitle(asset) : '';
  const shouldShowDisplayTitleHint = Boolean(asset && displayTitle && displayTitle !== asset.title);
  const profileInitialValues = useMemo(
    () => detail ? detailToFormValues(detail) : null,
    [detail]
  );
  const productOptions = useMemo(
    () => resolveContentAssetProductOptions([...filterOptions.products, ...(asset?.productNames || []), asset?.productName || '']),
    [asset?.productName, asset?.productNames, filterOptions.products]
  );
  const skuOptions = useMemo(
    () => buildPlainSelectOptions([...filterOptions.skus, ...(asset?.skuNames || [])]),
    [asset?.skuNames, filterOptions.skus]
  );
  const contentSceneOptions = useMemo(
    () => buildPlainSelectOptions([...(filterOptions.contentScenes || []), asset?.contentScene || '']),
    [asset?.contentScene, filterOptions.contentScenes]
  );
  const contentSceneGroupOptions = useMemo(
    () => buildPlainSelectOptions([...(filterOptions.contentSceneGroups || []), asset?.contentSceneGroup || '']),
    [asset?.contentSceneGroup, filterOptions.contentSceneGroups]
  );
  const contentSceneSubtypeOptions = useMemo(
    () => buildPlainSelectOptions([...(filterOptions.contentSceneSubtypes || []), asset?.contentSceneSubtype || '']),
    [asset?.contentSceneSubtype, filterOptions.contentSceneSubtypes]
  );
  const videoTypeOptions = useMemo(
    () => resolveContentAssetVideoTypeOptions(filterOptions.videoTypes),
    [filterOptions.videoTypes]
  );
  const platformOptions = useMemo(
    () => buildContentAssetPlatformSelectOptions([
      ...CONTENT_ASSET_PLATFORM_OPTIONS.map((option) => option.value),
      ...(asset?.platformNames || []),
      asset?.platform || '',
    ]),
    [asset?.platform, asset?.platformNames]
  );
  const ownerOptions = useMemo(
    () => buildOwnerSelectOptions(filterOptions, asset),
    [asset, filterOptions]
  );
  const hasOwnerOptions = ownerOptions.length > 0;
  const effectiveVideoType = videoType
    ?? (form.isFieldTouched('videoType') ? undefined : profileInitialValues?.videoType);
  const effectiveProductNames = productNames
    ?? (form.isFieldTouched('productNames') ? undefined : profileInitialValues?.productNames);
  const effectiveScenePath = scenePath
    ?? (form.isFieldTouched('scenePath') ? undefined : profileInitialValues?.scenePath);
  const showSceneCascade = isContentAssetSceneVideoType(effectiveVideoType);
  const sceneOptionsConfigured = isContentAssetSceneOptionsConfigured();
  const sceneOptions = useMemo(
    () => mergeSceneOptionsWithCurrentPath(
      resolveContentAssetSceneOptionsForProducts(effectiveProductNames),
      effectiveScenePath
    ),
    [effectiveProductNames, effectiveScenePath]
  );
  const sceneSelectionDisabled = showSceneCascade && sceneOptions.length === 0;
  const hydrateProfileForm = useCallback(() => {
    if (!profileInitialValues) return;
    form.resetFields();
    form.setFieldsValue(profileInitialValues);
  }, [form, profileInitialValues]);

  useEffect(() => {
    if (!open) return;
    hydrateProfileForm();
  }, [hydrateProfileForm, open]);

  useEffect(() => {
    if (!open) return;

    const currentVideoType = form.getFieldValue('videoType');
    if (!currentVideoType) return;

    const currentScenePath = form.getFieldValue('scenePath') as ProfileFormValues['scenePath'];
    if (!isContentAssetSceneVideoType(currentVideoType)) {
      form.setFieldsValue(EMPTY_SCENE_FIELDS);
      return;
    }

    if (!currentScenePath?.length) return;

    const currentProductNames = form.getFieldValue('productNames') as ProfileFormValues['productNames'];
    if (!currentProductNames?.length) {
      if (form.isFieldTouched('productNames')) {
        form.setFieldsValue(EMPTY_SCENE_FIELDS);
      }
      return;
    }

    if (
      !isContentAssetScenePathValidForProducts(currentScenePath, currentProductNames)
      && (form.isFieldTouched('productNames') || form.isFieldTouched('scenePath'))
    ) {
      form.setFieldsValue(EMPTY_SCENE_FIELDS);
    }
  }, [form, open, productNames, scenePath, videoType]);

  return (
    <Modal
      title={asset ? `编辑档案：${displayTitle}` : '编辑素材档案'}
      open={open}
      width={780}
      confirmLoading={saving}
      okText="保存档案"
      cancelText="取消"
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (visible) hydrateProfileForm();
        else form.resetFields();
      }}
    >
      <Alert
        className={styles.modalHint}
        type={shortVideoProfileHint?.matchStatus === 'ambiguous' ? 'warning' : 'info'}
        showIcon
        message="这里维护的是业务档案，不是 TOS 对象元数据"
        description={
          shortVideoProfileHint?.matchStatus === 'unique'
            ? '已根据视频 ID / 千川素材 ID 找到短视频明细回流信息，空白的产品、达人、视频类型和场景会预填；保存后才会固化到素材档案。'
            : shortVideoProfileHint?.matchStatus === 'ambiguous'
              ? '当前视频 ID / 千川素材 ID 命中多条短视频明细；编辑表单只会预填可唯一确认的回流字段，不会自动写入冲突来源，请人工确认后保存。'
              : 'TOS 只负责原片、预览视频、封面等对象文件；产品、达人、授权、标签、流转阶段都保存在数据库，后续日报回流会按平台 ID / 素材 ID 关联到这里。'
        }
      />
      <Form<ProfileFormValues>
        form={form}
        initialValues={profileInitialValues ?? undefined}
        layout="vertical"
        preserve={false}
        onFinish={(values) => onSubmit(formValuesToPayload(values, ownerOptions))}
      >
        <div className={styles.formGrid}>
          <Form.Item
            name="title"
            label="素材标题"
            rules={[{ required: true, message: '请输入素材标题' }]}
            className={styles.formWide}
            extra={
              shouldShowDisplayTitleHint
                ? `当前列表展示：${displayTitle}。保存前不会自动覆盖原始标题。`
                : undefined
            }
          >
            <Input placeholder="例如：控油洗发水-达人口播-油头痛点版" maxLength={160} />
          </Form.Item>
          <Form.Item name="platformNames" label="平台">
            <Select
              className={platformSelectStyles.platformSelect}
              allowClear
              showSearch={false}
              mode="multiple"
              placeholder="可多选：抖音 / 快手 / 淘宝 / 小红书"
              optionFilterProp="searchText"
              options={platformOptions} tagRender={renderContentAssetPlatformSelectTag}
            />
          </Form.Item>
          <Form.Item name="productNames" label="产品" className={styles.formWide}>
            <Select
              allowClear
              showSearch={false}
              mode="multiple"
              placeholder="选择产品，可多选"
              optionFilterProp="searchText"
              options={productOptions}
            />
          </Form.Item>
          <Form.Item name="ownerUserId" label="负责人">
            <Select
              allowClear
              showSearch={false}
              disabled={!hasOwnerOptions}
              placeholder={hasOwnerOptions ? '选择素材库负责人' : '请先配置素材库成员'}
              optionFilterProp="searchText"
              options={ownerOptions}
              onChange={(value) => {
                const ownerUserId = emptyToNull(value);
                form.setFieldValue('ownerName', ownerUserId ? resolveOwnerDisplayName(ownerUserId, ownerOptions) : undefined);
              }}
            />
          </Form.Item>
          <Form.Item name="ownerName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="videoType" label="视频类型">
            <Select
              allowClear
              showSearch={false}
              placeholder="选择视频类型"
              optionFilterProp="label"
              options={videoTypeOptions}
            />
          </Form.Item>
          {showSceneCascade && sceneOptionsConfigured ? (
            <Form.Item
              name="scenePath"
              label="场景路径"
              className={styles.formWide}
              extra={sceneSelectionDisabled
                ? '请先选择单一产品品类后维护场景分层。'
                : '按“场景类型｜大场景 › 细分场景”维护；标签里的“/”保留为业务词组。'}
            >
              <Cascader
                changeOnSelect
                disabled={sceneSelectionDisabled}
                displayRender={(labels) => formatContentAssetScenePath(labels.map((label) => String(label)))}
                options={sceneOptions}
                placeholder={sceneSelectionDisabled ? '先选择单一产品品类' : '选择场景类型 → 大场景 → 细分场景'}
              />
            </Form.Item>
          ) : null}
          {showSceneCascade && !sceneOptionsConfigured ? (
            <>
              <Form.Item
                name="contentScene"
                label="场景类型"
                extra="场景映射树待确认前，先保留可编辑字段；后续可切换为固定级联选项。"
              >
                <Input list="content-asset-profile-content-scene-options" placeholder="例如：原点场景" maxLength={120} />
              </Form.Item>
              <Form.Item name="contentSceneGroup" label="大场景">
                <Input list="content-asset-profile-content-scene-group-options" placeholder="输入大场景" maxLength={120} />
              </Form.Item>
              <Form.Item name="contentSceneSubtype" label="细分场景">
                <Input list="content-asset-profile-content-scene-subtype-options" placeholder="输入细分场景" maxLength={120} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="skuNames" label="SKU">
            <Select
              allowClear
              showSearch
              mode="tags"
              maxTagCount="responsive"
              tokenSeparators={[',', '，', '/']}
              placeholder="选择或输入 SKU，可多选"
              optionFilterProp="searchText"
              options={skuOptions}
            />
          </Form.Item>
          <Form.Item name="creatorName" label="达人昵称">
            <Input placeholder="请输入达人昵称" maxLength={120} />
          </Form.Item>
          <Form.Item name="profileStatus" label="档案状态">
            <Select options={PROFILE_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="lifecycleStatus" label="流转阶段">
            <Select options={LIFECYCLE_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="authorizationStatus" label="授权状态">
            <Select options={AUTHORIZATION_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="commercialUseAllowed" label="可商用">
            <Select options={NULLABLE_BOOLEAN_OPTIONS} />
          </Form.Item>
          <Form.Item name="repurposeAllowed" label="可复剪">
            <Select options={NULLABLE_BOOLEAN_OPTIONS} />
          </Form.Item>
          <Form.Item name="authorizationStartsAt" label="授权开始">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="authorizationExpiresAt" label="授权到期">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="tags" label="标签" className={styles.formWide}>
            <ContentAssetsTagPicker
              disabled={saving}
              options={filterOptions.tags}
              placeholder="搜索或新增标签，例如：卖点、场景、钩子、产品线"
            />
          </Form.Item>
          <Form.Item name="notes" label="业务备注" className={styles.formWide}>
            <Input.TextArea rows={3} placeholder="补充素材来源、使用限制、复剪方向或业务判断" maxLength={2000} />
          </Form.Item>
          <Form.Item name="authorizationNotes" label="授权备注" className={styles.formWide}>
            <Input.TextArea rows={2} placeholder="补充授权范围、到期提醒、合同或沟通记录" maxLength={1000} />
          </Form.Item>
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
      </Form>
    </Modal>
  );
}

function normalizeScenePathSegments(path?: readonly (string | null | undefined)[] | null): string[] {
  return (path || [])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function scenePathExistsInOptions(
  path: readonly string[],
  options: readonly ContentAssetSceneCascaderOption[]
): boolean {
  let currentOptions = options;
  for (const segment of path) {
    const matchedOption = currentOptions.find((option) => option.value === segment);
    if (!matchedOption) return false;
    currentOptions = matchedOption.children || [];
  }
  return true;
}

function createScenePathOption(path: readonly string[]): ContentAssetSceneCascaderOption {
  const [head, ...tail] = path;
  return {
    label: head,
    value: head,
    children: tail.length ? [createScenePathOption(tail)] : undefined,
  };
}

function mergeSceneOptionsWithCurrentPath(
  options: ContentAssetSceneCascaderOption[],
  currentPath?: readonly (string | null | undefined)[] | null
): ContentAssetSceneCascaderOption[] {
  const normalizedPath = normalizeScenePathSegments(currentPath);
  if (normalizedPath.length === 0 || scenePathExistsInOptions(normalizedPath, options)) {
    return options;
  }

  return [...options, createScenePathOption(normalizedPath)];
}
