import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioContentSegment } from '../_lib/ai-studio-api';
import { SegmentTimeline } from './segment-timeline';

const PRESET = {
  presetKey: 'framework', version: 1, status: 'active', dimension: 'framework', name: '框架 v1',
  labels: [{ key: 'voice', name: '混剪口播', definition: '' }],
};

function segment(startMs: number, endMs: number): StudioContentSegment {
  return {
    segmentId: `s-${startMs}`, ownerUserId: 'u', assetId: 'a', assetTitle: '原片', sourceContentHash: 'h', sourceCurrent: true,
    sourceDurationMs: 100_000, startMs, endMs, presetKey: 'framework', presetVersion: 1, labelKey: 'voice',
    productName: null, origin: 'human', status: 'confirmed', evidence: null, revision: 1, confirmedBy: 'u', confirmedAt: null,
    createdAt: '', updatedAt: '', coverUrl: null,
  };
}

function renderTimeline(onSeek?: (ms: number) => void) {
  render(
    <SegmentTimeline
      segments={[segment(0, 40_000), segment(40_000, 100_000)]}
      presets={[PRESET]}
      durationMs={100_000}
      currentMs={12_300}
      activeSegmentId={null}
      highlightedIds={new Set()}
      onSelect={() => undefined}
      onSeek={onSeek}
    />,
  );
}

/** jsdom has no layout: give every element a 1000 px wide box starting at x = 100. */
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 100, right: 1100, width: 1000, top: 0, bottom: 20, height: 20, x: 100, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('segment timeline', () => {
  it('shows the ruler, the playhead time and the confirmed cut points', () => {
    renderTimeline();
    expect(screen.getByLabelText('播放位置 0:12.3')).toBeInTheDocument();
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('1:40.0')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '已确认片段切点' })).toHaveTextContent('0:40.0');
  });

  it('shows the time under the pointer and seeks from a ruler click', () => {
    stubLayout();
    const onSeek = vi.fn();
    renderTimeline(onSeek);
    const ruler = screen.getByTitle('点击从该时间播放');
    fireEvent.mouseMove(ruler, { clientX: 350 });
    expect(screen.getByText('0:25.0')).toBeInTheDocument();
    fireEvent.click(ruler, { clientX: 600 });
    expect(onSeek).toHaveBeenCalledWith(50_000);
    fireEvent.mouseLeave(ruler);
    expect(screen.queryByText('0:25.0')).not.toBeInTheDocument();
  });

  it('does not offer seeking when the source cannot play', () => {
    renderTimeline();
    expect(screen.queryByTitle('点击从该时间播放')).not.toBeInTheDocument();
  });
});
