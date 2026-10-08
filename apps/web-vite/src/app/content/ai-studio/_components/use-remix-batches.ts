import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { aiStudioQueryKeys, fetchAllStudioSegments } from '../_lib/ai-studio-api';
import {
  cancelRemixBatch,
  checkRemixEdit,
  createRemixBatch,
  createRemixEdit,
  fetchRemixBatch,
  fetchRemixBatches,
  fetchRemixProducts,
  isRemixBatchActive,
  previewRemixBatch,
  remixQueryKeys,
  type StudioRemixBatch,
  type StudioRemixBatchPreviewRequest,
  type StudioRemixEditCheckRequest,
} from '../_lib/remix-api';

export const REMIX_POLL_INTERVAL_MS = 10_000;
/** Renders queue on one FIFO slot; polling stops after this window and resumes on a manual refresh. */
export const REMIX_POLL_WINDOW_MS = 30 * 60_000;

/** Polls only while something is running and within the window; React Query pauses hidden pages. */
export function nextRemixPollInterval(active: boolean, pollSince: number, now: number): number | false {
  if (!active) return false;
  return now - pollSince < REMIX_POLL_WINDOW_MS ? REMIX_POLL_INTERVAL_MS : false;
}

export function useRemixProducts(preset: { presetKey: string; version: number } | null) {
  return useQuery({
    queryKey: remixQueryKeys.products(preset?.presetKey ?? '', preset?.version ?? 0),
    queryFn: ({ signal }) => fetchRemixProducts(preset!.presetKey, preset!.version, { signal }),
    enabled: preset !== null,
    staleTime: 60_000,
  });
}

/**
 * Confirmed segments of one preset: reference originals and the candidate
 * thumbnails both read from this one cached list (capped at 5 pages).
 */
export function useRemixConfirmedSegments(preset: { presetKey: string; version: number }, enabled: boolean) {
  return useQuery({
    queryKey: [...aiStudioQueryKeys.segments(), 'remix-reference', preset.presetKey, preset.version],
    queryFn: ({ signal }) =>
      fetchAllStudioSegments({ status: 'confirmed', presetKey: preset.presetKey }, { signal, maxPages: 5 }),
    enabled,
    staleTime: 60_000,
  });
}

/** Typing a count or adding slots settles before a (DB-heavy) preview is requested. */
export const REMIX_PREVIEW_DEBOUNCE_MS = 300;

/**
 * `request=null` means the form is incomplete; no preview is requested.
 * `settled` is false while the latest input is still debouncing, so callers
 * never act on a preview of an older input.
 */
export function useRemixPreview(request: StudioRemixBatchPreviewRequest | null) {
  const { debounced, settled } = useDebouncedRequest(request);
  const query = useQuery({
    queryKey: remixQueryKeys.preview(debounced ?? ({} as StudioRemixBatchPreviewRequest)),
    queryFn: ({ signal }) => previewRemixBatch(debounced!, { signal }),
    enabled: debounced !== null,
    staleTime: 15_000,
    retry: false,
    // Keep the last result visible while a changed input is re-checked.
    placeholderData: (previous) => previous,
  });
  return { query, settled };
}

/**
 * The latest request after it stopped changing for `REMIX_PREVIEW_DEBOUNCE_MS`
 * (null clears at once). `settled` is false while a newer input is pending.
 */
function useDebouncedRequest<T>(request: T | null): { debounced: T | null; settled: boolean } {
  const key = request ? JSON.stringify(request) : null;
  const [debouncedKey, setDebouncedKey] = useState(key);
  useEffect(() => {
    if (key === debouncedKey) return undefined;
    const timer = window.setTimeout(() => setDebouncedKey(key), key === null ? 0 : REMIX_PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, debouncedKey]);
  return { debounced: debouncedKey ? (JSON.parse(debouncedKey) as T) : null, settled: key === debouncedKey };
}

/** 单条剪辑 duplicate/similar check of the current 剪辑台; `request=null` while the edit is incomplete. */
export function useRemixEditCheck(request: StudioRemixEditCheckRequest | null) {
  const { debounced, settled } = useDebouncedRequest(request);
  const query = useQuery({
    queryKey: remixQueryKeys.editCheck(debounced ?? ({} as StudioRemixEditCheckRequest)),
    queryFn: ({ signal }) => checkRemixEdit(debounced!, { signal }),
    enabled: debounced !== null,
    staleTime: 15_000,
    retry: false,
  });
  return { query, settled };
}

/** Creating an edit queues a render; a lost response must not be replayed. */
export function useCreateRemixEdit() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: createRemixEdit,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remixQueryKeys.batches() });
      void queryClient.invalidateQueries({ queryKey: aiStudioQueryKeys.overview() });
      void queryClient.invalidateQueries({ queryKey: [...aiStudioQueryKeys.root, 'remix-edit-check'] });
    },
  });
}

