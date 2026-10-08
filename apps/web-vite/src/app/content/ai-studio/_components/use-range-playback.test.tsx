import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRangePlayback } from './use-range-playback';

function fakeVideo() {
  return { currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() } as unknown as HTMLVideoElement;
}

describe('range playback', () => {
  it('pauses at the out-point once', () => {
    const video = fakeVideo();
    const { result } = renderHook(() => useRangePlayback({ current: video }));
    act(() => result.current.playRange(2_000, 4_000));
    expect(video.currentTime).toBe(2);
    video.currentTime = 4.05;
    act(() => result.current.onTimeUpdate());
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(result.current.currentMs).toBe(4_050);
    act(() => result.current.onTimeUpdate());
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it.each([1.0, 5.0])('cancels the range when the user seeks to %ss', (seconds) => {
    const video = fakeVideo();
    const { result } = renderHook(() => useRangePlayback({ current: video }));
    act(() => result.current.playRange(2_000, 4_000));
    video.currentTime = seconds;
    act(() => result.current.onSeeking());
    video.currentTime = 4.2;
    act(() => result.current.onTimeUpdate());
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('tolerates a keyframe seek landing just before the in-point', () => {
    const video = fakeVideo();
    const { result } = renderHook(() => useRangePlayback({ current: video }));
    act(() => result.current.playRange(2_000, 4_000));
    video.currentTime = 1.9;
    act(() => result.current.onSeeking());
    video.currentTime = 4.0;
    act(() => result.current.onTimeUpdate());
    expect(video.pause).toHaveBeenCalledTimes(1);
  });
});
