import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Empty, Input, Select, Tag } from 'antd';
import { cancelProductionSemanticJob, enqueueProductionSemanticJob, fetchProductionSemanticJobs, searchProductionSemanticClips, type ProductionClip } from '../_lib/content-production-api';
import styles from './content-production.module.css';

const active = ['queued', 'running', 'cancel_requested'];
const labels: Record<string, string> = { queued: '排队中', running: '分析中', cancel_requested: '正在取消', cancelled: '已取消', completed: '已完成', failed: '分析失败' };
export function ContentProductionSemantics({ catalogId, clips, disabled, onAdd }: { catalogId: string; clips: ProductionClip[]; disabled: boolean; onAdd: (clip: ProductionClip) => void }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [playing, setPlaying] = useState('');
  const jobs = useQuery({ queryKey: ['content-production', 'semantic-jobs'], queryFn: fetchProductionSemanticJobs, refetchInterval: (q) => q.state.data?.some((j) => active.includes(j.status)) ? 3000 : false });
  const currentJobs = jobs.data?.filter((j) => j.catalogId === catalogId) ?? [];
  const completed = currentJobs.filter((j) => j.status === 'completed').map((j) => j.jobId).join(',');
  useEffect(() => { if (completed) void cache.invalidateQueries({ queryKey: ['content-production', 'semantic-clips', catalogId] }); }, [completed, catalogId, cache]);
  const hits = useQuery({ queryKey: ['content-production', 'semantic-clips', catalogId, term], queryFn: ({ signal }) => searchProductionSemanticClips(catalogId, term, signal), enabled: Boolean(term) });
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await jobs.refetch(); } catch (e) { setError(e instanceof Error ? e.message : '语义任务操作失败'); }
    finally { setBusy(false); }
  };
  return <section className={styles.workbench} aria-label="镜头语义分析">
    <div className={styles.heading}><h2>按画面找镜头</h2><Tag>基于代表帧</Tag></div>
    <p className={styles.helper}>从当前目录选择最多 12 个镜头进行分析。模型描述仅覆盖单张代表帧，完整动作、声音和效果仍需播放原片核对。</p>
    <Select mode="multiple" maxCount={12} maxTagCount="responsive" aria-label="选择语义分析镜头" placeholder="选择需要分析的镜头（最多 12 个）" disabled={disabled || busy} value={selected} onChange={(ids) => { setSelected(ids); setConfirmed(false); }} options={clips.map((c, i) => ({ value: c.id, label: `候选 ${i + 1} · ${(c.startMs / 1000).toFixed(2)}–${(c.endMs / 1000).toFixed(2)} 秒` }))} />
    <Checkbox checked={confirmed} disabled={disabled || busy || !selected.length} onChange={(e) => setConfirmed(e.target.checked)}>确认所选素材可用于本次分析；同意将代表帧发送给已配置的模型，调用可能产生费用。</Checkbox>
    <div className={styles.actions}>
      <Button type="primary" loading={busy} disabled={disabled || busy || !confirmed || !selected.length} onClick={() => void perform(async () => { await enqueueProductionSemanticJob(catalogId, selected, confirmed); setConfirmed(false); })}>分析所选镜头</Button>
      <Button disabled={busy || jobs.isFetching} onClick={() => void jobs.refetch()}>刷新语义任务</Button>
    </div>
    {(error || jobs.isError) && <Alert type="error" showIcon title="语义任务暂不可用" description={error || jobs.error?.message} />}
    <div className={styles.results}>{currentJobs.map((job) => <article className={styles.hit} key={job.jobId}>
      <div className={styles.heading}><strong>{job.stage}</strong><Tag>{labels[job.status] ?? job.status}</Tag></div>
      {job.errorMessage && <p>{job.errorMessage}</p>}
      {active.includes(job.status) && <Button disabled={disabled || busy || job.status === 'cancel_requested'} onClick={() => void perform(() => cancelProductionSemanticJob(job.jobId))}>取消语义分析</Button>}
    </article>)}</div>
    <Input.Search aria-label="检索镜头画面" placeholder="搜索当前目录已分析镜头，例如：白色瓶子" maxLength={120} value={input} loading={hits.isFetching} onChange={(e) => { setInput(e.target.value); setTerm(''); setPlaying(''); }} onSearch={(q) => { setTerm(q.trim()); setPlaying(''); if (q.trim() && q.trim() === term) void hits.refetch(); }} />
    {hits.isError && <Alert type="error" showIcon title="镜头搜索失败" description={hits.error.message} />}
    {term && !hits.isPending && !hits.isError && !hits.data?.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的已分析镜头，可调整关键词或先分析更多镜头" />}
    {playing && <video className={styles.video} controls autoPlay src={playing} aria-label="语义镜头播放" />}
    <div className={styles.results}>{term && !hits.isError && hits.data?.map((hit) => <article key={hit.shotId} className={styles.hit}>
      <strong>{(hit.startMs / 1000).toFixed(3)}–{(hit.endMs / 1000).toFixed(3)} 秒</strong>
      <p>{hit.observation.description}</p>
      <p className={styles.helper}>物体：{hit.observation.objects.join('、') || '未识别'} · 场景：{hit.observation.setting}</p>
      {hit.observation.visibleText.length > 0 && <p>画面文字：{hit.observation.visibleText.join('；')}</p>}
      {hit.observation.reuseIdeas.length > 0 && <p className={styles.helper}>复用建议：{hit.observation.reuseIdeas.join('；')}</p>}
      <small>代表帧 {(hit.requestedAtMs / 1000).toFixed(3)} 秒 · {hit.model} · {hit.promptVersion}</small>
      <div className={styles.actions}>
        <Button onClick={() => setPlaying(`${hit.playbackUrl}#t=${hit.startMs / 1000},${hit.endMs / 1000}`)}>播放原片片段</Button>
        <Button disabled={disabled} onClick={() => onAdd({ id: crypto.randomUUID(), assetId: hit.assetId, startMs: hit.startMs, endMs: hit.endMs, caption: '', volume: 1 })}>加入时间线</Button>
      </div>
    </article>)}</div>
  </section>;
}
