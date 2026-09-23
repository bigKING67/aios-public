import { useState } from 'react';
import { Alert, App, Button, Checkbox, Input, InputNumber, Tag } from 'antd';
import { createProductionPlan, type ProductionClip, type ProductionDraft, type ProductionPlan } from '../_lib/content-production-api';
import styles from './content-production.module.css';

export function ContentProductionPlanner({ enabled, disabled, draft, onApply }: { enabled: boolean; disabled: boolean; draft: ProductionDraft; onApply: (clips: ProductionClip[]) => void }) {
  const { modal } = App.useApp();
  const [brief, setBrief] = useState('');
  const [searchText, setSearchText] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(30);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ signature: string; plan: ProductionPlan } | null>(null);
  const assetIds = [...new Set(draft.clips.map((clip) => clip.assetId))].sort();
  const signature = JSON.stringify([brief, searchText, targetSeconds, assetIds]);
  const plan = result?.signature === signature ? result.plan : null;
  const locked = disabled || busy || !enabled;
  const generate = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const next = await createProductionPlan({ brief, searchText, targetSeconds, assetIds, modelCallConfirmed: confirmed, rightsConfirmed: draft.rightsConfirmed });
      setResult({ signature, plan: next });
    } catch (e) { setError(e instanceof Error ? e.message : '分镜规划失败，请重试'); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!plan) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'storyboard-plan.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className={styles.panel} aria-label="分镜初稿">
    <div className={styles.heading}><h2>分镜初稿</h2><Tag>基于原片台词</Tag></div>
    <p className={styles.helper}>先从下方检索添加素材，再描述创作目标。规划仅在时间线涉及的素材内检索，不会自动混入其他品牌。画面内容尚需人工核对。</p>
    {!enabled && <Alert type="info" title="分镜规划尚未启用" description="启用后可调用配置的模型，根据素材台词生成分镜和待补镜头。" />}
    <label>创作目标<Input.TextArea aria-label="创作目标" placeholder="例如：面向早八通勤人群，突出便捷使用体验；先共鸣再展示，不增加未经证实的功效。" maxLength={2000} autoSize={{ minRows: 2, maxRows: 5 }} value={brief} disabled={locked} onChange={(e) => setBrief(e.target.value)} /></label>
    <div className={styles.fields}>
      <label>检索台词或素材名称<Input aria-label="分镜检索词" maxLength={100} value={searchText} disabled={locked} onChange={(e) => setSearchText(e.target.value)} placeholder="输入素材名称可检索该素材的台词" /></label>
      <label>目标时长（秒，上限）<InputNumber aria-label="分镜目标时长" min={3} max={120} precision={0} value={targetSeconds} disabled={locked} onChange={(value) => setTargetSeconds(value ?? 30)} /></label>
    </div>
    <p className={styles.helper}>已限定 {assetIds.length} 条素材（支持 1–10 条）。请在下方确认本次素材使用范围。</p>
    <Checkbox checked={confirmed} disabled={locked} onChange={(e) => setConfirmed(e.target.checked)}>同意将创作目标和所选素材的匹配台词发送给已配置的模型；调用可能产生费用。</Checkbox>
    <div className={styles.actions}><Button type="primary" loading={busy} disabled={locked || !confirmed || !draft.rightsConfirmed || !brief.trim() || !searchText.trim() || !assetIds.length || assetIds.length > 10} onClick={() => void generate()}>生成分镜初稿</Button></div>
    {error && <Alert type="error" showIcon title="未能生成分镜" description={error} />}
    {plan && <>
      <p className={styles.helper}>已有片段共 {(plan.sourceDurationMs / 1000).toFixed(1)} 秒 / 目标上限 {plan.targetSeconds} 秒 · {plan.provider} / {plan.model}。方案暂存本页，可下载留存；工程保存的是采用后的时间线。</p>
      {plan.shots.map((shot, i) => <article className={styles.hit} key={shot.clip.id}>
        <strong>{i + 1}. {shot.sourceTitle} · {(shot.clip.startMs / 1000).toFixed(1)}–{(shot.clip.endMs / 1000).toFixed(1)} 秒</strong>
        <p>原片台词：{shot.evidence}</p><p>选择理由：{shot.reason}</p>
      </article>)}
      {plan.gaps.length > 0 && <Alert type="warning" showIcon title="方案仍有待补镜头，尚未生成视频" description={<ul>{plan.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>} />}
      <div className={styles.actions}>
        <Button type="primary" disabled={locked || !plan.shots.length} onClick={() => modal.confirm({ title: '用分镜中的已有片段替换当前时间线？', content: '未保存的切点和顺序将被替换。待补镜头不会加入时间线，请下载方案保留生成需求；采用后请重新确认素材用途并保存。', okText: '采用已有片段', cancelText: '保留当前时间线', onOk: () => onApply(plan.shots.map((shot) => shot.clip)) })}>采用已有片段</Button>
        <Button onClick={download}>下载分镜方案</Button>
      </div>
    </>}
  </section>;
}
