import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobeProvider } from '@/components/lobe-provider';
import type { ContentAssetSceneCascaderOption } from '../_lib/content-assets-ui-helpers';
import { ContentAssetsScenePathSelect } from './content-assets-scene-path-select';

afterEach(cleanup);

const OPTIONS: ContentAssetSceneCascaderOption[] = [
  {
    label: '原点场景',
    value: '原点场景',
    children: [
      { label: '通勤', value: '通勤', children: [{ label: '早八', value: '早八' }] },
      { label: '居家', value: '居家' },
    ],
  },
  { label: '功效场景', value: '功效场景' },
];

function renderSelect(value: string[]) {
  const onChange = vi.fn();
  render(<ContentAssetsScenePathSelect label="内容场景路径" options={OPTIONS} value={value} onChange={onChange} />, {
    wrapper: LobeProvider,
  });
  return onChange;
}

describe('scene path select (replaces the Cascader)', () => {
  it('offers only the first level until it is chosen', async () => {
    const onChange = renderSelect([]);
    expect(screen.getByRole('group', { name: '内容场景路径' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '大场景' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: '场景类型' }));
    await userEvent.click(await screen.findByRole('option', { name: '原点场景' }));
    expect(onChange).toHaveBeenCalledWith(['原点场景']);
  });

  it('lists the children of the chosen level and may stop at any level', async () => {
    const onChange = renderSelect(['原点场景']);
    await userEvent.click(screen.getByRole('combobox', { name: '大场景' }));
    expect(await screen.findByRole('option', { name: '居家' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '功效场景' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: '通勤' }));
    expect(onChange).toHaveBeenCalledWith(['原点场景', '通勤']);
  });

  it('choosing a higher level clears the levels below it', async () => {
    const onChange = renderSelect(['原点场景', '通勤', '早八']);
    expect(screen.getByRole('combobox', { name: '细分场景' })).toHaveTextContent('早八');
    await userEvent.click(screen.getByRole('combobox', { name: '场景类型' }));
    await userEvent.click(await screen.findByRole('option', { name: '功效场景' }));
    expect(onChange).toHaveBeenCalledWith(['功效场景']);
  });
});
