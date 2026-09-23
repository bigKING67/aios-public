import { message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  backfillContentAssetAiJobs,
  backfillContentAssetDerivativeJobs,
  bindContentAssetUnmatchedStats,
  completeContentAssetUpload,
  cancelContentAssetProcessingJob,
  createContentAssetAdMaterial,
  createContentAssetAnalysisJob,
  createContentAssetTranscriptJob,
  createContentAssetSourceUpload,
  createContentAssetUpload,
  createContentAssetPlatformVideo,
  importContentAssetFromVideoLink,
  resetStaleContentAssetProcessingJob,
  retryContentAssetProcessingJob,
  updateContentAssetAdMaterial,
  updateContentAssetProfile,
  updateContentAssetPlatformVideo,
} from '../_lib/content-assets-api';
import { contentAssetsQueryKeys } from '../_lib/content-assets-query-keys';
import type {
  ContentAssetAdMaterialCreatePayload,
  ContentAssetAdMaterialUpdatePayload,
  ContentAssetAiJobBackfillPayload,
  ContentAssetAnalysisJobCreatePayload,
  ContentAssetDetailResponse,
  ContentAssetPlatformVideoCreatePayload,
  ContentAssetPlatformVideoUpdatePayload,
  ContentAssetProfileUpdatePayload,
  ContentAssetUnmatchedStatsBindPayload,
  ContentAssetUploadCreateResponse,
  ContentAssetUploadMutationPayload,
  ContentAssetUploadProgress,
  ContentAssetVideoLinkImportPayload,
  ContentAssetVideoLinkImportResponse,
  ContentAssetTranscriptJobCreatePayload,
  ContentAssetProcessingJob,
} from '../_lib/content-assets-types';
import { resolveContentAssetRequestError } from '../_lib/content-assets-ui-helpers';

interface ContentAssetsActionMutationCallbacks {
  onUploadSuccess: (response: ContentAssetDetailResponse) => void;
  onProfileSuccess: (response: ContentAssetDetailResponse) => void;
  onIdentitySuccess: (response: ContentAssetDetailResponse) => void;
  onUploadProgress?: (progress: ContentAssetUploadProgress | null) => void;
  onProcessingJobSuccess?: (job: ContentAssetProcessingJob) => void;
}

interface ContentAssetUploadMutationResult {
  response: ContentAssetDetailResponse;
  platformVideoError?: unknown;
}

