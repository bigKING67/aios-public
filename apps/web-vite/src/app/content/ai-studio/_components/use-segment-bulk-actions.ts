import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  SEGMENT_DEPENDENT_QUERY_PREFIXES,
  confirmStudioSegments,
  type StudioContentSegment,
  type StudioSegmentPreset,
  updateStudioSegment,
} from '../_lib/ai-studio-api';
import { findPreset, labelName } from '../_lib/segment-display';
import { describeSegmentMutationError } from '../_lib/segment-errors';
import type { AnnotationNotice } from './use-segment-annotation';

type BulkAction =
  | { kind: 'confirm'; items: StudioContentSegment[] }
  | { kind: 'reject'; items: StudioContentSegment[] }
  | { kind: 'product'; items: StudioContentSegment[]; productName: string };

/**
 * Library-level bulk writes. Confirm is all-or-nothing on the server; reject
 * and product updates run one optimistic PATCH per segment and stop at the
 * first failure, reporting how many were already applied.
 */
export function useSegmentBulkActions(presets: readonly StudioSegmentPreset[]) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<AnnotationNotice | null>(null);

  const mutation = useMutation({
    // Segment writes need immediate conflict feedback; never retry silently.
    retry: false,
    mutationFn: async (action: BulkAction): Promise<string> => {
      if (action.kind === 'confirm') {
        const confirmed = await confirmStudioSegments(
          action.items.map((segment) => ({ segmentId: segment.segmentId, expectedRevision: segment.revision }))
        );
        return `已确认 ${confirmed.length} 条片段。`;
      }
      let applied = 0;
      try {
        for (const segment of action.items) {
          await updateStudioSegment(
            segment.segmentId,
            action.kind === 'reject'
              ? { expectedRevision: segment.revision, status: 'rejected' }
              : { expectedRevision: segment.revision, productName: action.productName }
          );
          applied += 1;
        }
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { applied });
      }
      return action.kind === 'reject' ? `已驳回 ${applied} 条片段。` : `已为 ${applied} 条片段设置产品「${action.productName}」。`;
    },
    onSuccess: (text) => setNotice({ tone: 'success', text }),
    onError: (error, action) => {
      const lookup = action.items.map((segment) => ({
        segmentId: segment.segmentId,
        startMs: segment.startMs,
        endMs: segment.endMs,
        labelName: labelName(findPreset(presets, segment.presetKey, segment.presetVersion), segment.labelKey),
      }));
      const described = describeSegmentMutationError(error, lookup);
      const applied = (error as { applied?: number }).applied ?? 0;
      setNotice({
        tone: 'error',
        error: applied > 0 ? { ...described, message: `前 ${applied} 条已处理，其余未执行：${described.message}` } : described,
      });
    },
    onSettled: () =>
      Promise.all(SEGMENT_DEPENDENT_QUERY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });

  return {
    notice,
    clearNotice: () => setNotice(null),
    busy: mutation.isPending,
    run: (action: BulkAction) => mutation.mutateAsync(action).then(() => true, () => false),
  };
}
