import { useState } from 'react';
import { Alert, Button, Input, Tag } from 'antd';
import type { EditingDetail, EditingPlan, EditingRun } from '../_lib/content-editing-api';
import styles from './content-editing.module.css';
import { ContentProductionTimeline } from './content-production-timeline';

interface Props {
  detail: EditingDetail; editable: boolean; busy: boolean; onEditing: (value: boolean) => void;
  /** Combination fixed at creation (框架混剪 / 单条剪辑): no edit entry at all. */
  frozen?: boolean;
  onSave: (run: EditingRun, document: EditingPlan, unlock: string[]) => Promise<boolean>;
}
const UUID = /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Internal ids read as their first 8 characters; the full text stays in the title. */
function shortenIds(text: string): string {
  return text.replace(UUID, '$1');
}

export function ContentEditingPlan({ detail, editable, frozen = false, busy, onEditing, onSave }: Props) {
  const [draft, setDraft] = useState<{ run: EditingRun; document: EditingPlan; originalLocks: string[] } | null>(null);
  const picture = detail.run.request.taskType === 'picture_remix';
  const plan = detail.plan;
  if (!plan) return <section className={styles.panel}><h2>剪辑方案</h2><p className={styles.helper}>生成后展示片段、理由及缺口。</p></section>;
  const doc = draft?.document ?? plan.document;
  const conflict = !!draft && draft.run.version !== detail.run.version;
  const change = (next: EditingPlan) => setDraft((old) => old ? { ...old, document: next } : old);
  const stop = () => { setDraft(null); onEditing(false); };
  return <section className={styles.panel} aria-label="剪辑方案">
    <div className={styles.heading}><h2>剪辑方案 <Tag>版本 {plan.revision}</Tag></h2>{!draft && !frozen && <Button disabled={!editable || busy} onClick={() => { setDraft({ run: detail.run, document: structuredClone(plan.document), originalLocks: [...plan.document.lockedClipIds] }); onEditing(true); }}>修改方案</Button>}</div>
    {picture && <Alert type="info" title={`保留主讲原片开头 ${detail.run.request.targetSeconds} 秒原声`} description="画面静音、总时长固定，暂不添加字幕。" />}
    {conflict && <Alert type="warning" title="任务已有更新，本地修改已保留" description="请放弃本地修改、重读方案后调整，避免覆盖新版本。" />}
    {draft ? <label htmlFor="plan-summary">表达重点<Input.TextArea id="plan-summary" value={doc.summary} maxLength={2000} disabled={busy || conflict} onChange={(e) => change({ ...doc, summary: e.target.value })} /></label> : <p className={styles.summary}>{doc.summary}</p>}
    {draft ? <ContentProductionTimeline pictureOnly={picture} draft={{ title: detail.run.request.title, aspect: detail.run.request.aspect, clips: doc.clips, rightsConfirmed: true }} disabled={busy || conflict} locks={doc.lockedClipIds}
      onToggleLock={(id, locked) => change({ ...doc, lockedClipIds: locked ? [...doc.lockedClipIds, id] : doc.lockedClipIds.filter((value) => value !== id) })}
      onChange={(next) => change({ ...doc, clips: next.clips, reasons: next.clips.map((clip) => doc.reasons[doc.clips.findIndex((old) => old.id === clip.id)]) })} />
      : <div className={styles.planClips}>{doc.clips.map((clip, index) => <article key={clip.id} className={styles.clip}>
        <div className={styles.heading}><strong>片段 {index + 1} · {(clip.startMs / 1000).toFixed(1)}–{(clip.endMs / 1000).toFixed(1)} 秒</strong>{doc.lockedClipIds.includes(clip.id) && <Tag>已锁定</Tag>}</div>
        <p className={styles.helper} title={doc.reasons[index]}>{shortenIds(doc.reasons[index] ?? '')}</p>
        <small className={styles.source} title={clip.assetId}>原片 {detail.run.request.assetIds.indexOf(clip.assetId) + 1} · {clip.assetId.slice(0, 8)}</small>
        <p className={styles.helper}>{clip.volume > 0 ? '保留原声' : '原声静音'}{clip.caption ? ` · 字幕：${clip.caption}` : ' · 无新增字幕'}</p>
      </article>)}</div>}
    {draft ? <label htmlFor="plan-gaps">待补内容（每行一项，解决后移除）<Input.TextArea id="plan-gaps" value={doc.gaps.join('\n')} disabled={busy || conflict} onChange={(e) => change({ ...doc, gaps: e.target.value.split('\n') })} /></label> : !!doc.gaps.length && <Alert type="warning" title="需要处理的素材缺口" description={<ul>{doc.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>} />}
    {draft && <div className={styles.actions}><Button type="primary" loading={busy} disabled={conflict || !editable} onClick={() => void (async () => { const next = { ...doc, gaps: doc.gaps.map((g) => g.trim()).filter(Boolean) }; if (await onSave(draft.run, next, draft.originalLocks.filter((id) => !next.lockedClipIds.includes(id)))) stop(); })()}>保存方案</Button><Button disabled={busy} onClick={stop}>放弃本地修改</Button><span className={styles.helper}>保存后开始制作；锁定项须先解锁。</span></div>}
  </section>;
}
