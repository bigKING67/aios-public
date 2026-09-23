import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, message, Modal } from 'antd';
import {
  isImportableVideoLinkCandidate,
  previewVideoLinkFromInput,
  resolveCandidateSuggestedExternalItemId,
  resolveQianchuanMaterialCandidateReviewNotice,
  resolveVideoLinkCandidateLabel,
  resolveVideoLinkPreviewErrorMessage,
} from '../_lib/content-assets-video-link-preview';
import { resolveContentAssetDisplayTitle } from '../_lib/content-assets-display';
import {
  isContentAssetScenePathValidForProducts,
  isContentAssetSceneOptionsConfigured,
  isContentAssetSceneVideoType,
  resolveContentAssetProductOptions,
  resolveContentAssetSceneOptionsForProducts,
  resolveContentAssetVideoTypeOptions,
} from '../_lib/content-assets-ui-helpers';
import type {
  ContentAssetFilterOptions,
  ContentAssetItem,
  ContentAssetVideoLinkAwaitingManualUploadResponse,
  ContentAssetVideoLinkImportPayload,
  ContentAssetVideoLinkImportResponse,
  ContentAssetUploadMutationPayload,
  ContentAssetUploadProgress,
  ContentAssetVideoLinkPreviewCandidate,
} from '../_lib/content-assets-types';
import { buildContentAssetDefaultPlatformOptions } from './content-assets-platform-select';
import { ContentAssetsImportFormFields } from './content-assets-import-form-fields';
import {
  buildOwnerSelectOptions,
  buildPlainSelectOptions,
  buildUploadMetadataPayload,
  type ContentAssetUploadPrefill,
  emptyToNull,
  ensureDouyinPlatform,
  getFileExt,
  inferTitle,
  type UploadFormValues,
  VIDEO_EXTENSIONS,
} from './content-assets-import-modal-values';
import { ContentAssetsImportUploadPanel } from './content-assets-import-upload-panel';
import uploadStyles from './content-assets-upload-modal.module.css';