export function useCreateRemixBatch() {
  const queryClient = useQueryClient();
  // Creating a batch queues renders; a lost response must not be replayed.
  return useMutation({
    retry: false,
    mutationFn: createRemixBatch,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remixQueryKeys.batches() });
      void queryClient.invalidateQueries({ queryKey: aiStudioQueryKeys.overview() });
    },
  });
}

/** Cancels a batch's unfinished outputs; never retried automatically (a lost response is re-read). */
export function useCancelRemixBatch(batchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: () => cancelRemixBatch(batchId),
    onSuccess: (detail) => {
      queryClient.setQueryData(remixQueryKeys.batch(batchId), detail);
      void queryClient.invalidateQueries({ queryKey: remixQueryKeys.batches(), exact: true });
      void queryClient.invalidateQueries({ queryKey: aiStudioQueryKeys.overview() });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: remixQueryKeys.batch(batchId) });
    },
  });
}

/** Newest creation time among running batches; a new batch restarts the polling window. */
function newestActiveStart(batches: readonly StudioRemixBatch[]): number {
  return batches
    .filter((batch) => isRemixBatchActive(batch))
    .reduce((latest, batch) => Math.max(latest, Date.parse(batch.createdAt) || 0), 0);
}

/**
 * True once the polling window has run out while something is still running,
 * so the page can say auto refresh paused instead of looking stuck.
 */
function usePollPaused(active: boolean, since: number): boolean {
  const [now, setNow] = useState(() => Date.now());
  const deadline = since + REMIX_POLL_WINDOW_MS;
  useEffect(() => {
    if (!active || now >= deadline) return undefined;
    const timer = window.setTimeout(() => setNow(Date.now()), deadline - now + 50);
    return () => window.clearTimeout(timer);
  }, [active, deadline, now]);
  return active && now >= deadline;
}

export function useRemixBatches(enabled: boolean) {
  const [pollSince, setPollSince] = useState(() => Date.now());
  const query = useQuery({
    queryKey: remixQueryKeys.batches(),
    queryFn: ({ signal }) => fetchRemixBatches({ signal }),
    enabled,
    refetchInterval: (current) => {
      const batches = current.state.data ?? [];
      return nextRemixPollInterval(
        batches.some((batch: StudioRemixBatch) => isRemixBatchActive(batch)),
        Math.max(pollSince, newestActiveStart(batches)),
        Date.now(),
      );
    },
    refetchIntervalInBackground: false,
  });
  const batches = query.data ?? [];
  const pollPaused = usePollPaused(
    batches.some((batch) => isRemixBatchActive(batch)),
    Math.max(pollSince, newestActiveStart(batches)),
  );
  const refresh = () => {
    setPollSince(Date.now());
    return query.refetch();
  };
  return { query, refresh, pollPaused };
}

export function useRemixBatch(batchId: string | null) {
  const [pollSince, setPollSince] = useState(() => Date.now());
  const query = useQuery({
    queryKey: remixQueryKeys.batch(batchId ?? ''),
    queryFn: ({ signal }) => fetchRemixBatch(batchId!, { signal }),
    enabled: batchId !== null,
    refetchInterval: (current) => {
      const batch = current.state.data?.batch;
      return nextRemixPollInterval(
        batch ? isRemixBatchActive(batch) : false,
        Math.max(pollSince, batch ? newestActiveStart([batch]) : 0),
        Date.now(),
      );
    },
    refetchIntervalInBackground: false,
  });
  const batch = query.data?.batch;
  const pollPaused = usePollPaused(
    batch ? isRemixBatchActive(batch) : false,
    Math.max(pollSince, batch ? newestActiveStart([batch]) : 0),
  );
  const refresh = () => {
    setPollSince(Date.now());
    return query.refetch();
  };
  return { query, refresh, pollPaused };
}
