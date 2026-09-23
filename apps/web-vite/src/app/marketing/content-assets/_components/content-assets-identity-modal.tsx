import { useEffect, useMemo, useState } from 'react';
import { Alert, Form, message, Modal } from 'antd';
import type {
  ContentAssetAdMaterial,
  ContentAssetAdMaterialCreatePayload,
  ContentAssetDetailResponse,
  ContentAssetPlatformVideo,
  ContentAssetPlatformVideoCreatePayload,
} from '../_lib/content-assets-types';
import {
  hasSupportedDouyinUrlInput,
  resolveDouyinVideoIdErrorMessage,
  resolveDouyinVideoIdFromInput,
} from '../_lib/content-assets-douyin-video-id';
import { resolveContentAssetDisplayTitle } from '../_lib/content-assets-display';
import {
  AdMaterialFields,
  type IdentityFormValues,
  PlatformVideoFields,
} from './content-assets-identity-modal-fields';
import styles from '../content-assets.module.css';

export type ContentAssetIdentityModalMode = 'platform-video' | 'ad-material';

interface ContentAssetIdentityModalProps {
  open: boolean;
  mode: ContentAssetIdentityModalMode;
  detail: ContentAssetDetailResponse | null;
  platformVideo?: ContentAssetPlatformVideo | null;
  adMaterial?: ContentAssetAdMaterial | null;
  saving?: boolean;
  onCancel: () => void;
  onSubmitPlatformVideo: (payload: ContentAssetPlatformVideoCreatePayload) => void;
  onSubmitAdMaterial: (payload: ContentAssetAdMaterialCreatePayload) => void;
}

const EMPTY_IDENTITY_FORM_VALUES: IdentityFormValues = {
  platform: undefined,
  accountId: undefined,
  accountName: undefined,
  advertiserId: undefined,
  externalVideoId: undefined,
  externalItemId: undefined,
  externalNoteId: undefined,
  externalUrl: undefined,
  publishTitle: undefined,
  publishStatus: undefined,
  platformVideoId: undefined,
  adPlatform: undefined,
  externalMaterialId: undefined,
  materialName: undefined,
  materialTitle: undefined,
  materialStatus: undefined,
};

type QianchuanMaterialHintReview = {
  materialId: string | null;
  message: string;
  requiresConfirmation: boolean;
};

