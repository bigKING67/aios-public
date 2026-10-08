import type { EditingDetail, EditingRun } from './content-editing-api';

/**
 * Framework remix (框架混剪 / 单条剪辑) Runs freeze their clip combination at
 * creation; the Runs API rejects plan revisions for them.
 */
export function isPlanFrozen(taskType: string): boolean {
  return taskType === 'framework_remix';
}
export const editingStatus: Record<EditingRun['status'], string> = {
  queued: '等待规划', running: '处理中', waiting: '待处理', paused: '已暂停', cancelling: '正在取消', cancelled: '已取消', failed: '失败', succeeded: '已完成',
};
export const editingStages: Record<string, string> = { intake: '准备素材', planning: '编排方案', production: '制作视频', inspection: '检查成片', delivery: '交付成片' };
/** Wording for frozen-plan Runs (框架混剪 / 单条剪辑), whose plan cannot be revised. */
export const frozenPlanReasons: Record<string, string> = {
  invalid_render_receipt: '成片检查失败，可重新制作。',
  render_superseded: '结果已失效，可重新制作。',
  render_failed: '制作失败，可恢复任务重新制作。',
  missing_material: '素材已不可用，请在 AI 剪辑重新生成这条成片。',
};
export const editingReasons: Record<string, string> = {
  awaiting_plan_confirmation: '方案就绪，确认后开始制作。', awaiting_execution_adapter: '方案就绪，可以制作。', render_paused: '已暂停，可修改或恢复。',
  missing_material: '素材不足，请处理方案缺口或新建任务更换素材。',
  planning_failed: '规划失败，可恢复重试；不会自动重复调用模型。',
  render_failed: '制作失败，检查错误后恢复。', render_cancelled: '制作已停止，可恢复。',
  render_superseded: '结果失效，请检查方案后制作。', invalid_render_receipt: '成片检查失败，请检查方案后重试。',
};
/** Waiting reasons that mean the last attempt failed (shown as a failure, not a pending step). */
const FAILURE_REASONS = new Set([
  'planning_failed', 'render_failed', 'invalid_render_receipt', 'render_superseded',
  'remix_lineage_mismatch', 'remix_output_failed', 'missing_material',
]);
export function isEditingFailure(run: Pick<EditingRun, 'status' | 'waitingReason'>): boolean {
  return run.status === 'failed' || (run.status === 'waiting' && FAILURE_REASONS.has(run.waitingReason ?? ''));
}
export const isEditingActive = (run: EditingRun) => run.status === 'running' || run.status === 'cancelling';
// Polling is read-only; keep it separate from edit/pause action eligibility.
export const isEditingWatched = (run: EditingRun) => isEditingActive(run) || (run.status === 'waiting' && run.waitingReason === 'caption_quality_pending' && (run.request.maxAutoRepairs ?? 0) > 0);
export function editingActions(detail: EditingDetail) {
  const { run, plan } = detail;
  const terminal = ['succeeded', 'failed', 'cancelled', 'cancelling'].includes(run.status);
  return {
    edit: !!plan && !terminal && !isEditingActive(run),
    pause: !terminal && ['queued', 'running', 'waiting'].includes(run.status) && !run.pauseRequested,
    cancel: !terminal,
    resume: run.status === 'paused' || (run.status === 'waiting' && ['planning_failed', 'render_failed', 'render_cancelled'].includes(run.waitingReason ?? '')),
    plan: run.status === 'queued',
    produce: run.status === 'waiting' && !!plan?.document.clips.length && !plan.document.gaps.length,
  };
}
// A late planning response must never roll back a newer pause/cancel response.
export function newerEditingDetail(current: EditingDetail | undefined, incoming: EditingDetail) {
  return current && current.run.version > incoming.run.version ? current : incoming;
}
