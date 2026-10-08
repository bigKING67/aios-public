import { Alert, Button, Popconfirm, Tag } from 'antd';
import { adoptEditingCaptionCandidate, controlEditingRun, produceEditingRun, reviseEditingPlan } from '../_lib/content-editing-api';
import { editingActions, editingReasons, editingStages, editingStatus, frozenPlanReasons, isEditingFailure, isPlanFrozen } from '../_lib/content-editing-state';
import { ContentEditingPlan } from './content-editing-plan';
import { ContentEditingResult } from './content-editing-result';
import type { useContentEditing } from './use-content-editing';
import styles from './content-editing.module.css';

export function ContentEditingDetail({ state, canWrite, editing, onEditing, onProject }: { state: ReturnType<typeof useContentEditing>; canWrite: boolean; editing: boolean; onEditing: (value: boolean) => void; onProject: (id: string) => void }) {
  const detail = state.detail.data!;
  const { run } = detail;
  const actions = editingActions(detail);
  const picture = run.request.taskType === 'picture_remix';
  const frozen = isPlanFrozen(run.request.taskType);
  const failed = isEditingFailure(run);
  const disabled = !canWrite || state.busy || editing;
  const control = (action: 'pause' | 'resume' | 'cancel') => state.perform(run, () => controlEditingRun(run, action), action === 'resume');
  return <div className={styles.stack}>
    <section className={styles.panel} aria-label="任务进度">
      <div className={styles.heading}><div><h2>{run.request.title}</h2><p className={styles.helper}>{run.request.assetIds.length} 条原片 · {picture ? '保留原声' : '最长'} {run.request.targetSeconds} 秒 · {run.request.reviewBeforeProduction ? '先看方案' : '自动制作'}</p></div><Tag color={failed ? 'error' : undefined}>{run.pauseRequested ? '正在暂停' : failed && run.status === 'waiting' ? '失败待处理' : editingStatus[run.status]}</Tag></div>
      <ol className={styles.stages} aria-label="制作阶段">{Object.entries(editingStages).map(([stage, title], index) => <li key={stage} aria-current={run.stage === stage ? 'step' : undefined}><span>{index + 1}</span>{title}</li>)}</ol>
      <p className={styles.summary}>{run.request.brief}</p>
      {run.pauseRequested ? <Alert type="info" title="等待当前步骤安全暂停。" /> : run.waitingReason && <Alert type={failed ? 'error' : 'info'} showIcon={failed} title={(frozen ? frozenPlanReasons[run.waitingReason] : undefined) ?? editingReasons[run.waitingReason] ?? (frozen ? '请检查制作结果，可重新制作。' : '请检查方案与制作结果。')} />}
      <div className={styles.actions}>
        {actions.plan && <Button type="primary" disabled={disabled || state.planning} onClick={() => void state.plan(run)}>开始规划</Button>}
        {actions.produce && !actions.resume && <Button type="primary" disabled={disabled} loading={state.busy} onClick={() => void state.perform(run, () => produceEditingRun(run))}>{failed ? '重新制作' : '开始制作'}</Button>}
        {actions.resume && <Button type="primary" disabled={disabled} loading={state.busy} onClick={() => void control('resume')}>恢复任务</Button>}
        {run.status === 'running' && run.stage === 'planning' && !state.planning && <Button disabled={disabled} onClick={() => void control('resume')}>检查并恢复规划</Button>}
        {actions.pause && <Button disabled={disabled} onClick={() => void control('pause')}>暂停任务</Button>}
        {actions.cancel && <Popconfirm title="取消这个任务？" description="取消后不会再制作；已在渲染的会等渲染进程停止。取消后不能恢复。" okText="取消任务" cancelText="返回" okButtonProps={{ danger: true }} onConfirm={() => void control('cancel')} disabled={disabled || run.pauseRequested}><Button danger disabled={disabled || run.pauseRequested}>取消任务</Button></Popconfirm>}
        <Button disabled={state.busy} loading={state.detail.isFetching} onClick={() => void state.refreshDetail()}>刷新状态</Button>
        {run.projectId && !picture && <Button disabled={state.busy || editing || ['running', 'cancelling'].includes(run.status)} onClick={() => onProject(run.projectId!)}>查看 / 精修工程</Button>}
      </div>
      {run.status === 'running' && run.stage === 'planning' && <p className={styles.helper}>正在规划；关闭页面后可恢复任务，不会自动重复调用模型。</p>}
      {frozen && <p className={styles.helper}>片段组合在生成时已锁定，不能修改方案；失败时可重新制作，需要调整画面请用「查看 / 精修工程」另存精修版本。</p>}
      {run.projectId && !frozen && <p className={styles.helper}>{picture ? '独立原声已保存；请在方案页调整画面，暂不支持通用工程精修。' : '精修单独保存，不改变本任务的方案及成片版本。'}</p>}
    </section>
    <ContentEditingPlan detail={detail} editable={canWrite && actions.edit && !frozen} frozen={frozen} busy={state.busy} onEditing={onEditing} onSave={(version, document, unlock) => state.perform(version, () => reviseEditingPlan(version, document, unlock))} />
    <ContentEditingResult key={`${run.runId}:${run.version}`} run={run} disabled={disabled || !actions.edit} onAdopt={(candidate) => state.perform(run, () => adoptEditingCaptionCandidate(run, candidate))} />
  </div>;
}
