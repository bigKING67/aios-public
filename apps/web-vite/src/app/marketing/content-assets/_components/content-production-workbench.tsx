import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Empty, Input, Select, Spin, Tag } from 'antd';
import { cancelProductionRender, enqueueProductionRender, fetchProductionCapabilities, fetchProductionProject, fetchProductionProjects, productionKeys, saveProductionProject, type ProductionDraft, type ProductionProject } from '../_lib/content-production-api';
import { applyProductionCommand, emptyProductionDraft } from '../_lib/content-production-edit';
import { ContentProductionCatalogs } from './content-production-catalogs';
import { ContentProductionPlanner } from './content-production-planner';
import { ContentProductionSearch } from './content-production-search';
import { ContentProductionTimeline } from './content-production-timeline';
import styles from './content-production.module.css';

const activeStatuses = ['queued', 'running', 'cancel_requested'];
const statusLabels: Record<string, string> = { queued: '排队中', running: '制作中', cancel_requested: '正在取消', cancelled: '已取消', completed: '已完成', failed: '制作失败' };
// Only send editable fields back; server-bound source identities stay on the server.
const editable = (snapshot: ProductionDraft): ProductionDraft => ({ title: snapshot.title, aspect: snapshot.aspect, clips: snapshot.clips, rightsConfirmed: snapshot.rightsConfirmed });

