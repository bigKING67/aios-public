import { Alert, Button } from 'antd';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';

export function RemixPictureReview({ item, onPlay }: {
  item: StudioRemixBatchItem;
  onPlay: (startMs: number) => void;
}) {
  if (item.outcome !== 'succeeded') return null;
  const review = item.pictureReview;
  if (review?.status === 'review_required' && review.pairs.length > 0) {
    return <Alert type="warning" showIcon title={`发现 ${review.pairCount} 组相近画面，建议复核`} description={
      <>
        <p>不同原片可能用了相近画面。请结合口播判断是否保留。</p>
        <details>
          <summary>查看成片中的相近位置</summary>
          {review.pairs.map((pair, index) => <p key={index} className={styles.rowActions}>
            <Button size="small" disabled={!item.outputAssetId} onClick={() => onPlay(pair.leftMs)}>
              第 {pair.leftClip} 段 · {formatSegmentTime(pair.leftMs)}
            </Button>
            <span>与</span>
            <Button size="small" disabled={!item.outputAssetId} onClick={() => onPlay(pair.rightMs)}>
              第 {pair.rightClip} 段 · {formatSegmentTime(pair.rightMs)}
            </Button>
          </p>)}
          {review.pairCount > review.pairs.length ? <p>仅展示前 {review.pairs.length} 组，请检查完整成片。</p> : null}
        </details>
      </>
    } />;
  }
  if (review?.status === 'no_findings') return <p className={styles.fieldHelp}>画面抽检未发现跨原片相近片段，仍需结合口播复核。</p>;
  if (review?.status === 'not_applicable') return <p className={styles.fieldHelp}>成片仅用一条原片，未进行跨原片画面检查。</p>;
  return <p className={styles.fieldHelp}>{review ? '画面检查未完成，请人工复核成片。' : '该成片尚未进行跨原片画面检查。'}</p>;
}
