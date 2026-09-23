import { describe, expect, it, vi } from 'vitest';
import {
  createAnimationFrameCoalescer,
  resolveActiveSectionId,
} from './docs-active-section';

describe('docs active-section scheduling', () => {
  it('coalesces repeated events into one animation frame', () => {
    let scheduled: FrameRequestCallback | undefined;
    const callback = vi.fn();
    const requestFrame = vi.fn((next: FrameRequestCallback) => {
      scheduled = next;
      return 17;
    });
    const coalescer = createAnimationFrameCoalescer(callback, {
      requestFrame,
      cancelFrame: vi.fn(),
    });

    coalescer.schedule();
    coalescer.schedule();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    scheduled?.(0);
    expect(callback).toHaveBeenCalledTimes(1);
    coalescer.schedule();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('cancels pending work during cleanup', () => {
    const cancelFrame = vi.fn();
    const coalescer = createAnimationFrameCoalescer(vi.fn(), {
      requestFrame: vi.fn(() => 23),
      cancelFrame,
    });

    coalescer.schedule();
    coalescer.cancel();
    coalescer.cancel();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(23);
  });

  it('reads every section at most once per geometry scan', () => {
    const positions = new Map([
      ['overview', -20],
      ['details', 120],
      ['actions', 400],
    ]);
    const readOffsetTop = vi.fn((id: string) => positions.get(id) ?? null);

    expect(resolveActiveSectionId([...positions.keys()], 136, readOffsetTop)).toBe('details');
    expect(readOffsetTop).toHaveBeenCalledTimes(positions.size);
  });
});
