import { describe, expect, it } from 'vitest';
import { cutPoints, formatRulerTime, formatSegmentDuration, formatSegmentTime, parseSegmentTime, rulerTicks } from './segment-time';

describe('segment time formatting', () => {
  it('formats source milliseconds as m:ss.s and h:mm:ss.s', () => {
    expect(formatSegmentTime(0)).toBe('0:00.0');
    expect(formatSegmentTime(12_540)).toBe('0:12.5');
    expect(formatSegmentTime(59_960)).toBe('1:00.0');
    expect(formatSegmentTime(138_000)).toBe('2:18.0');
    expect(formatSegmentTime(3_723_400)).toBe('1:02:03.4');
    expect(formatSegmentTime(null)).toBe('--');
    expect(formatSegmentTime(-1)).toBe('--');
  });

  it('formats durations in seconds', () => {
    expect(formatSegmentDuration(1_000, 3_450)).toBe('2.5 秒');
  });
});

describe('segment time parsing', () => {
  it.each([
    ['0:12.5', 12_500],
    ['2:18', 138_000],
    ['1:02:03.4', 3_723_400],
    ['12.345', 12_345],
    [' 75 ', 75_000],
    ['0：05.0', 5_000],
    ['1：02：03.4', 3_723_400],
  ])('parses %s', (text, expected) => {
    expect(parseSegmentTime(text)).toBe(expected);
  });

  it.each(['', 'abc', '1:60', '1:60:00', '-1', '1.2345', '1::2'])('rejects %s', (text) => {
    expect(parseSegmentTime(text)).toBeNull();
  });

  it('round-trips formatted values at tenth precision', () => {
    for (const ms of [0, 100, 12_500, 138_000, 3_723_400]) {
      expect(parseSegmentTime(formatSegmentTime(ms))).toBe(ms);
    }
  });
});

describe('segment timeline marks', () => {
  it('picks a whole-second ruler step with at most eight intervals', () => {
    expect(rulerTicks(160_200)).toEqual([0, 30_000, 60_000, 90_000, 120_000, 150_000]);
    expect(rulerTicks(14_000)).toEqual([0, 2_000, 4_000, 6_000, 8_000, 10_000, 12_000]);
    expect(rulerTicks(0)).toEqual([]);
    expect(formatRulerTime(90_000)).toBe('1:30');
    expect(formatRulerTime(3_725_000)).toBe('1:02:05');
  });

  it('labels distinct inner cut points and thins crowded neighbours', () => {
    const segments = [
      { startMs: 0, endMs: 13_200 },
      { startMs: 13_200, endMs: 107_000 },
      { startMs: 107_000, endMs: 110_000 },
      { startMs: 110_000, endMs: 160_200 },
    ];
    expect(cutPoints(segments, 160_200)).toEqual([
      { ms: 13_200, labelled: true, align: 'center' },
      { ms: 107_000, labelled: true, align: 'center' },
      { ms: 110_000, labelled: false, align: 'center' },
    ]);
    // Cuts hugging an edge keep their label, growing inward.
    expect(cutPoints([{ startMs: 2_000, endMs: 157_000 }], 160_200)).toEqual([
      { ms: 2_000, labelled: true, align: 'start' },
      { ms: 157_000, labelled: true, align: 'end' },
    ]);
  });
});
