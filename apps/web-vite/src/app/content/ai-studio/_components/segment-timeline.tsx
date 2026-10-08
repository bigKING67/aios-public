import { type MouseEvent, useState } from 'react';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { findPreset, labelName, type LabelToneSeries, labelToneSeries, segmentStatusView } from '../_lib/segment-display';
import { cutPoints, formatRulerTime, formatSegmentTime, rulerTicks } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';

interface SegmentTimelineProps {
  segments: readonly StudioContentSegment[];
  presets: readonly StudioSegmentPreset[];
  durationMs: number;
  currentMs: number;
  activeSegmentId: string | null;
  highlightedIds: ReadonlySet<string>;
  onSelect: (segment: StudioContentSegment) => void;
  /** Plays from a time picked on the ruler; absent when the source cannot play. */
  onSeek?: (ms: number) => void;
}

const TONE_CLASSES: Record<LabelToneSeries, string | undefined> = {
  1: styles.tone1,
  2: styles.tone2,
  4: styles.tone4,
  5: styles.tone5,
  6: styles.tone6,
  muted: styles.toneMuted,
};

const CUT_ALIGN = { start: styles.cutPointStart, center: undefined, end: styles.cutPointEnd } as const;

/** The pointer label grows inward near either end so it stays readable. */
function hoverClass(ms: number, durationMs: number): string {
  const ratio = durationMs > 0 ? ms / durationMs : 0;
  if (ratio < 0.04) return `${styles.rulerHover} ${styles.rulerHoverStart}`;
  if (ratio > 0.96) return `${styles.rulerHover} ${styles.rulerHoverEnd}`;
  return styles.rulerHover;
}

function percent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.min(100, Math.max(0, (value / total) * 100)).toFixed(3)}%`;
}

/**
 * Two lanes: confirmed intervals never overlap, while suggestions may overlap
 * them and each other. Rejected rows stay in the list only. A whole-second
 * ruler (with grid lines through the lanes) and the confirmed cut points give
 * each boundary a readable time; the ruler row shows the playhead time.
 */
export function SegmentTimeline({
  segments,
  presets,
  durationMs,
  currentMs,
  activeSegmentId,
  highlightedIds,
  onSelect,
  onSeek,
}: SegmentTimelineProps) {
  // Time under the pointer, shown on the ruler with a guide line through the lanes.
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const pointerMs = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || durationMs <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * durationMs);
  };
  const hoverProps = {
    onMouseMove: (event: MouseEvent<HTMLElement>) => setHoverMs(pointerMs(event)),
    onMouseLeave: () => setHoverMs(null),
  };
  const lanes = [
    { key: 'confirmed', title: '已确认', items: segments.filter((segment) => segment.status === 'confirmed') },
    {
      key: 'pending',
      title: '待确认 / 过期',
      items: segments.filter((segment) => segment.status === 'suggested' || segment.status === 'stale'),
    },
  ];
  const ticks = rulerTicks(durationMs);
  // The end label sits at the right edge; drop a ruler mark that would collide with it.
  if (ticks.length > 1 && durationMs - ticks[ticks.length - 1] < durationMs * 0.08) ticks.pop();
  const cuts = cutPoints(lanes[0].items, durationMs);

  return (
    <div className={styles.timelineScroll}>
      <div className={styles.timeline} role="group" aria-label="片段时间轴">
        <div className={styles.timelineLane}>
          <span className={styles.timelineNow} aria-label={`播放位置 ${formatSegmentTime(currentMs)}`}>
            {formatSegmentTime(currentMs)}
          </span>
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
              <span key={ms} className={styles.rulerTick} style={{ left: percent(ms, durationMs) }}>
                {formatRulerTime(ms)}
              </span>
            ))}
            {durationMs > 0 ? <span className={styles.rulerEnd}>{formatSegmentTime(durationMs)}</span> : null}
            {hoverMs !== null ? (
              <span className={hoverClass(hoverMs, durationMs)} style={{ left: percent(hoverMs, durationMs) }}>
                {formatSegmentTime(hoverMs)}
              </span>
            ) : null}
          </div>
        </div>
        {lanes.map((lane) => (
          <div className={styles.timelineLane} key={lane.key}>
            <span className={styles.timelineLaneTitle}>{lane.title}</span>
            <div className={styles.timelineTrack} {...hoverProps}>
              {hoverMs !== null ? (
                <span className={styles.hoverLine} style={{ left: percent(hoverMs, durationMs) }} aria-hidden />
              ) : null}
              {ticks.slice(1).map((ms) => (
                <span key={ms} className={styles.gridLine} style={{ left: percent(ms, durationMs) }} aria-hidden />
              ))}
              {durationMs > 0 ? (
                <span className={styles.playhead} style={{ left: percent(currentMs, durationMs) }} aria-hidden />
              ) : null}
              {lane.items.map((segment) => {
                const preset = findPreset(presets, segment.presetKey, segment.presetVersion);
                const name = labelName(preset, segment.labelKey);
                const status = segmentStatusView(segment.status).label;
                const className = [
                  styles.timelineBlock,
                  TONE_CLASSES[labelToneSeries(preset, segment.labelKey)],
                  segment.status !== 'confirmed' ? styles.timelineBlockPending : '',
                  segment.status === 'stale' ? styles.timelineBlockStale : '',
                  segment.segmentId === activeSegmentId ? styles.timelineBlockActive : '',
                  highlightedIds.has(segment.segmentId) ? styles.timelineBlockConflict : '',
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={segment.segmentId}
                    type="button"
                    className={className}
                    style={{
                      left: percent(segment.startMs, durationMs),
                      width: percent(segment.endMs - segment.startMs, durationMs),
                    }}
                    aria-label={`${name} ${formatSegmentTime(segment.startMs)} 至 ${formatSegmentTime(segment.endMs)}，${status}`}
                    title={`${name} · ${formatSegmentTime(segment.startMs)}–${formatSegmentTime(segment.endMs)} · ${status}`}
                    onClick={() => onSelect(segment)}
                  >
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {cuts.length > 0 ? (
          <div className={styles.timelineLane}>
            <span className={styles.timelineLaneTitle}>切点</span>
            <ol className={styles.cutRow} aria-label="已确认片段切点">
              {cuts.map((cut) => (
                <li
                  key={cut.ms}
                  className={[styles.cutPoint, CUT_ALIGN[cut.align], cut.labelled ? '' : styles.cutPointQuiet].filter(Boolean).join(' ')}
                  style={{ left: percent(cut.ms, durationMs) }}
                  title={formatSegmentTime(cut.ms)}
                >
                  <span>{formatSegmentTime(cut.ms)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
