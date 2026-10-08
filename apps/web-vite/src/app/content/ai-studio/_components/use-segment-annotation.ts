import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchContentAssetDetail } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { contentAssetsQueryKeys } from '@/app/marketing/content-assets/_lib/content-assets-query-keys';
import {
  aiStudioQueryKeys,
  SEGMENT_DEPENDENT_QUERY_PREFIXES,
  confirmStudioSegments,
  createStudioSegment,
  fetchAllStudioSegments,
  type StudioContentSegment,
  type StudioSegmentPreset,
  type StudioUpdateContentSegmentRequest,
  updateStudioSegment,
} from '../_lib/ai-studio-api';
import { findPreset, labelName } from '../_lib/segment-display';
import { describeSegmentMutationError, type SegmentMutationError } from '../_lib/segment-errors';
import type { SegmentCreateValues } from './segment-create-form';

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export type AnnotationNotice = { tone: 'success'; text: string } | { tone: 'error'; error: SegmentMutationError };

export function useSegmentAnnotation(assetId: string, preset: StudioSegmentPreset | null, presets: readonly StudioSegmentPreset[]) {
  const queryClient = useQueryClient();
  const [notice, setNoticeState] = useState<AnnotationNotice | null>(null);
  const [noticeId, setNoticeId] = useState(0);
  const setNotice = (next: AnnotationNotice | null) => {
    setNoticeState(next);
    setNoticeId((id) => id + 1);
  };

  const assetQuery = useQuery({
    queryKey: contentAssetsQueryKeys.detail(assetId),
    queryFn: ({ signal }) => fetchContentAssetDetail(assetId, { signal }),
    enabled: assetId.length > 0,
  });

  const segmentQuery = { assetId, presetKey: preset?.presetKey };
  const segmentsQuery = useQuery({
    queryKey: aiStudioQueryKeys.segmentList(segmentQuery),
    queryFn: ({ signal }) => fetchAllStudioSegments(segmentQuery, { signal }),
    enabled: assetId.length > 0 && preset !== null,
  });

  const segments = useMemo(() => segmentsQuery.data?.items ?? [], [segmentsQuery.data]);
  const lookup = useMemo(
    () => segments.map((segment) => ({
      segmentId: segment.segmentId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      labelName: labelName(findPreset(presets, segment.presetKey, segment.presetVersion), segment.labelKey),
    })),
    [presets, segments],
  );

  const refresh = () =>
    Promise.all(SEGMENT_DEPENDENT_QUERY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const handleError = (error: unknown) => {
    const described = describeSegmentMutationError(error, lookup);
    setNotice({ tone: 'error', error: described });
    // Conflicts are resolved against the latest server state; an overlap refresh
    // also loads a conflicting segment another user just confirmed.
    if (['overlap', 'stale', 'revision', 'not_found'].includes(described.kind)) void refresh();
    // A changed source also invalidates the cached rawSha256 sent as
    // sourceContentHash; without reloading it every retry would 409 again.
    if (described.kind === 'stale') {
      void queryClient.invalidateQueries({ queryKey: contentAssetsQueryKeys.detail(assetId) });
    }
  };

  // Segment writes are not idempotent (create) and conflicts need immediate
  // feedback, so opt out of the global mutation retry.
  const createMutation = useMutation({
    retry: false,
    mutationFn: (values: SegmentCreateValues) => {
      const rawSha256 = assetQuery.data?.asset.rawSha256?.trim() ?? '';
      return createStudioSegment({
        assetId,
        presetKey: preset?.presetKey ?? '',
        presetVersion: preset?.version ?? 0,
        labelKey: values.labelKey,
        startMs: values.startMs,
        endMs: values.endMs,
        productName: values.productName,
        draft: values.draft,
        sourceContentHash: SHA256_PATTERN.test(rawSha256) ? rawSha256.toLowerCase() : undefined,
      });
    },
    onSuccess: (segment) => {
      setNotice({ tone: 'success', text: segment.status === 'confirmed' ? '片段已确认并进入片段池。' : '片段已存为草稿，确认后才进入片段池。' });
      void refresh();
    },
    onError: handleError,
  });

  const updateMutation = useMutation({
    retry: false,
    mutationFn: ({ segment, request }: { segment: StudioContentSegment; request: StudioUpdateContentSegmentRequest }) =>
      updateStudioSegment(segment.segmentId, request),
    onSuccess: () => {
      setNotice({ tone: 'success', text: '片段已更新。' });
      void refresh();
    },
    onError: handleError,
  });

  const confirmMutation = useMutation({
    retry: false,
    mutationFn: (items: StudioContentSegment[]) =>
      confirmStudioSegments(items.map((segment) => ({ segmentId: segment.segmentId, expectedRevision: segment.revision }))),
    onSuccess: (items) => {
      setNotice({ tone: 'success', text: `已确认 ${items.length} 条片段。` });
      void refresh();
    },
    onError: handleError,
  });

  const settle = async <T,>(run: () => Promise<T>): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch {
      return false;
    }
  };

  return {
    assetQuery,
    segmentsQuery,
    segments,
    truncated: segmentsQuery.data?.truncated ?? false,
    notice,
    noticeId,
    clearNotice: () => setNotice(null),
    busy: createMutation.isPending || updateMutation.isPending || confirmMutation.isPending,
    createSegment: (values: SegmentCreateValues) => settle(() => createMutation.mutateAsync(values)),
    updateSegment: (segment: StudioContentSegment, request: StudioUpdateContentSegmentRequest) =>
      settle(() => updateMutation.mutateAsync({ segment, request })),
    confirmSegments: (items: StudioContentSegment[]) => settle(() => confirmMutation.mutateAsync(items)),
  };
}
