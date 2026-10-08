import { Alert } from 'antd';
import type { EditingRun } from '../_lib/content-editing-api';

const labels: Record<string, string> = {
  production_queued: '最近一次修订：已采用替换方案并排队',
  evidence_required: '证据不足，自动修订已停止',
  no_eligible_candidate: '没有合适的替代素材，自动修订已停止',
  access_denied: '权限不可用，自动修订已停止',
  blocked: '修订条件不满足，自动修订已停止',
  reserved_outcome_unknown: '本轮已占用，执行结果尚未确认',
  outcome_unknown: '执行结果未确认，不会自动重试本轮',
};
export function ContentEditingAutomaticRepair({ summary, run }: { summary: unknown; run: EditingRun }) {
  const value = summary && typeof summary === 'object' ? summary as Record<string, unknown> : null;
  const used = value?.roundsReserved;
  const max = value?.maxRounds;
  const status = value?.latestStatus;
  const valid = (max === 1 || max === 2) && max === run.request.maxAutoRepairs
    && typeof used === 'number' && Number.isSafeInteger(used) && used >= 0 && used <= max
    && value?.deliveryApproved === false && value.budgetExhausted === (used >= max)
    && ((used === 0 && status === null) || (used > 0 && typeof status === 'string' && Object.prototype.hasOwnProperty.call(labels, status)));
  if (!valid) return <Alert type="warning" title="自动修订记录待确认" description="当前无法确认已用轮数和执行结果，请刷新任务。不会根据缺失记录判断修订成功。" />;
  const stopped = ['paused', 'cancelled', 'failed', 'cancelling'].includes(run.status);
  const title = stopped ? '任务已暂停或停止，自动修订不会继续' : status === null ? '尚未启动自动修订' : labels[status as string];
  const exhausted = used >= max;
  return <Alert type={stopped || exhausted || (status !== null && status !== 'production_queued') ? 'warning' : 'info'} title={title}
    description={`已占用 ${used} / ${max} 轮，剩余 ${max - used} 轮。${exhausted ? '自动修订次数已用完；已排队的制作仍按任务状态执行。' : '仅在检查发现可替换片段时执行。'}未完成的调用也占用轮数；修订状态不代表成片可交付。`} />;
}
