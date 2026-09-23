import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Select, Spin, Tag } from 'antd';
import { searchProductionClips, searchProductionVisualClips, type ProductionSearchHit } from '../_lib/content-production-api';
import styles from './content-production.module.css';

export function ContentProductionSearch({ disabled, onAdd }: { disabled: boolean; onAdd: (hit: ProductionSearchHit) => void }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'transcript' | 'visual'>('transcript');
  const [playing, setPlaying] = useState<ProductionSearchHit | null>(null);
  const results = useQuery<ProductionSearchHit[]>({ queryKey: ['content-production', 'search', mode, query], queryFn: ({ signal }) => mode === 'visual' ? searchProductionVisualClips(query, signal) : searchProductionClips(query, signal), enabled: Boolean(query) });
  return <section className={styles.panel} aria-label="检索素材片段">
    <h2>找片段</h2>
    <Select aria-label="片段检索方式" value={mode} onChange={(value) => { setMode(value); setPlaying(null); }} options={[{ value: 'transcript', label: '按台词 / 名称' }, { value: 'visual', label: '按画面描述' }]} />
    <p className={styles.helper}>{mode === 'visual' ? '搜索原片分析中的画面和段落作用。仅覆盖可直接对应当前原片的关键段落，模型描述与切点需播放核对；尚非逐镜头索引。' : '按台词或素材名称搜索，返回原片中的具体时间段。'}</p>
    <Input.Search aria-label="搜索台词或素材名称" placeholder={mode === 'visual' ? '例如：产品特写、泡沫、长发' : '例如：蓬松、洗发水'} maxLength={100} onSearch={(value) => { const next = value.trim(); if (next && next === query) void results.refetch(); else setQuery(next); }} enterButton="搜索" allowClear />
    {results.isFetching && <Spin aria-label="正在检索" />}
    {results.isError && <Alert type="error" title="检索失败" description={results.error.message} showIcon />}
    {!query && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入关键词开始选片" />}
    {query && results.isSuccess && !results.data.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={mode === 'visual' ? '没有匹配的原片分析段落。预览视频分析、缺少来源或切点无效的结果不会返回。' : '没有匹配的片段，请换个关键词。仅搜索已完成原片转写的素材。'} />}
    {playing && <video className={styles.video} key={`${playing.assetId}-${playing.startMs}`} controls autoPlay src={`${playing.playbackUrl}#t=${playing.startMs / 1000},${playing.endMs / 1000}`} aria-label="原片片段预览" />}
    <div className={styles.results}>{results.data?.map((hit) => <article className={styles.hit} key={`${'transcriptId' in hit ? hit.transcriptId : hit.analysisResultId}-${hit.startMs}-${hit.endMs}`}>
      <strong>{hit.title}</strong>
      <small>{(hit.startMs / 1000).toFixed(1)}–{(hit.endMs / 1000).toFixed(1)} 秒</small>
      {'analysisResultId' in hit && <><Tag>模型画面描述 · 待核对</Tag><small>分析来源：{hit.analysisResultId} · {hit.model}</small></>}
      <p>{hit.text}</p>
      {'purpose' in hit && hit.purpose && <p>段落作用：{hit.purpose}</p>}
      <div className={styles.actions}>
        <Button size="small" onClick={() => setPlaying(hit)}>播放片段</Button>
        <Button size="small" disabled={disabled || !hit.canUse} onClick={() => onAdd(hit)}>{hit.canUse ? '加入时间线' : '无复剪权限'}</Button>
      </div>
    </article>)}</div>
  </section>;
}