export function useContentAssetsActionMutations({
  onUploadSuccess,
  onProfileSuccess,
  onIdentitySuccess,
  onUploadProgress,
  onProcessingJobSuccess,
}: ContentAssetsActionMutationCallbacks) {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({
      sourceAssetId,
      file,
      metadata,
      platformVideo,
    }: ContentAssetUploadMutationPayload): Promise<ContentAssetUploadMutationResult> => {
      onUploadProgress?.({
        stage: 'creating',
        loadedBytes: 0,
        totalBytes: file.size,
        percent: 0,
      });
      const rawSha256 = await calculateFileSha256(file);
      const uploadPayload = {
        ...metadata,
        fileName: file.name,
        contentType: file.type || undefined,
        fileSizeBytes: file.size,
        rawSha256,
      };
      const upload = sourceAssetId
        ? await createContentAssetSourceUpload(sourceAssetId, uploadPayload)
        : await createContentAssetUpload(uploadPayload);
      await uploadFileToTos(upload, file, (progress) => onUploadProgress?.(progress));
      onUploadProgress?.({
        stage: 'completing',
        loadedBytes: file.size,
        totalBytes: file.size,
        percent: 100,
      });
      const completed = await completeContentAssetUpload(upload.assetId, {
        fileSizeBytes: file.size,
        rawSha256,
      });
      if (platformVideo && hasPlatformVideoIdentity(platformVideo)) {
        try {
          return {
            response: await createContentAssetPlatformVideo(upload.assetId, platformVideo),
          };
        } catch (platformVideoError) {
          return { response: completed, platformVideoError };
        }
      }
      return { response: completed };
    },
    onSuccess: async ({ response, platformVideoError }) => {
      message.success('视频源文件已上传到 TOS，正在生成预览和封面');
      if (platformVideoError) {
        message.warning(`视频已上传，但平台视频 ID 未保存：${resolveContentAssetRequestError(platformVideoError)}`);
      }
      onUploadProgress?.(null);
      onUploadSuccess(response);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(response.asset.assetId), response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      onUploadProgress?.(null);
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const videoLinkImportMutation = useMutation({
    mutationFn: async (payload: ContentAssetVideoLinkImportPayload): Promise<ContentAssetVideoLinkImportResponse> => {
      onUploadProgress?.({
        stage: 'importing',
        loadedBytes: 0,
        totalBytes: null,
        percent: null,
      });
      return importContentAssetFromVideoLink(payload);
    },
    onSuccess: async (response) => {
      if (response.status === 'awaiting_manual_upload') {
        onUploadProgress?.(null);
        return;
      }
      const detail = response.detail;
      message.success('视频链接已导入素材库，正在生成预览和封面');
      onUploadProgress?.(null);
      onUploadSuccess(detail);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(detail.asset.assetId), detail);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      onUploadProgress?.(null);
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: ContentAssetProfileUpdatePayload }) =>
      updateContentAssetProfile(assetId, payload),
    onSuccess: async (response) => {
      message.success('素材档案已保存');
      onProfileSuccess(response);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(response.asset.assetId), response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const createPlatformVideoMutation = useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: ContentAssetPlatformVideoCreatePayload }) =>
      createContentAssetPlatformVideo(assetId, payload),
    onSuccess: async (response) => {
      message.success('平台视频身份已保存');
      onIdentitySuccess(response);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(response.asset.assetId), response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const createAdMaterialMutation = useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: ContentAssetAdMaterialCreatePayload }) =>
      createContentAssetAdMaterial(assetId, payload),
    onSuccess: async (response) => {
      message.success('广告素材实例已保存');
      onIdentitySuccess(response);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(response.asset.assetId), response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const updatePlatformVideoMutation = useMutation({
    mutationFn: ({
      assetId,
      platformVideoId,
      payload,
    }: {
      assetId: string;
      platformVideoId: string;
      payload: ContentAssetPlatformVideoUpdatePayload;
    }) => updateContentAssetPlatformVideo(assetId, platformVideoId, payload),
    onSuccess: async (response) => {
      message.success('平台视频身份已更新');
      onIdentitySuccess(response);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(response.asset.assetId), response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const updateAdMaterialMutation = useMutation({
    mutationFn: ({
      assetId,
      adMaterialId,
      payload,
    }: {
      assetId: string;
      adMaterialId: string;
      payload: ContentAssetAdMaterialUpdatePayload;
    }) => updateContentAssetAdMaterial(assetId, adMaterialId, payload),
    onSuccess: async (response) => {
      message.success('广告素材实例已更新');
      onIdentitySuccess(response);
      queryClient.setQueryData(contentAssetsQueryKeys.detail(response.asset.assetId), response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const retryProcessingJobMutation = useMutation({
    mutationFn: retryContentAssetProcessingJob,
    onSuccess: async () => {
      message.success('处理任务已重新排队');
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const cancelProcessingJobMutation = useMutation({
    mutationFn: cancelContentAssetProcessingJob,
    onSuccess: async () => {
      message.success('处理任务已取消');
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const resetStaleProcessingJobMutation = useMutation({
    mutationFn: resetStaleContentAssetProcessingJob,
    onSuccess: async () => {
      message.success('卡住的处理任务已标记为超时失败');
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const backfillDerivativeJobsMutation = useMutation({
    mutationFn: backfillContentAssetDerivativeJobs,
    onSuccess: async (response) => {
      message.success(response.message || `已补建 ${response.createdJobs} 个处理任务`);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const backfillAiJobsMutation = useMutation({
    mutationFn: (payload: ContentAssetAiJobBackfillPayload) => backfillContentAssetAiJobs(payload),
    onSuccess: async (response) => {
      message.success(response.message || `已排队 ${response.queuedJobs} 个任务`);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const bindUnmatchedStatsMutation = useMutation({
    mutationFn: (payload: ContentAssetUnmatchedStatsBindPayload) => bindContentAssetUnmatchedStats(payload),
    onSuccess: async (response) => {
      message.success(response.message || `已绑定 ${response.affectedRows} 条日报记录`);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const createAnalysisJobMutation = useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: ContentAssetAnalysisJobCreatePayload }) =>
      createContentAssetAnalysisJob(assetId, payload),
    onSuccess: async (response) => {
      message.success('AI 分析任务已排队');
      onProcessingJobSuccess?.(response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  const createTranscriptJobMutation = useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: ContentAssetTranscriptJobCreatePayload }) =>
      createContentAssetTranscriptJob(assetId, payload),
    onSuccess: async (response) => {
      message.success('脚本/SRT 任务已排队');
      onProcessingJobSuccess?.(response);
      await queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.root });
    },
    onError: (requestError) => {
      message.error(resolveContentAssetRequestError(requestError));
    },
  });

  return {
    uploadMutation,
    videoLinkImportMutation,
    updateProfileMutation,
    createPlatformVideoMutation,
    createAdMaterialMutation,
    updatePlatformVideoMutation,
    updateAdMaterialMutation,
    retryProcessingJobMutation,
    cancelProcessingJobMutation,
    resetStaleProcessingJobMutation,
    backfillDerivativeJobsMutation,
    backfillAiJobsMutation,
    bindUnmatchedStatsMutation,
    createAnalysisJobMutation,
    createTranscriptJobMutation,
  };
}

function hasPlatformVideoIdentity(payload: ContentAssetPlatformVideoCreatePayload): boolean {
  return Boolean(
    payload.platform?.trim() &&
      [payload.externalVideoId, payload.externalItemId, payload.externalNoteId].some((value) => value?.trim())
  );
}

async function calculateFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function uploadFileToTos(
  upload: ContentAssetUploadCreateResponse,
  file: File,
  onProgress: (progress: ContentAssetUploadProgress) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.uploadUrl);
    Object.entries(upload.headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size || null;
      onProgress({
        stage: 'uploading',
        loadedBytes: event.loaded,
        totalBytes,
        percent: totalBytes ? Math.min(99, Math.round((event.loaded / totalBytes) * 100)) : null,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const detail = xhr.responseText ? `：${xhr.responseText.slice(0, 240)}` : '';
      reject(new Error(`TOS 上传失败（HTTP ${xhr.status}）${detail}`));
    };
    xhr.onerror = () => reject(new Error('TOS 上传失败：网络连接异常'));
    xhr.ontimeout = () => reject(new Error('TOS 上传失败：请求超时'));
    xhr.send(file);
  });
}
