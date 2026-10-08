/**
 * Segment times are integer source milliseconds. The UI shows and accepts
 * `m:ss.s` (tenths); `h:mm:ss.s` and plain seconds are also accepted on input.
 */

export function formatSegmentTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--';
  const tenths = Math.round(ms / 100);
  const totalSeconds = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsText = `${String(seconds).padStart(2, '0')}.${fraction}`;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}`
    : `${minutes}:${secondsText}`;
}

export function formatSegmentDuration(startMs: number, endMs: number): string {
  const seconds = Math.max(0, endMs - startMs) / 1000;
  return `${seconds.toFixed(1)} 秒`;
}

const TIME_PATTERN = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d{1,3})?)$/;

/** Returns milliseconds, or null when the text is not a valid non-negative time. */
export function parseSegmentTime(text: string): number | null {
  const value = text.trim().replace(/：/g, ':');
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const [, first, second, secondsText] = match;
  const seconds = Number(secondsText);
  let hours = 0;
  let minutes = 0;
  if (first !== undefined && second !== undefined) {
    hours = Number(first);
    minutes = Number(second);
  } else if (first !== undefined) {
    minutes = Number(first);
  }
  const hasColon = first !== undefined;
  if (hasColon && seconds >= 60) return null;
  if (second !== undefined && minutes >= 60) return null;
  const ms = Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
  return Number.isSafeInteger(ms) && ms <= 2_147_483_647 ? ms : null;
}

/** Ruler steps in seconds; the smallest one giving at most `maxTicks` intervals wins. */
const RULER_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];

/** Whole-second ruler marks from 0 up to the duration (the end itself is labelled separately). */
export function rulerTicks(durationMs: number, maxTicks = 8): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  const stepS = RULER_STEPS_S.find((step) => durationMs / (step * 1000) <= maxTicks) ?? RULER_STEPS_S[RULER_STEPS_S.length - 1];
  const ticks: number[] = [];
  for (let ms = 0; ms < durationMs; ms += stepS * 1000) ticks.push(ms);
  return ticks;
}

/** `m:ss` (or `h:mm:ss`) for whole-second ruler marks. */
export function formatRulerTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export interface CutPoint {
  ms: number;
  /** False when too close to a labelled neighbour; the mark keeps its tooltip. */
  labelled: boolean;
  /** Labels near an edge grow inward so they stay inside the track. */
  align: 'start' | 'center' | 'end';
}

/**
 * Distinct segment boundaries inside the source (0 and the end are left to the
 * ruler). Labels are thinned left to right so neighbours keep `minGapRatio` of
 * the track between them; labels near an edge grow inward.
 */
export function cutPoints(
  intervals: readonly { startMs: number; endMs: number }[],
  durationMs: number,
  minGapRatio = 0.07,
): CutPoint[] {
  if (durationMs <= 0) return [];
  const edges = [...new Set(intervals.flatMap((item) => [item.startMs, item.endMs]))]
    .filter((ms) => ms > 0 && ms < durationMs)
    .sort((a, b) => a - b);
  const minGap = durationMs * minGapRatio;
  let last = -Infinity;
  return edges.map((ms) => {
    const labelled = ms - last >= minGap;
    if (labelled) last = ms;
    const align = ms < minGap / 2 ? 'start' : durationMs - ms < minGap / 2 ? 'end' : 'center';
    return { ms, labelled, align };
  });
}
