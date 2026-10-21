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
  it('records two selling points on one complete span', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<SegmentCreateForm preset={{ ...preset, presetKey: 'selling_point', dimension: 'selling_point', labels: [
      { key: 'moisturizing', name: '滋润保湿', definition: '即时保湿' },
      { key: 'skincare', name: '养肤护肤', definition: '长期养肤' },
    ] }} assetProductName="小紫瓶" durationMs={60_000} busy={false} readCurrentMs={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('入点'), { target: { value: '0:01.0' } });
    fireEvent.change(screen.getByLabelText('出点'), { target: { value: '0:05.0' } });
    fireEvent.mouseDown(screen.getByLabelText('标签'));
    fireEvent.click(await screen.findByText('滋润保湿'));
    fireEvent.click(await screen.findByText('养肤护肤'));
    fireEvent.click(screen.getByRole('button', { name: '新建片段' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ startMs: 1000, endMs: 5000,
      labelKey: 'moisturizing', labelKeys: ['moisturizing', 'skincare'] });
  });
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

  it('changes secondary labels without changing or duplicating the physical span', () => {
    const multi = { ...segment, labelKey: 'moisturizing', labelKeys: ['moisturizing', 'skincare'] };
    const next = { startMs: 1000, endMs: 5000, labelKey: 'moisturizing', productName: '小紫瓶' };
    expect(buildSegmentPatch(multi, { ...next, labelKey: 'skincare', labelKeys: ['skincare', 'moisturizing'] })).toBeNull();
    expect(buildSegmentPatch(multi, { ...next, labelKey: 'skincare', labelKeys: ['skincare'] }))
      .toEqual({ expectedRevision: 4, labelKey: 'skincare', labelKeys: ['skincare'] });
    expect(buildSegmentPatch(multi, { ...next, labelKeys: ['moisturizing'] }))
      .toEqual({ expectedRevision: 4, labelKeys: ['moisturizing'] });
    expect(buildSegmentPatch(multi, { ...next, endMs: 6000, labelKeys: multi.labelKeys }))
      .toEqual({ expectedRevision: 4, endMs: 6000 });
  });
});
