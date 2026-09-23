import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Select, Tag } from 'antd';
import { cancelProductionShotJob, enqueueProductionShotJob, fetchProductionShotJobs } from '../_lib/content-production-api';
import styles from './content-production.module.css';

const active = ['queued', 'running', 'cancel_requested'];
const labels: Record<string, string> = { queued: '排队中', running: '提取中', cancel_requested: '正在取消', cancelled: '已取消', completed: '已完成', failed: '提取失败' };
const jobKey = ['content-production', 'shot-jobs'];
export function ContentProductionExtraction({ enabled, disabled, assetIds, onOpen }: { enabled: boolean; disabled: boolean; assetIds: string[]; onOpen: (id: string) => void }) {
  const cache = useQueryClient();
  const [selection, setSelection] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assetId = assetIds.includes(selection) ? selection : assetIds[0];
  useEffect(() => { setConfirmed(false); }, [assetId]);
  const jobs = useQuery({ queryKey: jobKey, queryFn: fetchProductionShotJobs, enabled, refetchInterval: (q) => q.state.data?.some((j) => active.includes(j.status)) ? 3000 : false });
  const completed = jobs.data?.filter((j) => j.status === 'completed').map((j) => j.jobId).join(',') ?? '';
  useEffect(() => { if (completed) void cache.invalidateQueries({ queryKey: ['content-production', 'shot-catalogs'] }); }, [completed, cache]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await jobs.refetch(); } catch (e) { setError(e instanceof Error ? e.message : '镜头提取操作失败'); }
    finally { setBusy(false); }
  };
  if (!enabled) return <p className={styles.helper}>自动镜头提取尚未启用，仍可导入已有目录。</p>;
  return <div className={styles.workbench} aria-label="原片镜头提取">
    <p className={styles.helper}>选择时间线涉及的原片，自动检测剪切候选。此任务不调用视觉模型，不会生成人物、产品或动作标签。</p>
    <div className={styles.actions}>
      <Select aria-label="提取镜头的原片" className={styles.projectSelect} placeholder="先向时间线加入素材" value={assetId} disabled={disabled || busy} onChange={(id) => { setSelection(id); setConfirmed(false); }} options={assetIds.map((id, i) => ({ value: id, label: `时间线素材 ${i + 1} · ${id.slice(0, 8)}` }))} />
      <Button type="primary" loading={busy} disabled={disabled || busy || !assetId || !confirmed} onClick={() => void perform(async () => { await enqueueProductionShotJob(assetId, confirmed); setConfirmed(false); })}>提取镜头</Button>
      <Button disabled={jobs.isFetching || busy} onClick={() => void jobs.refetch()}>刷新提取任务</Button>
    </div>
    <Checkbox checked={confirmed} disabled={disabled || busy} onChange={(e) => setConfirmed(e.target.checked)}>我已确认所选原片可用于本次提取和剪辑。</Checkbox>
    {(error || jobs.isError) && <Alert showIcon type="error" title="提取任务暂不可用" description={error || jobs.error?.message} />}
    <div className={styles.results}>{jobs.data?.map((job) => <article key={job.jobId} className={styles.hit}>
      <div className={styles.heading}><strong>{job.stage}</strong><Tag>{labels[job.status] ?? job.status}</Tag></div>
      <small>原片：{job.assetId}</small>
      {job.errorMessage && <p>{job.errorMessage}</p>}
      <div className={styles.actions}>
        {active.includes(job.status) && <Button disabled={disabled || busy || job.status === 'cancel_requested'} onClick={() => void perform(() => cancelProductionShotJob(job.jobId))}>取消提取</Button>}
        {job.status === 'completed' && job.catalogId && <Button onClick={() => onOpen(job.catalogId!)}>打开镜头目录</Button>}
      </div>
    </article>)}</div>
  </div>;
}
