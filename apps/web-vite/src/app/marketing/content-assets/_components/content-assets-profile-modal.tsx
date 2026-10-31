import { useCallback, useEffect, useMemo } from 'react';
import { Alert, Modal } from '@lobehub/ui';
import type {
  ContentAssetDetailResponse,
  ContentAssetFilterOptions,
  ContentAssetProfileUpdatePayload,
} from '../_lib/content-assets-types';
import { resolveContentAssetDisplayTitle } from '../_lib/content-assets-display';
import { CONTENT_ASSET_PLATFORM_OPTIONS } from '../_lib/content-assets-platforms';
import {
  isContentAssetScenePathValidForProducts,
  isContentAssetSceneOptionsConfigured,
  isContentAssetSceneVideoType,
  resolveContentAssetProductOptions,
  resolveContentAssetSceneOptionsForProducts,
  resolveContentAssetVideoTypeOptions,
  type ContentAssetSceneCascaderOption,
} from '../_lib/content-assets-ui-helpers';
import styles from '../content-assets.module.css';
import { buildContentAssetPlatformSelectOptions } from './content-assets-platform-select';
import { ContentAssetsProfileFormFields } from './content-assets-profile-form-fields';
import {
  buildOwnerSelectOptions,
  buildPlainSelectOptions,
  detailToFormValues,
  formValuesToPayload,
  type ProfileFormValues,
} from './content-assets-profile-modal-values';
import { useControlledForm } from '@/hooks/use-controlled-form';

interface ContentAssetProfileModalProps {
  open: boolean;
  detail: ContentAssetDetailResponse | null;
  saving?: boolean;
  filterOptions: ContentAssetFilterOptions;
  onCancel: () => void;
  onSubmit: (payload: ContentAssetProfileUpdatePayload) => void;
}

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
  const form = useControlledForm<ProfileFormValues>({
    initialValues: profileInitialValues ?? ({} as ProfileFormValues),
    rules: { title: [{ required: true, message: '请输入素材标题' }] },
    onFinish: (values) => onSubmit(formValuesToPayload(values, ownerOptions)),
  });
  const { videoType, productNames, scenePath } = form.values;
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
        title="这里维护的是业务档案，不是 TOS 对象元数据"
        description={
          shortVideoProfileHint?.matchStatus === 'unique'
            ? '已根据视频 ID / 千川素材 ID 找到短视频明细回流信息，空白的产品、达人、视频类型和场景会预填；保存后才会固化到素材档案。'
            : shortVideoProfileHint?.matchStatus === 'ambiguous'
              ? '当前视频 ID / 千川素材 ID 命中多条短视频明细；编辑表单只会预填可唯一确认的回流字段，不会自动写入冲突来源，请人工确认后保存。'
              : 'TOS 只负责原片、预览视频、封面等对象文件；产品、达人、授权、标签、流转阶段都保存在数据库，后续日报回流会按平台 ID / 素材 ID 关联到这里。'
        }
      />
      <ContentAssetsProfileFormFields
        form={form}
        saving={saving}
        filterOptions={filterOptions}
        displayTitleHint={shouldShowDisplayTitleHint ? `当前列表展示：${displayTitle}。保存前不会自动覆盖原始标题。` : undefined}
        platformOptions={platformOptions}
        productOptions={productOptions}
        ownerOptions={ownerOptions}
        videoTypeOptions={videoTypeOptions}
        skuOptions={skuOptions}
        contentSceneOptions={contentSceneOptions}
        contentSceneGroupOptions={contentSceneGroupOptions}
        contentSceneSubtypeOptions={contentSceneSubtypeOptions}
        sceneOptions={sceneOptions}
        sceneOptionsConfigured={sceneOptionsConfigured}
        sceneSelectionDisabled={sceneSelectionDisabled}
        showSceneCascade={showSceneCascade}
      />
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
