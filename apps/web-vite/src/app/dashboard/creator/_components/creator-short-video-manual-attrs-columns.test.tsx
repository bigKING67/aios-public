import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import { buildCreatorShortVideoManualAttrColumns } from './creator-short-video-manual-attrs-columns';
import { ManualTagSelect } from './creator-short-video-manual-attrs-select';
import { CREATOR_TYPE_LABEL_RENDER, CREATOR_TYPE_OPTION_RENDER } from './creator-short-video-manual-attrs-tag-render';

afterEach(cleanup);

const ROW = {
  id: 1,
  author_douyin_id: 'dy-1',
  video_id: 'v-1',
  manual_attr_id: 9,
  manual_can_edit: true,
  manual_can_delete: true,
} as unknown as CreatorShortVideoDetailRow;

function buildColumns(overrides: Partial<Parameters<typeof buildCreatorShortVideoManualAttrColumns>[0]> = {}) {
  return buildCreatorShortVideoManualAttrColumns({
    editingRowKey: null,
    savingRowKey: null,
    deletingRowKey: null,
    draft: null,
    creatorTypeOptions: [],
    mcnOptions: [],
    setCreatorTypeSearchValue: vi.fn(),
    setMcnSearchValue: vi.fn(),
    updateDraft: vi.fn(),
    handleCreatorTypeChange: vi.fn(),
    handleMcnChange: vi.fn(),
    commitCreatorTypeSearchValue: vi.fn(),
    commitMcnSearchValue: vi.fn(),
    saveDraft: vi.fn(async () => undefined),
    deleteManualAttrs: vi.fn(async () => undefined),
    startEdit: vi.fn(),
    cancelEdit: vi.fn(),
    ...overrides,
  });
}

function renderActionsCell(columns: ReturnType<typeof buildColumns>, row: CreatorShortVideoDetailRow = ROW) {
  const column = columns.find((item) => item.key === 'manual_attrs_actions');
  if (!column || !('render' in column) || !column.render) throw new Error('missing actions column');
  return render(<>{column.render(undefined, row, 0) as ReactNode}</>);
}

describe('creator short-video manual attribute columns', () => {
  it('asks for confirmation before deleting the manual fields', async () => {
    const deleteManualAttrs = vi.fn(async () => undefined);
    renderActionsCell(buildColumns({ deleteManualAttrs }));

    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog', { name: '删除人工字段' });
    expect(dialog).toHaveTextContent('仅删除粉丝量、达人类型、MCN、费用等人工维护字段。');
    expect(deleteManualAttrs).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(deleteManualAttrs).toHaveBeenCalledWith(ROW));
  });

  it('keeps delete disabled without permission', () => {
    renderActionsCell(buildColumns(), { ...ROW, manual_can_delete: false });
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();
  });
});

describe('ManualTagSelect', () => {
  it('reports the typed text and commits it on Enter', async () => {
    const onSearch = vi.fn();
    const onCommitSearch = vi.fn();
    render(
      <ManualTagSelect
        label="达人类型"
        placeholder="选已有标签，或直接输入新标签"
        options={[{ label: '彩妆', value: '彩妆' }]}
        value={null}
        optionRender={CREATOR_TYPE_OPTION_RENDER}
        labelRender={CREATOR_TYPE_LABEL_RENDER}
        onSearch={onSearch}
        onChange={vi.fn()}
        onCommitSearch={onCommitSearch}
      />
    );

    await userEvent.click(screen.getByRole('combobox', { name: '达人类型' }));
    const search = await screen.findByPlaceholderText('选已有标签，或直接输入新标签');
    await userEvent.type(search, '母婴');
    expect(onSearch).toHaveBeenLastCalledWith('母婴');

    await userEvent.keyboard('{Enter}');
    expect(onCommitSearch).toHaveBeenCalledWith('enter');
  });

  it('reports a picked option', async () => {
    const onChange = vi.fn();
    render(
      <ManualTagSelect
        label="达人类型"
        placeholder="选已有标签，或直接输入新标签"
        options={[{ label: '彩妆', value: '彩妆' }]}
        value={null}
        optionRender={CREATOR_TYPE_OPTION_RENDER}
        labelRender={CREATOR_TYPE_LABEL_RENDER}
        onSearch={vi.fn()}
        onChange={onChange}
        onCommitSearch={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('combobox', { name: '达人类型' }));
    await userEvent.click(await screen.findByRole('option', { name: '彩妆' }));
    expect(onChange).toHaveBeenCalledWith('彩妆');
  });
});
