import { useRef, useState } from 'react';
import { Alert, Button, Tag } from 'antd';
import type { CaptionCandidate, EditingRequest } from '../_lib/content-editing-api';
import styles from './content-editing.module.css';

export function ContentEditingCaptionCandidate({ candidate, aspect, disabled, onAdopt }: {
  candidate: CaptionCandidate; aspect: EditingRequest['aspect']; disabled: boolean;
  onAdopt?: (candidate: CaptionCandidate) => Promise<boolean>;
}) {
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const inFlight = useRef(false);
  const changes = candidate.captionChanges ?? [];
  async function adopt() {
    if (!onAdopt || disabled || inFlight.current || adopted) return;
    inFlight.current = true; setPending(true);
    try { if (await onAdopt(candidate)) setAdopted(true); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section className={styles.stack} aria-label="字幕修订候选">
    <div className={styles.heading}><h3>字幕修订候选</h3><Tag>待检查</Tag></div>
    <p className={styles.helper}>已生成新的字幕检查片。采用后保存为新工程版本，保留原工程与原成片。</p>
    <video className={`${styles.video} ${styles[aspect]}`} src={candidate.playbackUrl} controls preload="metadata" aria-label="字幕候选检查片" onError={() => setFailed(true)} onLoadedMetadata={() => setFailed(false)} />
    {failed && <Alert type="warning" title="候选视频未能播放" description="请点击“刷新成片”更新播放链接后重试。" />}
    <details className={styles.candidateChanges}>
      <summary>查看 {changes.length} 处字幕换行调整</summary>
      <div className={styles.planClips}>{changes.map((change) => <div key={change.captionId} className={styles.candidateChange}>
        <div><span className={styles.helper}>修订前</span><p className={styles.summary}>{change.before}</p></div>
        <div><span className={styles.helper}>修订后</span><p className={styles.summary}>{change.after}</p></div>
      </div>)}</div>
    </details>
    <Alert type="info" title="技术检查通过，内容仍待验收" description={`品牌与成分疑点 ${candidate.review.termIssueCount ?? 0} 项；复审待确认 ${candidate.review.rejectedIssueCount ?? 0} 项。采用不会自动发布，也不代表画面、声音或商品信息已核实。`} />
    <div className={styles.actions}><Button type="primary" disabled={disabled || !onAdopt || adopted} loading={pending} onClick={() => void adopt()}>{adopted ? '已采用' : '采用字幕修订'}</Button><span className={styles.helper}>保存后可从当前方案继续制作。</span></div>
  </section>;
}