export function ContentProductionWorkbench() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [project, setProject] = useState<ProductionProject | null>(null);
  const [draft, setDraft] = useState<ProductionDraft>(emptyProductionDraft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [command, setCommand] = useState('');
  const capabilities = useQuery({ queryKey: productionKeys.capabilities, queryFn: fetchProductionCapabilities });
  const enabled = capabilities.data?.enabled === true;
  const canWrite = enabled && capabilities.data?.canWrite === true;
  const projects = useQuery({ queryKey: productionKeys.projects, queryFn: fetchProductionProjects, enabled });
  const detail = useQuery({ queryKey: productionKeys.detail(project?.projectId ?? null), queryFn: () => fetchProductionProject(project!.projectId), enabled: enabled && Boolean(project), refetchInterval: (query) => query.state.data?.jobs.some((job) => activeStatuses.includes(job.status)) ? 3000 : false });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (next: ProductionDraft) => { setDraft(next); setDirty(true); };
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setFailure('');
    try { await action(); } catch (error) { setFailure(error instanceof Error ? error.message : '操作失败，请重试'); } finally { setBusy(false); }
  };
  const openProject = (id: string | null) => {
    const open = () => perform(async () => {
      if (!id) { setProject(null); setDraft(emptyProductionDraft()); setDirty(false); return; }
      const result = await fetchProductionProject(id);
      if (!result.project.snapshot) throw new Error('工程内容为空');
      setProject(result.project); setDraft(editable(result.project.snapshot)); setDirty(false);
      queryClient.setQueryData(productionKeys.detail(id), result);
    });
    if (dirty) modal.confirm({ title: '放弃尚未保存的修改？', content: '已保存的工程版本会保留。', okText: '放弃并继续', cancelText: '继续编辑', onOk: open });
    else void open();
  };
  const save = () => perform(async () => {
    const saved = await saveProductionProject(draft, project);
    setProject(saved); setDraft(editable(saved.snapshot!)); setDirty(false);
    await queryClient.invalidateQueries({ queryKey: productionKeys.projects });
    await queryClient.invalidateQueries({ queryKey: productionKeys.detail(saved.projectId) });
    void message.success(`已保存版本 ${saved.revision}`);
  });
  const render = (preview: boolean) => perform(async () => {
    if (!project || dirty) throw new Error('请先保存当前修改');
    await enqueueProductionRender(project.projectId, project.revision, preview);
    await queryClient.invalidateQueries({ queryKey: productionKeys.detail(project.projectId) });
    void message.success('已加入制作队列');
  });
  if (capabilities.isPending) return <Spin aria-label="加载视频创作" />;
  if (capabilities.isError) return <Alert type="error" showIcon title="无法加载视频创作" description={capabilities.error.message} action={<Button onClick={() => void capabilities.refetch()}>重试</Button>} />;
  if (!enabled) return <Empty description="视频创作尚未启用，启用后可在这里选片、编辑和导出。" />;
  return <div className={styles.workbench}>
    <header className={styles.heading}><div><h1>视频创作</h1><p className={styles.helper}>从已有素材选取片段，保存工程，再制作预览或成片。</p></div><Tag>{dirty ? '有未保存修改' : project ? `版本 ${project.revision}` : '新工程'}</Tag></header>
    <div className={styles.actions}>
      <Select aria-label="打开已保存工程" className={styles.projectSelect} placeholder="打开已保存工程" loading={projects.isFetching} value={project?.projectId} disabled={busy} onChange={(id) => openProject(id)} options={projects.data?.map((item) => ({ value: item.projectId, label: `${item.title} · v${item.revision}` }))} />
      <Button disabled={busy} onClick={() => openProject(null)}>新建工程</Button>
      <Button disabled={busy || !project} onClick={() => openProject(project!.projectId)}>重新载入</Button>
      <Button type="primary" loading={busy} disabled={!canWrite || !draft.clips.length || !draft.rightsConfirmed || !dirty} onClick={() => void save()}>保存工程</Button>
    </div>
    {!canWrite && <Alert type="info" title="当前账号可查看，素材复剪需要内容编辑权限。" />}
    {(failure || projects.isError || detail.isError) && <Alert type="error" showIcon title="操作未完成" description={failure || projects.error?.message || detail.error?.message} />}
    <ContentProductionPlanner key={project?.projectId ?? "new"} enabled={capabilities.data?.planningEnabled === true} disabled={!canWrite || busy} draft={draft} onApply={(clips) => edit({ ...draft, clips, rightsConfirmed: false })} />
    <ContentProductionCatalogs semanticsEnabled={capabilities.data?.semanticsEnabled === true} extractionEnabled={capabilities.data?.shotExtractionEnabled === true} assetIds={[...new Set(draft.clips.map((clip) => clip.assetId))]} disabled={!canWrite || busy || draft.clips.length >= 100} onAdd={(clip) => edit({ ...draft, rightsConfirmed: false, clips: [...draft.clips, clip] })} />
    <div className={styles.columns}>
      <ContentProductionSearch disabled={!canWrite || busy || draft.clips.length >= 100} onAdd={(hit) => edit({ ...draft, clips: [...draft.clips, { id: crypto.randomUUID(), assetId: hit.assetId, startMs: hit.startMs, endMs: hit.endMs, caption: '', volume: 1 }] })} />
      <div className={styles.workbench}>
        <ContentProductionTimeline draft={draft} disabled={!canWrite || busy} onChange={edit} />
        <section className={styles.panel} aria-label="编辑指令">
          <h2>快捷编辑指令</h2><p className={styles.helper}>支持：把第2段移到开头、删除第2段、第2段静音。修改后需保存。</p>
          <Input.Search aria-label="编辑指令" placeholder="把第2段移到开头" value={command} onChange={(event) => setCommand(event.target.value)} disabled={!canWrite || busy} enterButton="执行" onSearch={() => {
            try { const result = applyProductionCommand(draft.clips, command); edit({ ...draft, clips: result.clips }); setCommand(''); void message.success(result.summary); } catch (error) { setFailure(error instanceof Error ? error.message : '指令执行失败'); }
          }} />
          <Checkbox checked={draft.rightsConfirmed} disabled={!canWrite || busy} onChange={(event) => edit({ ...draft, rightsConfirmed: event.target.checked })}>我已确认所选素材可用于本次制作；素材档案中的明确限制仍然生效。</Checkbox>
        </section>
      </div>
    </div>
    <section className={styles.panel} aria-label="制作与导出">
      <div className={styles.heading}><h2>制作与导出</h2><div className={styles.actions}>
        <Button disabled={!canWrite || busy || dirty || !project} onClick={() => void render(true)}>制作预览</Button>
        <Button type="primary" disabled={!canWrite || busy || dirty || !project} onClick={() => void render(false)}>导出成片</Button>
        <Button disabled={!project || detail.isFetching} onClick={() => void detail.refetch()}>刷新任务</Button>
      </div></div>
      <p className={styles.helper}>每次制作使用已保存的工程版本。预览为较低清晰度，成片按所选画幅输出。</p>
      {!detail.data?.jobs.length && <p className={styles.helper}>还没有制作任务。</p>}
      {detail.data?.jobs.map((job) => <article className={styles.hit} key={job.jobId}>
        <div className={styles.heading}><strong>版本 {job.revision} · {job.preview ? '预览' : '成片'}</strong><Tag>{statusLabels[job.status] ?? job.status}</Tag></div>
        <span>{job.stage}</span>
        {job.errorMessage && <Alert type="error" title={job.errorMessage} />}
        {job.playbackUrl && <><video className={styles.video} controls preload="metadata" src={job.playbackUrl} aria-label={`版本 ${job.revision} 成片`} /><a href={job.playbackUrl} target="_blank" rel="noreferrer">打开视频 / 下载</a></>}
        {job.status === 'completed' && !job.playbackUrl && <p className={styles.helper}>成片当前不可访问，请检查源素材状态与权限。</p>}
        {activeStatuses.includes(job.status) && <Button disabled={!canWrite || busy || job.status === 'cancel_requested'} onClick={() => void perform(async () => { await cancelProductionRender(project!.projectId, job.jobId); await detail.refetch(); })}>取消任务</Button>}
      </article>)}
    </section>
  </div>;
}
