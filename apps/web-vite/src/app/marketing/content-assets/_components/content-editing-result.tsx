import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty } from 'antd';
import { editingKeys, fetchEditingResult, type EditingRun, type CaptionCandidate } from '../_lib/content-editing-api';
import { ContentEditingCaptionCandidate } from './content-editing-caption-candidate';
import { ContentEditingSelectedReview } from './content-editing-selected-review';
import { isEditingWatched } from '../_lib/content-editing-state';
import { ContentEditingAutomaticRepair } from './content-editing-automatic-repair';
import styles from './content-editing.module.css';

export function ContentEditingResult({ run, disabled = true, onAdopt }: { run: EditingRun; disabled?: boolean; onAdopt?: (candidate: CaptionCandidate) => Promise<boolean> }) {
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const result = useQuery({ queryKey: editingKeys.result(run.runId, run.version), queryFn: () => fetchEditingResult(run), enabled: !!run.renderJobId, staleTime: 0, refetchInterval: isEditingWatched(run) ? 5000 : false });
  return <section className={styles.panel} aria-label="成片结果">
    <div className={styles.heading}><h2>成片结果</h2>{run.renderJobId && <Button loading={result.isFetching} onClick={() => { setPlaybackFailed(false); void result.refetch(); }}>刷新成片</Button>}</div>
    {result.isError ? <Alert type="error" title="无法读取成片" description={result.error.message} /> : result.data?.ready && result.data.playbackUrl ? <>
      <video className={`${styles.video} ${styles[run.request.aspect]}`} src={result.data.playbackUrl} controls preload="metadata" aria-label="剪辑成片" onError={() => setPlaybackFailed(true)} />
      {playbackFailed && <Alert type="warning" title="视频未能播放" description="链接可能已过期，请刷新成片后重试。" />}
      <div className={styles.actions}><a href={result.data.playbackUrl} target="_blank" rel="noreferrer">打开视频 / 下载</a><span className={styles.helper}>{result.data.inspection?.width} × {result.data.inspection?.height} · {result.data.inspection?.fps} fps · {result.data.inspection?.durationSeconds.toFixed(1)} 秒</span></div>
      <p className={styles.helper}>文件与解码技术检查通过。画面、声音和内容质量尚未自动验收。</p>
    </> : result.data?.captionCandidate && !result.isError ? null : result.isFetching ? <p role="status">正在读取制作结果…</p> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={run.status === 'succeeded' ? '成片当前不可读取，请刷新检查。' : '完成制作与检查后，成片会显示在这里。'} />}
    {!result.isError && result.data && (run.request.maxAutoRepairs ?? 0) > 0 && <ContentEditingAutomaticRepair summary={result.data?.automaticRepair} run={run} />}
    {!result.isError && result.data?.selectedReview && <ContentEditingSelectedReview summary={result.data.selectedReview.summary} run={run} />}
    {!result.isError && result.data?.captionCandidate && <ContentEditingCaptionCandidate
      key={result.data.captionCandidate.documentSha256} candidate={result.data.captionCandidate}
      aspect={run.request.aspect} disabled={disabled || result.isFetching || result.data.captionCandidate.expectedVersion !== run.version}
      onAdopt={onAdopt} />}
    {result.data?.job?.errorMessage && <Alert type="error" title="制作未完成" description={result.data.job.errorMessage} />}
  </section>;
}
