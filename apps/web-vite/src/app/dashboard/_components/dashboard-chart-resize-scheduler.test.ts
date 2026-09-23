import { describe, expect, it, vi } from 'vitest';
import { createDashboardChartResizeScheduler } from './dashboard-chart-resize-scheduler';

describe('dashboard chart resize scheduler', () => {
  it('coalesces event bursts into one frame and one trailing resize', () => {
    let frameCallback: FrameRequestCallback | undefined;
    let timerCallback: (() => void) | undefined;
    const resize = vi.fn();
    const clearTimer = vi.fn();
    const scheduler = createDashboardChartResizeScheduler(resize, {
      requestFrame: vi.fn((callback) => {
        frameCallback = callback;
        return 17;
      }),
      cancelFrame: vi.fn(),
      setTimer: vi.fn((callback) => {
        timerCallback = callback;
        return 23;
      }),
      clearTimer,
    });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    frameCallback?.(0);
    timerCallback?.();
    expect(resize).toHaveBeenCalledTimes(2);
    expect(clearTimer).toHaveBeenCalledTimes(2);
  });

  it('cancels pending frame and trailing timer during cleanup', () => {
    const cancelFrame = vi.fn();
    const clearTimer = vi.fn();
    const scheduler = createDashboardChartResizeScheduler(vi.fn(), {
      requestFrame: vi.fn(() => 31),
      cancelFrame,
      setTimer: vi.fn(() => 37),
      clearTimer,
    });

    scheduler.schedule();
    scheduler.cancel();
    scheduler.cancel();

    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(31);
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledWith(37);
  });
});
