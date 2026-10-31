import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobeProvider } from '@/components/lobe-provider';
import { LabeledSelect } from './labeled-select';

afterEach(cleanup);

const OPTIONS = [
  { value: 'portrait', label: '9:16 竖屏' },
  { value: 'landscape', label: '16:9 横屏' },
];

describe('LabeledSelect', () => {
  it('names the combobox and reports one value', async () => {
    const onChange = vi.fn();
    render(
      <LobeProvider>
        <LabeledSelect label="画幅" value="portrait" options={OPTIONS} onChange={onChange} />
      </LobeProvider>,
    );
    const combobox = screen.getByRole('combobox', { name: '画幅' });
    expect(screen.getByLabelText('画幅')).toBe(combobox);
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name: '16:9 横屏' }));
    expect(onChange).toHaveBeenCalledWith('landscape');
  });

  it('reports a list in multiple mode', async () => {
    const onChange = vi.fn();
    render(
      <LobeProvider>
        <LabeledSelect label="镜头" mode="multiple" value={['portrait']} options={OPTIONS} onChange={onChange} />
      </LobeProvider>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: '镜头' }));
    await userEvent.click(await screen.findByRole('option', { name: '16:9 横屏' }));
    expect(onChange).toHaveBeenCalledWith(['portrait', 'landscape']);
  });

  it('stays controlled when the value is undefined', async () => {
    const onChange = vi.fn();
    render(<LabeledSelect label="画幅" value={undefined} placeholder="选择画幅" options={OPTIONS} onChange={onChange} />, {
      wrapper: LobeProvider,
    });
    const combobox = screen.getByRole('combobox', { name: '画幅' });
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name: '16:9 横屏' }));
    expect(onChange).toHaveBeenCalledWith('landscape');
    // The parent did not take the value, so the trigger keeps showing nothing selected.
    expect(combobox).not.toHaveTextContent('16:9 横屏');
  });

  it('shows and reports an empty-string 「全部」 option', async () => {
    const onChange = vi.fn();
    render(
      <LobeProvider>
        <LabeledSelect
          label="来源"
          value=""
          options={[{ value: '', label: '全部来源' }, { value: 'ai', label: 'AI 切段' }]}
          onChange={onChange}
        />
      </LobeProvider>,
    );
    const combobox = screen.getByRole('combobox', { name: '来源' });
    expect(combobox).toHaveTextContent('全部来源');
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name: 'AI 切段' }));
    expect(onChange).toHaveBeenLastCalledWith('ai');
  });
});
