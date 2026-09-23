import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Empty, Select, Spin, Tag, Upload } from 'antd';
import { fetchProductionCatalog, fetchProductionCatalogs, importProductionCatalog, type ProductionClip } from '../_lib/content-production-api';
import { ContentProductionSemantics } from './content-production-semantics';
import { ContentProductionExtraction } from './content-production-extraction';
import styles from './content-production.module.css';

const listKey = ['content-production', 'shot-catalogs'];
export function ContentProductionCatalogs({ disabled, extractionEnabled, semanticsEnabled, assetIds, onAdd }: { disabled: boolean; extractionEnabled: boolean; semanticsEnabled: boolean; assetIds: string[]; onAdd: (clip: ProductionClip) => void }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const catalogs = useQuery({ queryKey: listKey, queryFn: fetchProductionCatalogs });
  const detail = useQuery({ queryKey: [...listKey, selected], queryFn: () => fetchProductionCatalog(selected!), enabled: Boolean(selected) });
  return <section className={styles.panel} aria-label="镜头目录">
    <div className={styles.heading}><h2>镜头目录</h2><Tag>剪切候选 · 未做语义分析</Tag></div>
    <ContentProductionExtraction enabled={extractionEnabled} disabled={disabled} assetIds={assetIds} onOpen={(id) => { setSelected(id); setPlaying(null); void cache.invalidateQueries({ queryKey: listKey }); }} />
    <p className={styles.helper}>导入原片提取的 catalog.json，逐段播放后选入时间线。这里只保存目录与原片的关联，不上传本地代表帧；人物、产品、动作尚未分析。</p>
    <Checkbox checked={confirmed} disabled={disabled || busy} onChange={(e) => setConfirmed(e.target.checked)}>我已确认目录对应的原片可用于本次剪辑。</Checkbox>
    <div className={styles.actions}>
      <Upload accept=".json,application/json" showUploadList={false} disabled={disabled || busy || !confirmed} beforeUpload={async (file) => {
        setBusy(true); setError('');
        try {
          if (file.size > 240 * 1024) throw new Error('目录文件不能超过 240 KiB');
          const result = await importProductionCatalog(JSON.parse(await file.text()), confirmed);
          await cache.invalidateQueries({ queryKey: listKey });
          setSelected(result.catalogId); setPlaying(null); setConfirmed(false);
        } catch (e) { setError(e instanceof Error ? e.message : '导入失败，请检查目录文件'); }
        finally { setBusy(false); }
        return false;
      }}><Button loading={busy} disabled={disabled || busy || !confirmed}>导入镜头目录</Button></Upload>
      <Select aria-label="选择镜头目录" className={styles.projectSelect} placeholder="选择已导入的目录" value={selected ?? undefined} loading={catalogs.isFetching} disabled={busy} onChange={(id) => { setSelected(id); setPlaying(null); }} options={catalogs.data?.map((c) => ({ value: c.catalogId, label: `${c.title} · ${c.shotCount} 段` }))} />
      <Button disabled={busy || catalogs.isFetching || detail.isFetching} onClick={() => { void catalogs.refetch(); if (selected) void detail.refetch(); }}>刷新目录</Button>
    </div>
    {(error || catalogs.isError || detail.isError) && <Alert showIcon type="error" title="镜头目录暂不可用" description={error || catalogs.error?.message || detail.error?.message} />}
    {!catalogs.isPending && !catalogs.isError && !catalogs.data?.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有导入镜头目录" />}
    {selected && detail.isFetching && <Spin aria-label="正在读取镜头目录" />}
    {detail.data && !detail.isError && <>
      {semanticsEnabled && <ContentProductionSemantics key={detail.data.catalogId} catalogId={detail.data.catalogId} clips={detail.data.clips} disabled={disabled || detail.isFetching} onAdd={onAdd} />}
      <p className={styles.helper}>共 {detail.data.clips.length} 个候选。边界来自场景变化检测，可能漏切或多切；加入后可在时间线调整。点击刷新可更新播放链接。</p>
      {playing && <video key={`${detail.data.playbackUrl}-${playing}`} className={styles.video} controls autoPlay src={`${detail.data.playbackUrl}#t=${playing}`} aria-label="镜头候选播放" />}
      <div className={`${styles.results} ${styles.catalogResults}`}>{detail.data.clips.map((clip, i) => <article key={clip.id} className={styles.hit}>
        <strong>候选 {i + 1} · {(clip.startMs / 1000).toFixed(3)}–{(clip.endMs / 1000).toFixed(3)} 秒</strong>
        <div className={styles.actions}>
          <Button size="small" onClick={() => setPlaying(`${clip.startMs / 1000},${clip.endMs / 1000}`)}>播放候选 {i + 1}</Button>
          <Button size="small" disabled={disabled || busy || detail.isFetching} onClick={() => onAdd({ ...clip, id: crypto.randomUUID() })}>加入时间线</Button>
        </div>
      </article>)}</div>
    </>}
  </section>;
}
