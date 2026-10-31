import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { outputBlocks, shortAssetTitle } from '../_lib/remix-form';
import { labelName } from '../_lib/segment-display';
import { formatSegmentTime, timelinePercent, timelineTicks } from '../_lib/segment-time';
import { TimelineRuler } from './timeline-ruler';
import { labelToneClass } from './timeline-tones';
import { useTimelineHover } from './use-timeline-hover';
import styles from './segment-timeline.module.css';

interface RemixOutputTimelineProps {
  item: StudioRemixBatchItem;
  preset: StudioSegmentPreset | undefined;
  durationMs: number;
  currentMs: number;
  /** Plays from a time on the output; absent when the output cannot play. */
  onSeek?: (ms: number) => void;
}

/**
 * 成片时间轴: the output's segments in playback order on one lane, in the 片段标注 timeline
 * grammar (ruler, label tones, playhead). A block plays the output from its first frame.
 */
export function RemixOutputTimeline({ item, preset, durationMs, currentMs, onSeek }: RemixOutputTimelineProps) {
  const hover = useTimelineHover(durationMs);
  const ticks = timelineTicks(durationMs);
  const blocks = outputBlocks(item, durationMs);
  const playing = blocks.find((block) => currentMs >= block.startMs && currentMs < block.endMs);
  return (
    <div className={styles.timelineScroll}>
      <div className={styles.timeline} role="group" aria-label="成片时间轴">
        <TimelineRuler durationMs={durationMs} currentMs={currentMs} ticks={ticks} hover={hover} onSeek={onSeek} />
        <div className={styles.timelineLane}>
          <span className={styles.timelineLaneTitle}>成片</span>
          <div className={styles.timelineTrack} {...hover.hoverProps}>
            {hover.hoverMs !== null ? (
              <span className={styles.hoverLine} style={{ left: timelinePercent(hover.hoverMs, durationMs) }} aria-hidden />
            ) : null}
            {ticks.slice(1).map((ms) => (
              <span key={ms} className={styles.gridLine} style={{ left: timelinePercent(ms, durationMs) }} aria-hidden />
            ))}
            {durationMs > 0 ? (
              <span className={styles.playhead} style={{ left: timelinePercent(currentMs, durationMs) }} aria-hidden />
            ) : null}
            {blocks.map((block) => {
              const name = labelName(preset, block.labelKey);
              const range = `${formatSegmentTime(block.startMs)}–${formatSegmentTime(block.endMs)}`;
              const source = shortAssetTitle(block.assetTitle || '原片');
              const className = [
                styles.timelineBlock,
                labelToneClass(preset, block.labelKey),
                block === playing ? styles.timelineBlockActive : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={`${block.index}-${block.segmentId}`}
                  type="button"
                  className={className}
                  style={{ left: timelinePercent(block.startMs, durationMs), width: timelinePercent(block.endMs - block.startMs, durationMs) }}
                  aria-label={`第 ${block.index} 段 ${name}，成片 ${range}，来自 ${source}`}
                  title={`第 ${block.index} 段 · ${name} · ${range} · ${source}`}
                  disabled={!onSeek}
                  onClick={() => onSeek?.(block.startMs)}
                >
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
