import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioContentSegment } from '../_lib/ai-studio-api';
import { SegmentTable } from './segment-table';

function segment(segmentId: string, origin: string, evidence: unknown): StudioContentSegment {
  return {
    segmentId, status: 'suggested', startMs: 0, endMs: 5000, assetId: 'a', assetTitle: '整片', ownerUserId: 'u', sourceContentHash: 'a'.repeat(64),
    sourceCurrent: true, sourceDurationMs: 60_000, presetKey: 'framework', presetVersion: 1, labelKey: 'koc', productName: null, origin,
    evidence, revision: 1, confirmedBy: null, confirmedAt: null, createdAt: '', updatedAt: '', coverUrl: null,
  };
}

afterEach(cleanup);

describe('segment table AI evidence', () => {
  it('shows the model confidence and reason next to AI suggestions only', () => {
    render(
      <SegmentTable
        segments={[segment('s1', 'ai', { confidence: 0.82, reason: '素人口吻分享使用体验' }), segment('s2', 'human', { confidence: 0.5, reason: '不应显示' })]}
        presets={[]}
        canWrite={false}
        canPlay={false}
        busy={false}
        activeSegmentId={null}
        highlightedIds={new Set()}
        selectedIds={[]}
        onSelectionChange={() => undefined}
        onAction={() => undefined}
      />,
    );
    expect(screen.getByText('· 模型自评 0.82', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('素人口吻分享使用体验')).toBeInTheDocument();
    expect(screen.queryByText('不应显示')).not.toBeInTheDocument();
    expect(screen.getByText('人工')).toBeInTheDocument();
  });
});

describe('segment table withdraw', () => {
  it('asks before withdrawing a confirmed segment from the remix pool', async () => {
    const onAction = vi.fn();
    render(
      <SegmentTable
        segments={[{ ...segment('s1', 'human', null), status: 'confirmed', confirmedBy: 'u', confirmedAt: '' }]}
        presets={[]}
        canWrite
        canPlay={false}
        busy={false}
        activeSegmentId={null}
        highlightedIds={new Set()}
        selectedIds={[]}
        onSelectionChange={() => undefined}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '撤回确认' })[0]);
    expect(onAction).not.toHaveBeenCalled();
    expect(await screen.findByText('撤回这段的确认？')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: '撤回确认' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'status', status: 'suggested' }));
  });
});
