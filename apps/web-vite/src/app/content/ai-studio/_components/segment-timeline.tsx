import { LinkIcon } from 'lucide-react';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { segmentLabelName, findPreset, segmentStatusView } from '../_lib/segment-display';
import { cutPoints, formatSegmentTime, timelinePercent, timelineTicks } from '../_lib/segment-time';
import { TimelineRuler } from './timeline-ruler';
import { labelToneClass } from './timeline-tones';
import { useTimelineHover } from './use-timeline-hover';
import styles from './segment-timeline.module.css';

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
  /**
   * Read-only reference lane above the editable ones, e.g. the confirmed
   * framework segments a selling-point segment must fall inside.
   */
  context?: { title: string; segments: readonly StudioContentSegment[] };
}

const CUT_ALIGN = { start: styles.cutPointStart, center: undefined, end: styles.cutPointEnd } as const;

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
  context,
}: SegmentTimelineProps) {
  const hover = useTimelineHover(durationMs);
  const { hoverMs, hoverProps } = hover;
  const lanes = [
    { key: 'confirmed', title: '已确认', items: segments.filter((segment) => segment.status === 'confirmed') },
    {
      key: 'pending',
      title: '待确认 / 过期',
      items: segments.filter((segment) => segment.status === 'suggested' || segment.status === 'stale'),
    },
  ];
  const ticks = timelineTicks(durationMs);
  const cuts = cutPoints(lanes[0].items, durationMs);

  return (
    <div className={styles.timelineScroll}>
      <div className={styles.timeline} role="group" aria-label="片段时间轴">
        <TimelineRuler durationMs={durationMs} currentMs={currentMs} ticks={ticks} hover={hover} onSeek={onSeek} />
        {context && context.segments.length > 0 ? (
          <div className={styles.timelineLane}>
            <span className={styles.timelineLaneTitle}>{context.title}</span>
            <div className={styles.timelineTrack} {...hoverProps}>
              {context.segments.map((segment) => {
                const name = segmentLabelName(findPreset(presets, segment.presetKey, segment.presetVersion), segment);
                const range = `${formatSegmentTime(segment.startMs)}–${formatSegmentTime(segment.endMs)}`;
                return (
                  <span
                    key={segment.segmentId}
                    className={`${styles.timelineBlock} ${styles.timelineContextBlock}`}
                    style={{ left: timelinePercent(segment.startMs, durationMs), width: timelinePercent(segment.endMs - segment.startMs, durationMs) }}
                    title={`${context.title} · ${name} · ${range}`}
                  >
                    <span>{name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
        {lanes.map((lane) => (
          <div className={styles.timelineLane} key={lane.key}>
            <span className={styles.timelineLaneTitle}>{lane.title}</span>
            <div className={styles.timelineTrack} {...hoverProps}>
              {hoverMs !== null ? (
                <span className={styles.hoverLine} style={{ left: timelinePercent(hoverMs, durationMs) }} aria-hidden />
              ) : null}
              {ticks.slice(1).map((ms) => (
                <span key={ms} className={styles.gridLine} style={{ left: timelinePercent(ms, durationMs) }} aria-hidden />
              ))}
              {durationMs > 0 ? (
                <span className={styles.playhead} style={{ left: timelinePercent(currentMs, durationMs) }} aria-hidden />
              ) : null}
              {lane.items.map((segment) => {
                const preset = findPreset(presets, segment.presetKey, segment.presetVersion);
                const name = segmentLabelName(preset, segment);
                const status = segmentStatusView(segment.status).label;
                const joined = segment.continuesPrevious ? '，连着上一段' : '';
                const className = [
                  styles.timelineBlock,
                  labelToneClass(preset, segment.labelKey),
                  segment.status !== 'confirmed' ? styles.timelineBlockPending : '',
                  segment.status === 'stale' ? styles.timelineBlockStale : '',
                  segment.segmentId === activeSegmentId ? styles.timelineBlockActive : '',
                  segment.continuesPrevious ? styles.timelineBlockJoined : '',
                  highlightedIds.has(segment.segmentId) ? styles.timelineBlockConflict : '',
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={segment.segmentId}
                    type="button"
                    className={className}
                    style={{
                      left: timelinePercent(segment.startMs, durationMs),
                      width: timelinePercent(segment.endMs - segment.startMs, durationMs),
                    }}
                    aria-label={`${name} ${formatSegmentTime(segment.startMs)} 至 ${formatSegmentTime(segment.endMs)}，${status}${joined}`}
                    title={`${name} · ${formatSegmentTime(segment.startMs)}–${formatSegmentTime(segment.endMs)} · ${status}${joined}`}
                    onClick={() => onSelect(segment)}
                  >
                    <span>
                      {segment.continuesPrevious ? <LinkIcon size={14} strokeWidth={1.8} aria-hidden /> : null}
                      {name}
                    </span>
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
                  style={{ left: timelinePercent(cut.ms, durationMs) }}
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
