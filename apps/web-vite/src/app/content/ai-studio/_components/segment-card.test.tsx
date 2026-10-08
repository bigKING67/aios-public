import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioContentSegment } from '../_lib/ai-studio-api';
import { SegmentCard } from './segment-card';

const SEGMENT = {
  segmentId: 's-1', assetId: 'a-1', assetTitle: '整片-001', status: 'confirmed', origin: 'ai', startMs: 0, endMs: 9000,
  labelKey: 'voice', productName: '样片', presetKey: 'framework', presetVersion: 1, sourceContentHash: 'a'.repeat(64),
  sourceCurrent: true, sourceDurationMs: 60000, ownerUserId: 'u', evidence: {}, revision: 1, confirmedBy: 'u',
  confirmedAt: '', createdAt: '', updatedAt: '', coverUrl: null,
} as StudioContentSegment;

function Location() {
  return <span aria-label="当前地址">{useLocation().search}</span>;
}

function renderCard(selectable: boolean, onSelectedChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Location />} />
        </Routes>
        <SegmentCard segment={SEGMENT} presets={[]} coverUrl={null} selected={false} selectable={selectable} canWrite busy={false}
          productOptions={[]} onSelectedChange={onSelectedChange} onSetProduct={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onSelectedChange;
}

afterEach(() => cleanup());

describe('segment card batch mode', () => {
  it('shows no checkbox outside batch mode and opens the segment on click', () => {
    const onSelected = renderCard(false);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /打开片段标注/ }));
    expect(screen.getByLabelText('当前地址')).toHaveTextContent('segmentId=s-1');
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('shows the checkbox in batch mode and a click toggles selection instead of opening', () => {
    const onSelected = renderCard(true);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^选择：/ }));
    expect(onSelected).toHaveBeenCalledWith('s-1', true);
    expect(screen.getByLabelText('当前地址')).toBeEmptyDOMElement();
  });
});