export function ContentAssetIdentityModal({
  open,
  mode,
  detail,
  platformVideo,
  adMaterial,
  saving,
  onCancel,
  onSubmitPlatformVideo,
  onSubmitAdMaterial,
}: ContentAssetIdentityModalProps) {
  const [form] = Form.useForm<IdentityFormValues>();
  const [resolvingDouyinVideoId, setResolvingDouyinVideoId] = useState(false);
  const asset = detail?.asset;
  const isEditingPlatformVideo = mode === 'platform-video' && !!platformVideo;
  const isEditingAdMaterial = mode === 'ad-material' && !!adMaterial;
  const title =
    mode === 'platform-video'
      ? `${isEditingPlatformVideo ? '编辑' : '新增'}平台身份${asset ? `：${resolveContentAssetDisplayTitle(asset)}` : ''}`
      : `${isEditingAdMaterial ? '编辑' : '新增'}广告素材实例${asset ? `：${resolveContentAssetDisplayTitle(asset)}` : ''}`;
  const identityFormKey = [
    mode,
    asset?.assetId || 'no-asset',
    platformVideo?.platformVideoId || 'new-platform-video',
    platformVideo?.externalVideoId || '',
    platformVideo?.externalItemId || '',
    adMaterial?.adMaterialId || 'new-ad-material',
    adMaterial?.externalMaterialId || '',
    adMaterial?.externalVideoId || '',
  ].join(':');
  const identityInitialValues = useMemo(
    () => ({
      ...EMPTY_IDENTITY_FORM_VALUES,
      ...buildInitialValues(mode, detail, platformVideo, adMaterial),
    }),
    [adMaterial, detail, mode, platformVideo]
  );
  const qianchuanMaterialHintReview = useMemo(
    () => resolveQianchuanMaterialHintReview(
      mode,
      detail,
      identityInitialValues,
      platformVideo,
      adMaterial
    ),
    [adMaterial, detail, identityInitialValues, mode, platformVideo]
  );

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }
    form.resetFields();
    form.setFieldsValue(identityInitialValues);
  }, [form, identityInitialValues, open]);

  return (
    <Modal
      title={title}
      open={open}
      width={720}
      confirmLoading={saving}
      okText={mode === 'platform-video' ? '保存平台身份' : '保存素材实例'}
      cancelText="取消"
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Alert
        className={styles.modalHint}
        type="info"
        showIcon
        message={mode === 'platform-video' ? '维护视频 ID / 笔记 ID' : '维护广告素材 ID'}
        description={
          mode === 'platform-video'
            ? '视频 ID 是平台物理内容身份，后续自然流量或内容表现日报会优先按这里匹配。'
            : '素材 ID 是广告系统里的投放实例身份；千川等广告日报会按素材 ID 回流，再映射到当前 asset_id。'
        }
      />
      {qianchuanMaterialHintReview ? (
        <Alert
          className={styles.modalHint}
          type="warning"
          showIcon
          message={qianchuanMaterialHintReview.message}
        />
      ) : null}
      <Form<IdentityFormValues>
        key={identityFormKey}
        form={form}
        initialValues={identityInitialValues}
        layout="vertical"
        preserve={false}
        onFinish={(values) => void handleFinish(values)}
      >
        {mode === 'platform-video' ? (
          <PlatformVideoFields
            resolvingDouyinVideoId={resolvingDouyinVideoId}
            onResolveDouyinVideoId={() => void resolveDouyinVideoIdForValues(form.getFieldsValue(), true)}
          />
        ) : (
          <AdMaterialFields detail={detail} />
        )}
      </Form>
    </Modal>
  );

  async function handleFinish(values: IdentityFormValues) {
    if (mode === 'platform-video') {
      const nextValues = await resolveDouyinVideoIdBeforeSubmit(values);
      if (!nextValues) return;
      if (!(await confirmQianchuanMaterialHintBeforeSubmit(nextValues))) return;
      onSubmitPlatformVideo(valuesToPlatformVideoPayload(nextValues));
      return;
    }
    if (!(await confirmQianchuanMaterialHintBeforeSubmit(values))) return;
    onSubmitAdMaterial(valuesToAdMaterialPayload(values));
  }

  async function confirmQianchuanMaterialHintBeforeSubmit(values: IdentityFormValues): Promise<boolean> {
    if (!qianchuanMaterialHintReview?.requiresConfirmation || !qianchuanMaterialHintReview.materialId) {
      return true;
    }
    const submittedMaterialId = mode === 'platform-video'
      ? emptyToNull(values.externalItemId)
      : emptyToNull(values.externalMaterialId);
    if (submittedMaterialId !== qianchuanMaterialHintReview.materialId) {
      return true;
    }
    return new Promise((resolve) => {
      Modal.confirm({
        title: '确认千川素材 ID',
        content: `系统根据短视频明细推断千川素材 ID：${qianchuanMaterialHintReview.materialId}。请确认业务已核对该素材 ID 与当前视频/素材一致。`,
        okText: '已核对，继续保存',
        cancelText: '返回修改',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  async function resolveDouyinVideoIdBeforeSubmit(
    values: IdentityFormValues
  ): Promise<IdentityFormValues | null> {
    const externalUrl = emptyToNull(values.externalUrl);
    if (!externalUrl || emptyToNull(values.externalVideoId)) {
      return values;
    }
    if (!shouldResolveDouyinVideoIdOnSubmit(values, externalUrl)) {
      return values;
    }
    return resolveDouyinVideoIdForValues(values, false);
  }

  async function resolveDouyinVideoIdForValues(
    values: IdentityFormValues,
    showSuccess: boolean
  ): Promise<IdentityFormValues | null> {
    const externalUrl = emptyToNull(values.externalUrl);
    if (!externalUrl) {
      form.setFields([{ name: 'externalUrl', errors: ['请先粘贴抖音视频链接或分享文案'] }]);
      return null;
    }
    setResolvingDouyinVideoId(true);
    try {
      const resolved = await resolveDouyinVideoIdFromInput(externalUrl);
      const nextValues: IdentityFormValues = {
        ...values,
        platform: 'douyin',
        externalUrl: resolved.resolvedUrl || resolved.sourceUrl || externalUrl,
        externalVideoId: resolved.externalVideoId,
      };
      form.setFields([
        { name: 'externalUrl', errors: [] },
        { name: 'externalVideoId', errors: [] },
        { name: 'platform', errors: [] },
      ]);
      form.setFieldsValue(nextValues);
      if (showSuccess) {
        message.success('已提取抖音视频 ID');
      }
      return nextValues;
    } catch (error) {
      const errorMessage = resolveDouyinVideoIdErrorMessage(error);
      form.setFields([{ name: 'externalUrl', errors: [errorMessage] }]);
      message.error(errorMessage);
      return null;
    } finally {
      setResolvingDouyinVideoId(false);
    }
  }
}

function shouldResolveDouyinVideoIdOnSubmit(values: IdentityFormValues, externalUrl: string): boolean {
  const platform = emptyToNull(values.platform)?.toLowerCase();
  return platform === 'douyin' || platform === '抖音' || hasSupportedDouyinUrlInput(externalUrl);
}

function buildInitialValues(
  mode: ContentAssetIdentityModalMode,
  detail: ContentAssetDetailResponse | null,
  platformVideo?: ContentAssetPlatformVideo | null,
  adMaterial?: ContentAssetAdMaterial | null
): IdentityFormValues {
  const asset = detail?.asset;
  const shortVideoHint = detail?.shortVideoProfileHint ?? null;
  const hintCreatorAccountId = shortVideoHint?.creatorAccountId || undefined;
  const hintCreatorName = shortVideoHint?.creatorName || undefined;
  const hintVideoId = uniqueHintArrayValue(shortVideoHint?.videoIds);
  const hintMaterialId = uniqueHintArrayValue(shortVideoHint?.qianchuanMaterialIds);
  if (mode === 'platform-video') {
    if (platformVideo) {
      return {
        platform: platformVideo.platform,
        accountId: platformVideo.accountId || hintCreatorAccountId,
        accountName: platformVideo.accountName || hintCreatorName || asset?.creatorName || undefined,
        advertiserId: platformVideo.advertiserId || undefined,
        externalVideoId: platformVideo.externalVideoId || hintVideoId,
        externalItemId: platformVideo.externalItemId || hintMaterialId,
        externalNoteId: platformVideo.externalNoteId || undefined,
        externalUrl: platformVideo.externalUrl || undefined,
        publishTitle: platformVideo.publishTitle || undefined,
        publishStatus: platformVideo.publishStatus || 'unknown',
      };
    }
    return {
      platform: asset?.platformNames?.[0] || asset?.platform || undefined,
      accountId: hintCreatorAccountId,
      accountName: hintCreatorName || asset?.creatorName || undefined,
      externalVideoId: hintVideoId,
      externalItemId: hintMaterialId,
      publishStatus: 'unknown',
    };
  }
  if (adMaterial) {
    return {
      platformVideoId: adMaterial.platformVideoId || undefined,
      adPlatform: adMaterial.adPlatform,
      accountId: adMaterial.accountId || hintCreatorAccountId,
      accountName: adMaterial.accountName || hintCreatorName || asset?.creatorName || undefined,
      advertiserId: adMaterial.advertiserId || undefined,
      externalMaterialId: adMaterial.externalMaterialId,
      externalVideoId: adMaterial.externalVideoId || hintVideoId,
      materialName: adMaterial.materialName || undefined,
      materialTitle: adMaterial.materialTitle || undefined,
      materialStatus: adMaterial.materialStatus || 'unknown',
    };
  }
  const defaultPlatformVideo = resolveUniquePlatformVideo(detail);
  return {
    platformVideoId: defaultPlatformVideo?.platformVideoId,
    adPlatform: 'qianchuan',
    accountId: defaultPlatformVideo?.accountId || hintCreatorAccountId,
    accountName: defaultPlatformVideo?.accountName || hintCreatorName || asset?.creatorName || undefined,
    externalMaterialId: defaultPlatformVideo?.externalItemId || hintMaterialId,
    externalVideoId: defaultPlatformVideo?.externalVideoId || hintVideoId,
    materialStatus: 'unknown',
  };
}

function uniqueHintArrayValue(values: string[] | undefined): string | undefined {
  const normalized = Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
  return normalized.length === 1 ? normalized[0] : undefined;
}

function normalizedHintArrayValues(values: string[] | undefined): string[] {
  return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
}

function resolveQianchuanMaterialHintReview(
  mode: ContentAssetIdentityModalMode,
  detail: ContentAssetDetailResponse | null,
  identityInitialValues: IdentityFormValues,
  platformVideo?: ContentAssetPlatformVideo | null,
  adMaterial?: ContentAssetAdMaterial | null
): QianchuanMaterialHintReview | null {
  const materialIds = normalizedHintArrayValues(detail?.shortVideoProfileHint?.qianchuanMaterialIds);
  if (materialIds.length > 1) {
    return {
      materialId: null,
      message: `短视频明细命中多个千川素材 ID：${materialIds.slice(0, 3).join('、')}${materialIds.length > 3 ? ` 等 ${materialIds.length} 个` : ''}。系统不会自动预填，请业务核对后手动填写。`,
      requiresConfirmation: false,
    };
  }
  if (materialIds.length !== 1) {
    return null;
  }

  const materialId = materialIds[0];
  const defaultPlatformVideo = resolveUniquePlatformVideo(detail);
  if (mode === 'platform-video') {
    const filledFromHint = identityInitialValues.externalItemId === materialId
      && emptyToNull(platformVideo?.externalItemId || undefined) !== materialId;
    if (!filledFromHint) return null;
  } else {
    const filledFromHint = identityInitialValues.externalMaterialId === materialId
      && emptyToNull(adMaterial?.externalMaterialId || undefined) !== materialId
      && emptyToNull(defaultPlatformVideo?.externalItemId || undefined) !== materialId;
    if (!filledFromHint) return null;
  }

  return {
    materialId,
    message: `已根据短视频明细匹配到唯一千川素材 ID：${materialId}。请业务核对后保存；如不一致请手动修改。`,
    requiresConfirmation: true,
  };
}

function resolveUniquePlatformVideo(
  detail: ContentAssetDetailResponse | null
): ContentAssetPlatformVideo | undefined {
  const platformVideos = detail?.platformVideos || [];
  return platformVideos.length === 1 ? platformVideos[0] : undefined;
}

function valuesToPlatformVideoPayload(values: IdentityFormValues): ContentAssetPlatformVideoCreatePayload {
  return {
    platform: values.platform || '',
    accountId: emptyToNull(values.accountId),
    accountName: emptyToNull(values.accountName),
    advertiserId: emptyToNull(values.advertiserId),
    externalVideoId: emptyToNull(values.externalVideoId),
    externalItemId: emptyToNull(values.externalItemId),
    externalNoteId: emptyToNull(values.externalNoteId),
    externalUrl: emptyToNull(values.externalUrl),
    publishTitle: emptyToNull(values.publishTitle),
    publishStatus: emptyToNull(values.publishStatus),
  };
}

function valuesToAdMaterialPayload(values: IdentityFormValues): ContentAssetAdMaterialCreatePayload {
  return {
    platformVideoId: emptyToNull(values.platformVideoId),
    adPlatform: values.adPlatform || '',
    accountId: emptyToNull(values.accountId),
    accountName: emptyToNull(values.accountName),
    advertiserId: emptyToNull(values.advertiserId),
    externalMaterialId: values.externalMaterialId || '',
    externalVideoId: emptyToNull(values.externalVideoId),
    materialName: emptyToNull(values.materialName),
    materialTitle: emptyToNull(values.materialTitle),
    materialStatus: emptyToNull(values.materialStatus),
  };
}

function emptyToNull(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
