import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { SegmentCreateForm } from './segment-create-form';
import { buildSegmentPatch } from '../_lib/segment-form';

const preset: StudioSegmentPreset = {
  presetKey: 'framework',
  version: 1,
  dimension: 'framework',
  name: '框架',
  status: 'active',
  labels: [{ key: 'street', name: '街采', definition: '路人采访，问答形式' }],
};

afterEach(cleanup);

function renderForm(onSubmit = vi.fn().mockResolvedValue(true), readCurrentMs: (() => number) | null = () => 12_345) {
  render(
    <SegmentCreateForm preset={preset} assetProductName="小紫瓶" durationMs={60_000} busy={false} readCurrentMs={readCurrentMs} onSubmit={onSubmit} />,
  );
  return onSubmit;
}

describe('segment create form', () => {
  it('blocks invalid drafts with inline errors', async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('入点'), { target: { value: '0:05.0' } });
    fireEvent.change(screen.getByLabelText('出点'), { target: { value: '0:04.0' } });
    fireEvent.click(screen.getByRole('button', { name: '新建片段' }));
    expect(await screen.findByText('出点必须晚于入点')).toBeInTheDocument();
    expect(screen.getByText('请选择标签')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reads the player time, inherits the asset product and continues from the out-point', async () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getAllByRole('button', { name: /取当前时间/ })[0]);
    expect(screen.getByLabelText('入点')).toHaveValue('0:12.3');
    fireEvent.change(screen.getByLabelText('出点'), { target: { value: '0:20.0' } });
    fireEvent.mouseDown(screen.getByLabelText('标签'));
    fireEvent.click(await screen.findByText('街采'));
    expect(screen.getByText('路人采访，问答形式')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /存为草稿/ }));
    fireEvent.click(screen.getByRole('button', { name: '新建片段' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ startMs: 12_300, endMs: 20_000, labelKey: 'street', productName: undefined, draft: true }));
    await waitFor(() => expect(screen.getByLabelText('入点')).toHaveValue('0:20.0'));
    expect(screen.getByLabelText('出点')).toHaveValue('');
  });

  it('disables player time capture without a playable source', () => {
    renderForm(vi.fn(), null);
    for (const button of screen.getAllByRole('button', { name: /取当前时间/ })) expect(button).toBeDisabled();
  });
});

describe('segment edit patch', () => {
  const segment = {
    segmentId: 's1', revision: 4, startMs: 1_000, endMs: 5_000, labelKey: 'street', productName: '小紫瓶',
  } as StudioContentSegment;

  it('sends only changed fields with the expected revision', () => {
    expect(buildSegmentPatch(segment, { startMs: 1_000, endMs: 6_000, labelKey: 'street', productName: '小紫瓶' }))
      .toEqual({ expectedRevision: 4, endMs: 6_000 });
    expect(buildSegmentPatch(segment, { startMs: 1_000, endMs: 5_000, labelKey: 'street', productName: '  ' }))
      .toEqual({ expectedRevision: 4, productName: '' });
    expect(buildSegmentPatch(segment, { startMs: 1_000, endMs: 5_000, labelKey: 'street', productName: '小紫瓶' })).toBeNull();
  });
});
