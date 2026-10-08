import { type ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Spin } from 'antd';
import { fetchProductionCapabilities, productionKeys } from '../_lib/content-production-api';
import { ContentEditingDetail } from './content-editing-detail';
import { ContentProductionWorkbench } from './content-production-workbench';
import { useContentEditing } from './use-content-editing';
import styles from './content-editing.module.css';

interface ContentEditingWorkspaceProps {
  /** Replaces the default heading (e.g. the AI 创作中心 page header); receives the 工程精修 action. */
  renderHeader?: (projectAction: ReactNode) => ReactNode;
}

/**
 * Detail of one production Run, opened by `?editingRun=` (成片 → 任务详情, and old
 * task links). Creating tasks here was retired with the 单条剪辑 workbench; the
 * Runs API itself is unchanged.
 */
export function ContentEditingWorkspace({ renderHeader }: ContentEditingWorkspaceProps = {}) {
  const { modal } = App.useApp();
  const capabilities = useQuery({ queryKey: productionKeys.capabilities, queryFn: fetchProductionCapabilities });
  const enabled = capabilities.data?.enabled === true && capabilities.data.persistentPlansEnabled === true;
  const canWrite = capabilities.data?.canWrite === true;
  const state = useContentEditing(enabled);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<{ projectId?: string } | null>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (editing) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);
  const navigate = (action: () => void) => {
    const proceed = () => { setEditing(false); action(); };
    if (editing) modal.confirm({ title: '放弃尚未保存的方案修改？', okText: '放弃并继续', cancelText: '继续编辑', onOk: proceed });
    else proceed();
  };
  const projectAction = <Button onClick={() => navigate(() => setEditor({}))}>工程精修</Button>;
  if (editor) return <ContentProductionWorkbench initialProjectId={editor.projectId} onBack={() => setEditor(null)} />;
  if (capabilities.isPending) return <Spin aria-label="加载 AI 剪辑" />;
  if (capabilities.isError) return <Alert type="error" title="无法加载 AI 剪辑" description={capabilities.error.message} action={<Button onClick={() => void capabilities.refetch()}>重试</Button>} />;
  return <div className={styles.workspace}>
    {renderHeader ? renderHeader(projectAction) : <header className={styles.heading}><div><h1>AI 剪辑</h1><p className={styles.helper}>从已有素材到成片，方案与制作进度都在这里。</p></div>{projectAction}</header>}
    {!enabled ? <Alert type="info" title="剪辑任务尚未启用" description="启用后可查看任务进度。已有工程可从「工程精修」继续编辑。" /> : <>
      {!canWrite && <Alert type="info" title="当前账号仅可查看任务，修改需要内容编辑权限。" />}
      {state.failure && <Alert type="error" showIcon title="操作未完成" description={state.failure} />}
      {!state.selected ? <Alert type="info" title="没有指定剪辑任务" description="从「成片」的任务详情进入，或改用单条剪辑出片。" /> : <div className={styles.stack}>{state.detail.isError && <Alert type="error" title="任务未能更新" description={state.detail.error.message} action={<Button onClick={() => void state.detail.refetch()}>重试</Button>} />}{state.detail.data ? <ContentEditingDetail key={state.selected} state={state} canWrite={canWrite && !state.detail.isError} editing={editing} onEditing={setEditing} onProject={(projectId) => navigate(() => setEditor({ projectId }))} /> : state.detail.isPending && <Spin aria-label="加载剪辑任务" />}</div>}
    </>}
  </div>;
}
