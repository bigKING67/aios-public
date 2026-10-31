import { formatRulerTime, formatSegmentTime, timelinePercent } from '../_lib/segment-time';
import type { TimelineHover } from './use-timeline-hover';
import styles from './segment-timeline.module.css';

/** The pointer label grows inward near either end so it stays readable. */
function hoverClass(ms: number, durationMs: number): string {
  const ratio = durationMs > 0 ? ms / durationMs : 0;
  if (ratio < 0.04) return `${styles.rulerHover} ${styles.rulerHoverStart}`;
  if (ratio > 0.96) return `${styles.rulerHover} ${styles.rulerHoverEnd}`;
  return styles.rulerHover;
}

/** The ruler lane: playhead time (when something plays), whole-second marks, the end time and the time under the pointer. */
export function TimelineRuler({
  durationMs,
  currentMs,
  ticks,
  hover,
  onSeek,
}: {
  durationMs: number;
  /** Absent for a timeline nothing plays on (the Douyin player cannot report its position). */
  currentMs?: number;
  ticks: readonly number[];
  hover: TimelineHover;
  /** Plays from a time picked on the ruler; absent when nothing can play. */
  onSeek?: (ms: number) => void;
}) {
  const { hoverMs, pointerMs, hoverProps } = hover;
  return (
    <div className={styles.timelineLane}>
      {currentMs === undefined ? (
        <span aria-hidden />
      ) : (
        <span className={styles.timelineNow} aria-label={`播放位置 ${formatSegmentTime(currentMs)}`}>
          {formatSegmentTime(currentMs)}
        </span>
      )}
      <div
        className={onSeek ? `${styles.timelineRuler} ${styles.timelineRulerSeekable}` : styles.timelineRuler}
        aria-hidden
        title={onSeek ? '点击从该时间播放' : undefined}
        onClick={(event) => {
          const ms = pointerMs(event);
          if (onSeek && ms !== null) onSeek(ms);
        }}
        {...hoverProps}
      >
        {ticks.map((ms) => (
          <span key={ms} className={styles.rulerTick} style={{ left: timelinePercent(ms, durationMs) }}>
            {formatRulerTime(ms)}
          </span>
        ))}
        {durationMs > 0 ? <span className={styles.rulerEnd}>{formatSegmentTime(durationMs)}</span> : null}
        {hoverMs !== null ? (
          <span className={hoverClass(hoverMs, durationMs)} style={{ left: timelinePercent(hoverMs, durationMs) }}>
            {formatSegmentTime(hoverMs)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
