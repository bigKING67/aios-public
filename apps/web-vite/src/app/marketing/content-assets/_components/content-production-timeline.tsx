import { Button, Input, InputNumber, Select, Switch } from 'antd';
import type { ProductionDraft } from '../_lib/content-production-api';
import { moveProductionClip } from '../_lib/content-production-edit';
import styles from './content-production.module.css';

export function ContentProductionTimeline({ draft, disabled, onChange }: { draft: ProductionDraft; disabled: boolean; onChange: (draft: ProductionDraft) => void }) {
  const update = (index: number, field: 'startMs' | 'endMs' | 'caption' | 'volume', value: number | string) => onChange({ ...draft, clips: draft.clips.map((clip, i) => i === index ? { ...clip, [field]: value } : clip) });
  return <section className={styles.panel} aria-label="视频时间线">
    <div className={styles.heading}><h2>时间线</h2><span>{draft.clips.length} 段 · {(draft.clips.reduce((sum, clip) => sum + clip.endMs - clip.startMs, 0) / 1000).toFixed(1)} 秒</span></div>
    <div className={styles.fields}>
      <label>工程名称<Input value={draft.title} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label>
      <label>画幅<Select value={draft.aspect} disabled={disabled} onChange={(aspect) => onChange({ ...draft, aspect })} options={[{ value: 'portrait', label: '9:16 竖屏' }, { value: 'landscape', label: '16:9 横屏' }, { value: 'square', label: '1:1 方形' }]} /></label>
    </div>
    {!draft.clips.length && <p className={styles.helper}>从左侧搜索结果加入片段，按顺序组成新视频。</p>}
    {draft.clips.map((clip, index) => <article className={styles.clip} key={clip.id}>
      <div className={styles.heading}><strong>片段 {index + 1}</strong><div className={styles.actions}>
        <Button size="small" disabled={disabled || index === 0} onClick={() => onChange({ ...draft, clips: moveProductionClip(draft.clips, index, index - 1) })} aria-label={`片段 ${index + 1} 上移`}>上移</Button>
        <Button size="small" disabled={disabled || index === draft.clips.length - 1} onClick={() => onChange({ ...draft, clips: moveProductionClip(draft.clips, index, index + 1) })} aria-label={`片段 ${index + 1} 下移`}>下移</Button>
        <Button size="small" disabled={disabled} danger onClick={() => onChange({ ...draft, clips: draft.clips.filter((item) => item.id !== clip.id) })}>移除</Button>
      </div></div>
      <small className={styles.assetId}>来源：{clip.assetId}</small>
      <div className={styles.fields}>
        <label>入点（秒）<InputNumber aria-label={`片段 ${index + 1} 入点`} min={0} max={1799.9} step={0.1} precision={3} value={clip.startMs / 1000} disabled={disabled} onChange={(value) => value !== null && update(index, 'startMs', Math.round(value * 1000))} /></label>
        <label>出点（秒）<InputNumber aria-label={`片段 ${index + 1} 出点`} min={0.1} max={1800} step={0.1} precision={3} value={clip.endMs / 1000} disabled={disabled} onChange={(value) => value !== null && update(index, 'endMs', Math.round(value * 1000))} /></label>
        <label>原声<Switch aria-label={`片段 ${index + 1} 原声`} checked={clip.volume > 0} disabled={disabled} onChange={(checked) => update(index, 'volume', checked ? 1 : 0)} /></label>
      </div>
      <label>新增字幕（原片字幕将保留）<Input.TextArea aria-label={`片段 ${index + 1} 字幕`} rows={2} maxLength={1000} value={clip.caption} disabled={disabled} onChange={(event) => update(index, 'caption', event.target.value)} /></label>
    </article>)}
  </section>;
}