export function ContentAssetsUploadModal({
  confirmLoading,
  onCancel,
  onSubmit,
  onSubmitVideoLink,
  open,
  progress,
  sourceAsset,
  uploadPrefill,
  filterOptions,
}: {
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmit: (payload: ContentAssetUploadMutationPayload) => void;
  onSubmitVideoLink: (payload: ContentAssetVideoLinkImportPayload) => Promise<ContentAssetVideoLinkImportResponse>;
  open: boolean;
  progress: ContentAssetUploadProgress | null;
  sourceAsset?: ContentAssetItem | null;
  uploadPrefill?: ContentAssetUploadPrefill | null;
  filterOptions: ContentAssetFilterOptions;
}) {
  const [form] = Form.useForm<UploadFormValues>();
  const videoType = Form.useWatch('videoType', form);
  const productNames = Form.useWatch('productNames', form);
  const externalUrl = Form.useWatch('externalUrl', form);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [resolvingVideoLinkPreview, setResolvingVideoLinkPreview] = useState(false);
  const [videoLinkPreviewCandidates, setVideoLinkPreviewCandidates] = useState<
    ContentAssetVideoLinkPreviewCandidate[]
  >([]);
  const [videoLinkPreviewNotice, setVideoLinkPreviewNotice] = useState<string | null>(null);
  const [qianchuanMaterialReview, setQianchuanMaterialReview] = useState<QianchuanMaterialReviewState | null>(null);
  const [selectedVideoLinkCandidateIndex, setSelectedVideoLinkCandidateIndex] = useState<number | null>(null);
  const [videoLinkPreviewInput, setVideoLinkPreviewInput] = useState<string | null>(null);
  const [awaitingManualUpload, setAwaitingManualUpload] =
    useState<ContentAssetVideoLinkAwaitingManualUploadResponse | null>(null);
  const videoLinkPreviewRequestIdRef = useRef(0);
  const autoAppliedVideoLinkIdentityRef = useRef<AutoAppliedVideoLinkIdentity | null>(null);
  const qianchuanMaterialReviewConfirmedKeyRef = useRef<string | null>(null);
  const isSourceUpload = Boolean(sourceAsset);
  const sourceAssetTitle = sourceAsset ? resolveContentAssetDisplayTitle(sourceAsset) : '';
  const productOptions = useMemo(() => resolveContentAssetProductOptions(filterOptions.products), [filterOptions.products]);
  const skuOptions = useMemo(() => buildPlainSelectOptions(filterOptions.skus), [filterOptions.skus]);
  const contentSceneOptions = useMemo(
    () => buildPlainSelectOptions(filterOptions.contentScenes || []),
    [filterOptions.contentScenes]
  );
  const contentSceneGroupOptions = useMemo(
    () => buildPlainSelectOptions(filterOptions.contentSceneGroups || []),
    [filterOptions.contentSceneGroups]
  );
  const contentSceneSubtypeOptions = useMemo(
    () => buildPlainSelectOptions(filterOptions.contentSceneSubtypes || []),
    [filterOptions.contentSceneSubtypes]
  );
  const videoTypeOptions = useMemo(
    () => resolveContentAssetVideoTypeOptions(filterOptions.videoTypes),
    [filterOptions.videoTypes]
  );
  const platformOptions = useMemo(() => buildContentAssetDefaultPlatformOptions(), []);
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(filterOptions), [filterOptions]);
  const hasOwnerOptions = ownerOptions.length > 0;
  const showSceneCascade = isContentAssetSceneVideoType(videoType);
  const sceneOptionsConfigured = isContentAssetSceneOptionsConfigured();
  const sceneOptions = useMemo(
    () => resolveContentAssetSceneOptionsForProducts(productNames),
    [productNames]
  );
  const sceneSelectionDisabled = showSceneCascade && sceneOptions.length === 0;
  const hasVideoLinkInput = Boolean(emptyToNull(externalUrl));
  const selectedImportableVideoLinkCandidate = useMemo(() => {
    const selectedIndex = selectedVideoLinkCandidateIndex
      ?? (videoLinkPreviewCandidates.length === 1 ? 0 : null);
    return selectedIndex == null ? null : videoLinkPreviewCandidates[selectedIndex] ?? null;
  }, [selectedVideoLinkCandidateIndex, videoLinkPreviewCandidates]);

  const handleFormValuesChange = (changedValues: Partial<UploadFormValues>) => {
    const autoAppliedIdentity = autoAppliedVideoLinkIdentityRef.current;
    let nextAutoAppliedIdentity = autoAppliedIdentity;
    if (Object.prototype.hasOwnProperty.call(changedValues, 'externalVideoId')) {
      qianchuanMaterialReviewConfirmedKeyRef.current = null;
      if (autoAppliedIdentity?.externalVideoId) {
        const nextExternalVideoId = emptyToNull(changedValues.externalVideoId);
        if (nextExternalVideoId !== autoAppliedIdentity.externalVideoId) {
          nextAutoAppliedIdentity = { ...autoAppliedIdentity, externalVideoId: null };
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(changedValues, 'externalItemId')) {
      qianchuanMaterialReviewConfirmedKeyRef.current = null;
      if (autoAppliedIdentity?.externalItemId) {
        const nextExternalItemId = emptyToNull(changedValues.externalItemId);
        if (nextExternalItemId !== autoAppliedIdentity.externalItemId) {
          nextAutoAppliedIdentity = { ...(nextAutoAppliedIdentity || autoAppliedIdentity), externalItemId: null };
        }
      }
      const currentValues = form.getFieldsValue();
      setQianchuanMaterialReview(resolveCurrentQianchuanMaterialReview(currentValues, qianchuanMaterialReview));
    }
    if (
      nextAutoAppliedIdentity
      && !nextAutoAppliedIdentity.externalVideoId
      && !nextAutoAppliedIdentity.externalItemId
    ) {
      nextAutoAppliedIdentity = null;
    }
    if (nextAutoAppliedIdentity !== autoAppliedIdentity) {
      autoAppliedVideoLinkIdentityRef.current = nextAutoAppliedIdentity;
    }
  };

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setFile(null);
      setFileError('');
      setVideoLinkPreviewCandidates([]);
      setVideoLinkPreviewNotice(null);
      setQianchuanMaterialReview(null);
      setSelectedVideoLinkCandidateIndex(null);
      setVideoLinkPreviewInput(null);
      setAwaitingManualUpload(null);
      autoAppliedVideoLinkIdentityRef.current = null;
      qianchuanMaterialReviewConfirmedKeyRef.current = null;
      videoLinkPreviewRequestIdRef.current += 1;
    }
  }, [form, open]);

  useEffect(() => {
    if (!open || isSourceUpload || !uploadPrefill) {
      return;
    }

    form.setFieldsValue(uploadPrefill.values);
    setVideoLinkPreviewNotice(uploadPrefill.notice);
    setQianchuanMaterialReview(resolveQianchuanMaterialReviewFromPrefill(uploadPrefill));
    qianchuanMaterialReviewConfirmedKeyRef.current = null;
  }, [form, isSourceUpload, open, uploadPrefill]);

  useEffect(() => {
    if (!showSceneCascade) {
      form.setFieldsValue({
        scenePath: undefined,
        contentScene: undefined,
        contentSceneGroup: undefined,
        contentSceneSubtype: undefined,
      });
      return;
    }
    if (!isContentAssetScenePathValidForProducts(form.getFieldValue('scenePath'), productNames)) {
      form.setFieldsValue({
        scenePath: undefined,
        contentScene: undefined,
        contentSceneGroup: undefined,
        contentSceneSubtype: undefined,
      });
    }
  }, [form, productNames, showSceneCascade]);

  const handleSelectFile = (selectedFile: File) => {
    const ext = getFileExt(selectedFile.name);
    if (!VIDEO_EXTENSIONS.includes(ext)) {
      setFile(null);
      setFileError('仅支持 mp4 / mov / m4v / webm / avi / mkv 视频源文件');
      return;
    }
    setFile(selectedFile);
    setFileError('');
    const currentTitle = form.getFieldValue('title');
    if (!currentTitle) {
      form.setFieldValue('title', inferTitle(selectedFile.name));
    }
  };

  const submit = async () => {
    if (sourceAsset) {
      if (!file) {
        setFileError('请先选择要上传的视频源文件');
        return;
      }
      onSubmit({
        sourceAssetId: sourceAsset.assetId,
        file,
        metadata: {},
      });
      return;
    }
    const rawValues = await form.validateFields();
    if (!file) {
      if (awaitingManualUpload) {
        const errorMessage = '请先选择本地视频源文件，上传后系统会自动绑定已识别的抖音视频 ID。';
        setFileError(errorMessage);
        message.warning(errorMessage);
        return;
      }
      await submitVideoLinkImport(rawValues);
      return;
    }
    const preparedValues = await previewVideoLinkBeforeSubmit(rawValues);
    if (!preparedValues) return;
    const currentReview = resolveCurrentQianchuanMaterialReview(
      preparedValues.values,
      preparedValues.qianchuanMaterialReview
    );
    if (!(await confirmQianchuanMaterialReviewBeforeSubmit(preparedValues.values, currentReview))) return;
    const { metadata, platformVideo } = buildUploadMetadataPayload(preparedValues.values, ownerOptions);
    if (platformVideo && !platformVideo.platform) {
      form.setFields([{ name: 'platformNames', errors: ['填写抖音视频ID、千川素材ID或笔记ID时需要先选择平台'] }]);
      return;
    }
    onSubmit({
      file,
      metadata,
      platformVideo,
    });
  };

  const submitVideoLinkImport = async (rawValues: UploadFormValues) => {
    const selection = await resolveVideoLinkImportSelection(rawValues);
    if (!selection) return;
    if (!isImportableVideoLinkCandidate(selection.candidate)) {
      const errorMessage = '该链接类型暂不支持远程导入；请上传本地源文件，或选择抖音/千川视频链接。';
      setFileError(errorMessage);
      form.setFields([{ name: 'externalUrl', errors: [errorMessage] }]);
      return;
    }
    const { metadata, platformVideo } = buildUploadMetadataPayload(selection.values, ownerOptions);
    if (platformVideo && !platformVideo.platform) {
      form.setFields([{ name: 'platformNames', errors: ['填写抖音视频ID、千川素材ID或笔记ID时需要先选择平台'] }]);
      return;
    }
    const currentReview = resolveCurrentQianchuanMaterialReview(
      selection.values,
      selection.qianchuanMaterialReview
    );
    if (!(await confirmQianchuanMaterialReviewBeforeSubmit(selection.values, currentReview))) return;
    setFileError('');
    const payload = {
      ...metadata,
      input: selection.input,
      candidateIndex: selection.candidateIndex,
      externalVideoId: platformVideo?.externalVideoId ?? null,
      externalItemId: platformVideo?.externalItemId ?? null,
      externalNoteId: platformVideo?.externalNoteId ?? null,
    };
    try {
      const response = await onSubmitVideoLink(payload);
      if (response.status === 'awaiting_manual_upload') {
        applyAwaitingManualUploadResponse(selection, response);
      }
    } catch {
      // The mutation owns the visible error message; keep the modal state intact for retry/manual upload.
    }
  };

  const resolveVideoLinkImportSelection = async (
    rawValues: UploadFormValues
  ): Promise<VideoLinkPreviewApplyResult | null> => {
    const externalUrl = emptyToNull(rawValues.externalUrl);
    if (!externalUrl) {
      const errorMessage = '请选择视频源文件，或粘贴并解析抖音/千川视频链接';
      setFileError(errorMessage);
      form.setFields([{ name: 'externalUrl', errors: [errorMessage] }]);
      return null;
    }
    const selectedIndex = selectedVideoLinkCandidateIndex
      ?? (videoLinkPreviewCandidates.length === 1 ? 0 : null);
    if (videoLinkPreviewCandidates.length > 0) {
      if (selectedIndex == null) {
        const errorMessage = '识别到多个视频链接，请先选择要导入的视频链接';
        form.setFields([{ name: 'externalUrl', errors: [errorMessage] }]);
        message.warning(errorMessage);
        return null;
      }
      const candidate = videoLinkPreviewCandidates[selectedIndex];
      if (!candidate) {
        const errorMessage = '选择的视频链接已失效，请重新解析后再导入';
        form.setFields([{ name: 'externalUrl', errors: [errorMessage] }]);
        return null;
      }
      const baseValues = clearAutoAppliedVideoLinkIdentityFromValues(rawValues);
      const values = applyVideoLinkCandidateToFormValues(baseValues, candidate);
      const review = resolveQianchuanMaterialReviewState(baseValues, values, candidate);
      setSelectedVideoLinkCandidateIndex(selectedIndex);
      setVideoLinkPreviewNotice(resolveVideoLinkCandidateNotice(values, candidate));
      setQianchuanMaterialReview(review);
      form.setFields([
        { name: 'externalUrl', errors: [] },
        { name: 'externalVideoId', errors: [] },
        { name: 'externalItemId', errors: [] },
        { name: 'platformNames', errors: [] },
      ]);
      form.setFieldsValue(values);
      return {
        candidate,
        candidateIndex: selectedIndex,
        input: videoLinkPreviewInput || externalUrl,
        qianchuanMaterialReview: review,
        values,
      };
    }
    return previewVideoLinkForValues(rawValues, {
      showSuccess: false,
      allowMultiple: false,
    });
  };

  const handlePreviewVideoLink = async () => {
    const values = form.getFieldsValue();
    await previewVideoLinkForValues(values, {
      showSuccess: true,
      allowMultiple: true,
    });
  };

  const handleVideoLinkInputChange = () => {
    videoLinkPreviewRequestIdRef.current += 1;
    setResolvingVideoLinkPreview(false);
    setFileError('');
    setVideoLinkPreviewCandidates([]);
    setVideoLinkPreviewNotice(null);
    setQianchuanMaterialReview(null);
    setSelectedVideoLinkCandidateIndex(null);
    setVideoLinkPreviewInput(null);
    setAwaitingManualUpload(null);
    qianchuanMaterialReviewConfirmedKeyRef.current = null;
    clearAutoAppliedVideoLinkIdentityFromValues(form.getFieldsValue());
    form.setFields([
      { name: 'externalUrl', errors: [] },
      { name: 'externalVideoId', errors: [] },
      { name: 'externalItemId', errors: [] },
    ]);
  };

  const previewVideoLinkBeforeSubmit = async (
    values: UploadFormValues
  ): Promise<PreparedUploadFormValues | null> => {
    if (
      !emptyToNull(values.externalUrl)
      || emptyToNull(values.externalVideoId)
    ) {
      return {
        qianchuanMaterialReview,
        values,
      };
    }
    const previewResult = await previewVideoLinkForValues(values, {
      showSuccess: false,
      allowMultiple: false,
    });
    return previewResult
      ? {
          qianchuanMaterialReview: previewResult.qianchuanMaterialReview,
          values: previewResult.values,
        }
      : null;
  };

  const previewVideoLinkForValues = async (
    values: UploadFormValues,
    options: { showSuccess: boolean; allowMultiple: boolean }
  ): Promise<VideoLinkPreviewApplyResult | null> => {
    const externalUrl = emptyToNull(values.externalUrl);
    if (!externalUrl) {
      form.setFields([{ name: 'externalUrl', errors: ['请先粘贴视频链接或分享文案'] }]);
      return null;
    }
    const requestId = videoLinkPreviewRequestIdRef.current + 1;
    videoLinkPreviewRequestIdRef.current = requestId;
    setResolvingVideoLinkPreview(true);
    setVideoLinkPreviewNotice(null);
    setQianchuanMaterialReview(null);
    qianchuanMaterialReviewConfirmedKeyRef.current = null;
    try {
      const response = await previewVideoLinkFromInput(externalUrl);
      if (requestId !== videoLinkPreviewRequestIdRef.current) {
        return null;
      }
      setVideoLinkPreviewCandidates(response.candidates);
      setVideoLinkPreviewInput(externalUrl);
      setSelectedVideoLinkCandidateIndex(null);
      setAwaitingManualUpload(null);
      const candidateBaseValues = clearAutoAppliedVideoLinkIdentityFromValues(values);
      form.setFields([
        { name: 'externalUrl', errors: [] },
        { name: 'externalVideoId', errors: [] },
        { name: 'externalItemId', errors: [] },
        { name: 'platformNames', errors: [] },
      ]);
      if (response.candidates.length > 1) {
        if (options.allowMultiple) {
          message.info('识别到多个视频链接，请选择要使用的链接');
        } else {
          form.setFields([{ name: 'externalUrl', errors: ['识别到多个视频链接，请先点击“解析链接”并选择一个链接'] }]);
        }
        return null;
      }

      const selectedCandidate = response.candidates[0];
      const selectedIndex = 0;
      const conflict = resolveVideoLinkCandidateConflict(candidateBaseValues, selectedCandidate);
      if (conflict) {
        form.setFields([{ name: conflict.field, errors: [conflict.message] }]);
        message.warning('当前表单已有不同的平台 ID，请先确认后再应用解析结果');
        return null;
      }
      const nextValues = applyVideoLinkCandidateToFormValues(candidateBaseValues, selectedCandidate);
      const notice = resolveVideoLinkCandidateNotice(nextValues, selectedCandidate);
      const review = resolveQianchuanMaterialReviewState(candidateBaseValues, nextValues, selectedCandidate);
      setSelectedVideoLinkCandidateIndex(selectedIndex);
      setVideoLinkPreviewNotice(notice);
      setQianchuanMaterialReview(review);
      form.setFieldsValue(nextValues);
      rememberAutoAppliedVideoLinkIdentity(selectedCandidate);
      if (options.showSuccess) {
        message.success(resolveVideoLinkApplySuccessMessage(selectedCandidate));
      }
      return {
        candidate: selectedCandidate,
        candidateIndex: selectedIndex,
        input: externalUrl,
        qianchuanMaterialReview: review,
        values: nextValues,
      };
    } catch (error) {
      if (requestId !== videoLinkPreviewRequestIdRef.current) {
        return null;
      }
      const errorMessage = resolveVideoLinkPreviewErrorMessage(error);
      form.setFields([{ name: 'externalUrl', errors: [errorMessage] }]);
      message.error(errorMessage);
      return null;
    } finally {
      if (requestId === videoLinkPreviewRequestIdRef.current) {
        setResolvingVideoLinkPreview(false);
      }
    }
  };

  const handleApplyVideoLinkCandidate = (
    candidate: ContentAssetVideoLinkPreviewCandidate,
    candidateIndex: number
  ) => {
    const currentValues = clearAutoAppliedVideoLinkIdentityFromValues(form.getFieldsValue());
    const conflict = resolveVideoLinkCandidateConflict(currentValues, candidate);
    if (conflict) {
      form.setFields([{ name: conflict.field, errors: [conflict.message] }]);
      message.warning('当前表单已有不同的平台 ID，请先确认后再应用解析结果');
      return;
    }
    const nextValues = applyVideoLinkCandidateToFormValues(currentValues, candidate);
    const review = resolveQianchuanMaterialReviewState(currentValues, nextValues, candidate);
    setSelectedVideoLinkCandidateIndex(candidateIndex);
    setAwaitingManualUpload(null);
    setVideoLinkPreviewNotice(resolveVideoLinkCandidateNotice(nextValues, candidate));
    setQianchuanMaterialReview(review);
    form.setFields([
      { name: 'externalUrl', errors: [] },
      { name: 'externalVideoId', errors: [] },
      { name: 'externalItemId', errors: [] },
      { name: 'platformNames', errors: [] },
    ]);
    form.setFieldsValue(nextValues);
    rememberAutoAppliedVideoLinkIdentity(candidate);
    message.success(resolveVideoLinkApplySuccessMessage(candidate));
  };

  const clearAutoAppliedVideoLinkIdentityFromValues = (values: UploadFormValues): UploadFormValues => {
    const autoAppliedIdentity = resolveAutoAppliedVideoLinkIdentity();
    if (!autoAppliedIdentity) return values;
    const nextValues = { ...values };
    let changed = false;
    if (
      autoAppliedIdentity.externalVideoId
      && emptyToNull(nextValues.externalVideoId) === autoAppliedIdentity.externalVideoId
    ) {
      nextValues.externalVideoId = undefined;
      changed = true;
    }
    if (
      autoAppliedIdentity.externalItemId
      && emptyToNull(nextValues.externalItemId) === autoAppliedIdentity.externalItemId
    ) {
      nextValues.externalItemId = undefined;
      changed = true;
    }
    autoAppliedVideoLinkIdentityRef.current = null;
    if (changed) {
      form.setFieldsValue({
        externalVideoId: nextValues.externalVideoId,
        externalItemId: nextValues.externalItemId,
      });
    }
    return nextValues;
  };

  const resolveAutoAppliedVideoLinkIdentity = (): AutoAppliedVideoLinkIdentity | null => {
    return autoAppliedVideoLinkIdentityRef.current;
  };

  const rememberAutoAppliedVideoLinkIdentity = (candidate: ContentAssetVideoLinkPreviewCandidate) => {
    autoAppliedVideoLinkIdentityRef.current = {
      externalVideoId: emptyToNull(candidate.externalVideoId ?? undefined),
      externalItemId: emptyToNull(candidate.externalItemId ?? undefined)
        ?? resolveCandidateSuggestedExternalItemId(candidate),
    };
  };

  const applyAwaitingManualUploadResponse = (
    selection: VideoLinkPreviewApplyResult,
    response: ContentAssetVideoLinkAwaitingManualUploadResponse
  ) => {
    const nextValues = applyAwaitingManualUploadToFormValues(selection.values, response);
    setAwaitingManualUpload(response);
    setSelectedVideoLinkCandidateIndex(selection.candidateIndex);
    setVideoLinkPreviewNotice(resolveAwaitingManualUploadNotice(response));
    setQianchuanMaterialReview(selection.qianchuanMaterialReview);
    setFileError('');
    form.setFields([
      { name: 'externalUrl', errors: [] },
      { name: 'externalVideoId', errors: [] },
      { name: 'externalItemId', errors: [] },
      { name: 'platformNames', errors: [] },
    ]);
    form.setFieldsValue(nextValues);
    autoAppliedVideoLinkIdentityRef.current = {
      externalVideoId: response.externalVideoId,
      externalItemId: emptyToNull(nextValues.externalItemId),
    };
    message.warning(response.nextAction.label || '请上传本地视频并绑定抖音视频 ID');
  };

  const confirmQianchuanMaterialReviewBeforeSubmit = async (
    values: UploadFormValues,
    review: QianchuanMaterialReviewState | null
  ): Promise<boolean> => {
    const externalItemId = emptyToNull(values.externalItemId);
    if (!review?.requiresConfirmation) {
      return true;
    }
    const confirmationKey = [
      review.status,
      review.source,
      review.recommendedExternalItemId || '',
      externalItemId || 'no_external_item_id',
    ].join(':');
    if (qianchuanMaterialReviewConfirmedKeyRef.current === confirmationKey) {
      return true;
    }
    const materialIdSummary = externalItemId
      ? `当前将保存千川素材 ID：${externalItemId}。`
      : '当前未保存千川素材 ID。';
    const reviewSummary = externalItemId
      ? '请确认业务已核对该素材 ID 与当前抖音视频/素材一致。'
      : '请确认业务已核对是否需要手动填写或修改千川素材 ID。';
    return new Promise((resolve) => {
      Modal.confirm({
        title: '确认千川素材 ID',
        content: [
          materialIdSummary,
          review.notice,
          reviewSummary,
        ].join(' '),
        okText: '已核对，继续保存',
        cancelText: '返回修改',
        onOk: () => {
          qianchuanMaterialReviewConfirmedKeyRef.current = confirmationKey;
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  };

  const resolveCurrentQianchuanMaterialReview = (
    values: UploadFormValues,
    fallbackReview: QianchuanMaterialReviewState | null
  ): QianchuanMaterialReviewState | null => {
    const currentInput = emptyToNull(values.externalUrl);
    const previewInput = emptyToNull(videoLinkPreviewInput ?? undefined);
    if (
      !selectedImportableVideoLinkCandidate
      || !currentInput
      || !previewInput
      || currentInput !== previewInput
    ) {
      return fallbackReview;
    }
    return resolveQianchuanMaterialReviewState(
      values,
      values,
      selectedImportableVideoLinkCandidate
    ) ?? fallbackReview;
  };

  return (
    <Modal
      title={(
        <div className={uploadStyles.modalTitle}>
          <span>{isSourceUpload ? '补传源视频到 TOS' : '上传视频素材'}</span>
          <p>
            {isSourceUpload
              ? `为「${sourceAssetTitle}」上传原始视频文件，完成后自动生成预览版和封面。`
              : '上传后自动生成预览版和封面；脚本/SRT 与 AI 分析可在素材详情中触发。'}
          </p>
        </div>
      )}
      open={open}
      width={760}
      confirmLoading={confirmLoading}
      onCancel={confirmLoading ? undefined : onCancel}
      onOk={() => void submit()}
      okText={
        isSourceUpload
          ? '上传到 TOS'
          : awaitingManualUpload
            ? '上传本地视频并绑定'
          : (!file
            && (hasVideoLinkInput || isImportableVideoLinkCandidate(selectedImportableVideoLinkCandidate))
            ? '从链接导入素材'
            : '上传素材')
      }
      cancelText="取消"
      cancelButtonProps={{ disabled: confirmLoading }}
      className={uploadStyles.uploadModal}
      destroyOnHidden
      mask={{ closable: !confirmLoading }}
      closable={!confirmLoading}
    >
      <ContentAssetsImportUploadPanel
        confirmLoading={confirmLoading}
        file={file}
        fileError={fileError}
        isSourceUpload={isSourceUpload}
        progress={progress}
        sourceAssetTitle={sourceAssetTitle}
        onSelectFile={handleSelectFile}
        onRemoveFile={() => setFile(null)}
      />
      {!isSourceUpload ? <Form form={form} layout="vertical" className={uploadStyles.uploadForm} onValuesChange={handleFormValuesChange}>
        <ContentAssetsImportFormFields
          confirmLoading={confirmLoading}
          contentSceneGroupOptions={contentSceneGroupOptions}
          contentSceneOptions={contentSceneOptions}
          contentSceneSubtypeOptions={contentSceneSubtypeOptions}
          filterOptions={filterOptions}
          form={form}
          hasOwnerOptions={hasOwnerOptions}
          ownerOptions={ownerOptions}
          platformOptions={platformOptions}
          productOptions={productOptions}
          resolvingVideoLinkPreview={resolvingVideoLinkPreview}
          sceneOptions={sceneOptions}
          sceneOptionsConfigured={sceneOptionsConfigured}
          sceneSelectionDisabled={sceneSelectionDisabled}
          showSceneCascade={showSceneCascade}
          skuOptions={skuOptions}
          qianchuanMaterialReviewNotice={qianchuanMaterialReview?.notice ?? null}
          videoLinkPreviewNotice={videoLinkPreviewNotice}
          videoLinkPreviewCandidates={videoLinkPreviewCandidates}
          selectedVideoLinkCandidateIndex={selectedVideoLinkCandidateIndex}
          videoTypeOptions={videoTypeOptions}
          onApplyVideoLinkCandidate={handleApplyVideoLinkCandidate}
          onVideoLinkInputChange={handleVideoLinkInputChange}
          onPreviewVideoLink={() => void handlePreviewVideoLink()}
        />
      </Form> : null}
    </Modal>
  );
}

type VideoLinkPreviewApplyResult = {
  candidate: ContentAssetVideoLinkPreviewCandidate;
  candidateIndex: number;
  input: string;
  qianchuanMaterialReview: QianchuanMaterialReviewState | null;
  values: UploadFormValues;
};

type PreparedUploadFormValues = {
  qianchuanMaterialReview: QianchuanMaterialReviewState | null;
  values: UploadFormValues;
};

type AutoAppliedVideoLinkIdentity = {
  externalVideoId: string | null;
  externalItemId: string | null;
};

type QianchuanMaterialReviewState = {
  notice: string;
  status: string;
  source: string;
  recommendedExternalItemId: string | null;
  requiresConfirmation: boolean;
};

function applyVideoLinkCandidateToFormValues(
  values: UploadFormValues,
  candidate: ContentAssetVideoLinkPreviewCandidate
): UploadFormValues {
  const nextValues: UploadFormValues = {
    ...values,
    externalUrl: candidate.resolvedUrl || candidate.sourceUrl || values.externalUrl,
    platformNames: ensureDouyinPlatform(values.platformNames),
  };
  if (candidate.externalVideoId) {
    nextValues.externalVideoId = candidate.externalVideoId;
  }
  const currentExternalItemId = emptyToNull(values.externalItemId);
  if (candidate.externalItemId && (!currentExternalItemId || currentExternalItemId === candidate.externalItemId)) {
    nextValues.externalItemId = candidate.externalItemId;
  } else {
    const suggestedExternalItemId = resolveCandidateSuggestedExternalItemId(candidate);
    if (suggestedExternalItemId && !currentExternalItemId) {
      nextValues.externalItemId = suggestedExternalItemId;
    }
  }
  return nextValues;
}

function resolveQianchuanMaterialReviewState(
  previousValues: UploadFormValues,
  nextValues: UploadFormValues,
  candidate: ContentAssetVideoLinkPreviewCandidate
): QianchuanMaterialReviewState | null {
  const previousExternalItemId = emptyToNull(previousValues.externalItemId);
  const nextExternalItemId = emptyToNull(nextValues.externalItemId);
  const candidateExternalItemId = emptyToNull(candidate.externalItemId ?? undefined);
  const suggestedExternalItemId = resolveCandidateSuggestedExternalItemId(candidate);
  const recommendedExternalItemId = suggestedExternalItemId ?? candidateExternalItemId;
  const notice = resolveQianchuanMaterialCandidateReviewNotice(candidate, previousExternalItemId);
  const suggestion = candidate.qianchuanMaterialSuggestion;
  if (!notice || (!suggestion && !candidateExternalItemId)) return null;
  const savesRecommendedItemId = Boolean(
    recommendedExternalItemId
    && nextExternalItemId
    && nextExternalItemId === recommendedExternalItemId
  );
  const candidateItemIdConflictsWithCurrent = Boolean(
    candidateExternalItemId
    && previousExternalItemId
    && previousExternalItemId !== candidateExternalItemId
  );
  return {
    notice,
    status: suggestion?.status ?? 'candidate_external_item_id',
    source: suggestion?.source ?? candidate.sourceType,
    recommendedExternalItemId,
    requiresConfirmation: suggestion?.requiresConfirmation ?? (savesRecommendedItemId || candidateItemIdConflictsWithCurrent),
  };
}

function resolveQianchuanMaterialReviewFromPrefill(
  uploadPrefill: ContentAssetUploadPrefill
): QianchuanMaterialReviewState | null {
  const externalItemId = emptyToNull(uploadPrefill.values.externalItemId);
  if (!externalItemId) {
    return null;
  }

  return {
    notice: '该千川素材 ID 来自短视频看板跳转预填；如果业务侧不确定，请先核对或修改后再上传。',
    status: 'prefilled_external_item_id',
    source: uploadPrefill.source || 'upload_prefill',
    recommendedExternalItemId: externalItemId,
    requiresConfirmation: uploadPrefill.requiresMaterialConfirmation,
  };
}

function applyAwaitingManualUploadToFormValues(
  values: UploadFormValues,
  response: ContentAssetVideoLinkAwaitingManualUploadResponse
): UploadFormValues {
  return {
    ...values,
    externalUrl: response.resolvedUrl || response.sourceUrl || values.externalUrl,
    externalVideoId: response.externalVideoId,
    platformNames: ensureDouyinPlatform(values.platformNames),
  };
}

function resolveVideoLinkCandidateConflict(
  values: UploadFormValues,
  candidate: ContentAssetVideoLinkPreviewCandidate
): { field: 'externalVideoId'; message: string } | null {
  const currentVideoId = emptyToNull(values.externalVideoId);
  const candidateVideoId = emptyToNull(candidate.externalVideoId ?? undefined);
  if (currentVideoId && candidateVideoId && currentVideoId !== candidateVideoId) {
    return {
      field: 'externalVideoId',
      message: `当前抖音视频ID为 ${currentVideoId}，解析结果为 ${candidateVideoId}；请先确认后再使用该链接。`,
    };
  }

  return null;
}

function resolveVideoLinkCandidateNotice(
  values: UploadFormValues,
  candidate: ContentAssetVideoLinkPreviewCandidate
): string | null {
  const currentItemId = emptyToNull(values.externalItemId);
  const candidateItemId = emptyToNull(candidate.externalItemId ?? undefined);
  if (currentItemId && candidateItemId && currentItemId !== candidateItemId) {
    return `当前千川素材ID为 ${currentItemId}，链接解析结果为 ${candidateItemId}。系统不会自动覆盖，请业务核对后再修改。`;
  }
  if (candidate.sourceType !== 'qianchuan_material_video' || candidate.externalItemId) {
    return null;
  }
  if (emptyToNull(values.externalItemId)) {
    return '该千川视频直链未携带素材 ID，已保留当前填写的千川素材ID，请确认它与该视频链接对应。';
  }
  return '该千川视频直链未携带素材 ID，可继续从链接导入；素材 ID 可上传后补充。';
}

function resolveAwaitingManualUploadNotice(
  response: ContentAssetVideoLinkAwaitingManualUploadResponse
): string {
  const detail = response.downloadAttempt.message?.trim();
  const detailAlreadyMentionsManualUpload = Boolean(detail && /本地视频|上传/.test(detail));
  return [
    `已识别抖音视频 ID：${response.externalVideoId}。`,
    detail || '当前无法直接下载原视频。',
    response.canBindAfterUpload && !detailAlreadyMentionsManualUpload
      ? '请选择本地视频文件，上传完成后会自动绑定该视频 ID。'
      : null,
  ].filter(Boolean).join(' ');
}

function resolveVideoLinkApplySuccessMessage(candidate: ContentAssetVideoLinkPreviewCandidate): string {
  if (candidate.sourceType === 'qianchuan_material_video') {
    return candidate.externalItemId
      ? `已识别千川素材 ID：${candidate.externalItemId}`
      : '已识别千川素材视频链接，可直接从链接导入；素材 ID 可后补';
  }
  if (candidate.externalVideoId) {
    return `已识别抖音视频链接，可直接从链接导入；视频 ID：${candidate.externalVideoId}`;
  }
  return `已使用${resolveVideoLinkCandidateLabel(candidate)}`;
}
