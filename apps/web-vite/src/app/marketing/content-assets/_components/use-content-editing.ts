import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { controlEditingRun, editingKeys, fetchEditingRun, type EditingDetail, type EditingRun } from '../_lib/content-editing-api';
import { isEditingWatched, newerEditingDetail } from '../_lib/content-editing-state';

export const EDITING_POLL_WINDOW_MS = 30 * 60_000;

export function useContentEditing(enabled: boolean) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('editingRun');
  const [failure, setFailure] = useState<{ id: string | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState<string[]>([]);
  // Bounded like batch polling: a run stuck for 30 minutes stops polling until 刷新状态.
  const [pollSince, setPollSince] = useState(() => Date.now());
  const detail = useQuery({ queryKey: editingKeys.detail(selected), queryFn: ({ signal }) => fetchEditingRun(selected!, signal), enabled: enabled && !!selected, refetchInterval: (q) => q.state.data && isEditingWatched(q.state.data.run) && Date.now() - pollSince < EDITING_POLL_WINDOW_MS ? 2000 : false });
  const select = (id: string | null) => {
    setFailure(null);
    setParams((previous) => { const next = new URLSearchParams(previous); if (id) next.set('editingRun', id); else next.delete('editingRun'); return next; });
  };
  const accept = async (value: EditingDetail) => {
    await client.cancelQueries({ queryKey: editingKeys.detail(value.run.runId) });
    client.setQueryData<EditingDetail>(editingKeys.detail(value.run.runId), (old) => newerEditingDetail(old, value));
  };
  const plan = async (run: EditingRun) => {
    setPlanning((ids) => [...ids, run.runId]);
    try { await accept(await controlEditingRun(run, 'plan')); }
    catch (error) { setFailure({ id: run.runId, message: error instanceof Error ? error.message : '规划请求未完成，请刷新任务状态。' }); }
    finally { setPlanning((ids) => ids.filter((id) => id !== run.runId)); void client.invalidateQueries({ queryKey: editingKeys.detail(run.runId) }); }
  };
  const perform = async (run: EditingRun, action: () => Promise<EditingDetail>, planAfter = false) => {
    setBusy(true); setFailure(null);
    try { const value = await action(); await accept(value); if (planAfter && value.run.status === 'queued') void plan(value.run); return true; }
    catch (error) { setFailure({ id: run.runId, message: error instanceof Error ? error.message : '操作失败，请刷新后重试。' }); return false; }
    finally { setBusy(false); void client.invalidateQueries({ queryKey: editingKeys.detail(run.runId) }); }
  };
  const refreshDetail = () => { setPollSince(Date.now()); return detail.refetch(); };
  return { selected, select, detail, refreshDetail, busy, planning: planning.includes(selected ?? ''), failure: failure?.id === selected ? failure.message : '', plan, perform };
}
