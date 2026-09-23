import { previewContentAssetVideoLink } from './content-assets-api';
import type {
  ContentAssetVideoLinkPreviewCandidate,
  ContentAssetVideoLinkPreviewResponse,
} from './content-assets-types';

export class ContentAssetVideoLinkPreviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentAssetVideoLinkPreviewInputError';
  }
}

export async function previewVideoLinkFromInput(
  input: string
): Promise<ContentAssetVideoLinkPreviewResponse> {
  if (!input.trim()) {
    throw new ContentAssetVideoLinkPreviewInputError('请先粘贴视频链接或分享文案。');
  }
  const response = await previewContentAssetVideoLink({ input });
  if (response.candidates.length === 0) {
    throw new ContentAssetVideoLinkPreviewInputError('未识别到支持的视频链接。');
  }
  return response;
}

export function resolveVideoLinkPreviewErrorMessage(error: unknown): string {
  if (error instanceof ContentAssetVideoLinkPreviewInputError) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '解析视频链接失败');
  }
  return '解析视频链接失败';
}

export function resolveVideoLinkCandidateLabel(candidate: ContentAssetVideoLinkPreviewCandidate): string {
  if (candidate.sourceType === 'qianchuan_material_video') {
    return '千川素材视频链接';
  }
  if (candidate.sourceType === 'douyin_video') {
    return '抖音视频链接';
  }
  return '视频链接';
}

export function resolveVideoLinkCandidatePrimaryId(
  candidate: ContentAssetVideoLinkPreviewCandidate
): string | null {
  return candidate.externalVideoId || candidate.externalItemId || null;
}

export function resolveCandidateSuggestedExternalItemId(
  candidate: ContentAssetVideoLinkPreviewCandidate
): string | null {
  const suggestion = candidate.qianchuanMaterialSuggestion;
  if (suggestion?.status !== 'unique') {
    return null;
  }
  const recommendedExternalItemId = suggestion.recommendedExternalItemId?.trim() || null;
  if (!recommendedExternalItemId) return null;
  if (candidate.externalVideoId && suggestion.externalVideoId && candidate.externalVideoId !== suggestion.externalVideoId) {
    return null;
  }
  const materialIds = new Set(suggestion.materialIds.map((item) => item.trim()).filter(Boolean));
  if (materialIds.size > 0 && !materialIds.has(recommendedExternalItemId)) {
    return null;
  }
  return recommendedExternalItemId;
}

export function resolveQianchuanMaterialSuggestionNotice(
  candidate: ContentAssetVideoLinkPreviewCandidate,
  currentExternalItemId?: string | null
): string | null {
  const suggestion = candidate.qianchuanMaterialSuggestion;
  if (!suggestion || suggestion.status === 'none') {
    return null;
  }
  const materialIdsText = formatQianchuanMaterialSuggestionIds(suggestion.materialIds);
  const recommendedId = suggestion.recommendedExternalItemId?.trim() || null;
  const currentId = currentExternalItemId?.trim() || null;

  if (suggestion.status === 'unique' && recommendedId) {
    if (currentId && currentId !== recommendedId) {
      return `当前千川素材ID为 ${currentId}，系统根据抖音视频 ID 建议为 ${recommendedId}。系统不会自动覆盖，请业务核对后再修改。`;
    }
    return `已根据抖音视频 ID 匹配到唯一千川素材 ID：${recommendedId}。请业务核对后提交；如不一致请手动修改。`;
  }

  if (suggestion.status === 'conflict') {
    return [
      '该抖音视频 ID 的素材库绑定与系统回流建议不完全一致，系统不会自动覆盖千川素材 ID。',
      materialIdsText ? `候选素材 ID：${materialIdsText}。` : null,
      '请业务核对后再修改。',
    ].filter(Boolean).join(' ');
  }

  if (suggestion.status === 'ambiguous') {
    return [
      '该抖音视频 ID 命中多个千川素材 ID，系统不会自动回填。',
      materialIdsText ? `候选素材 ID：${materialIdsText}。` : null,
      '请业务核对后手动填写。',
    ].filter(Boolean).join(' ');
  }

  return suggestion.reason || null;
}

export function resolveQianchuanMaterialCandidateReviewNotice(
  candidate: ContentAssetVideoLinkPreviewCandidate,
  currentExternalItemId?: string | null
): string | null {
  const suggestionNotice = resolveQianchuanMaterialSuggestionNotice(candidate, currentExternalItemId);
  if (suggestionNotice) return suggestionNotice;

  const candidateItemId = candidate.externalItemId?.trim() || null;
  if (!candidateItemId) return null;
  const currentId = currentExternalItemId?.trim() || null;
  if (currentId && currentId !== candidateItemId) {
    return `当前千川素材ID为 ${currentId}，链接解析结果为 ${candidateItemId}。系统不会自动覆盖，请业务核对后再修改。`;
  }
  return `已从千川素材视频链接识别千川素材 ID：${candidateItemId}。请业务核对后提交；如不一致请手动修改。`;
}

function formatQianchuanMaterialSuggestionIds(materialIds: string[]): string | null {
  const normalized = Array.from(new Set(materialIds.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length === 0) return null;
  const visible = normalized.slice(0, 3).join('、');
  return normalized.length > 3 ? `${visible} 等 ${normalized.length} 个` : visible;
}

export function isImportableVideoLinkCandidate(
  candidate: ContentAssetVideoLinkPreviewCandidate | null | undefined
): boolean {
  return (
    candidate?.sourceType === 'douyin_video'
    || candidate?.sourceType === 'qianchuan_material_video'
  );
}

export function resolveVideoLinkCandidateMissingIdText(
  candidate: ContentAssetVideoLinkPreviewCandidate
): string {
  if (candidate.sourceType === 'douyin_video') {
    return '未识别视频 ID';
  }
  if (candidate.sourceType === 'qianchuan_material_video') {
    return '未识别素材 ID';
  }
  return '未识别视频/素材 ID';
}
