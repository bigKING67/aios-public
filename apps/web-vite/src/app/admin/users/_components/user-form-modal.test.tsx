import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import type { User } from '../_lib/users-types';
import { UserFormModal } from './user-form-modal';
import { buildUsersTableColumns } from './users-table-columns';

const ALICE: User = {
  id: 7,
  username: 'alice',
  email: 'alice@example.com',
  full_name: 'Alice Chen',
  is_active: true,
  created_at: '2026-10-01T08:00:00Z',
};

function renderModal(user: User | null, onSubmit = vi.fn()) {
  render(
    <LobeProvider>
      <UserFormModal user={user} open isSaving={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    </LobeProvider>,
  );
  return onSubmit;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserFormModal', () => {
  it('validates a new user with the original rules and messages', async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal(null);
    const dialog = await screen.findByRole('dialog', { name: '新建用户' });
    expect(within(dialog).getByText('新建用户仅需账号和密码，邮箱将由系统自动生成内部占位值。')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(await within(dialog).findByText('请输入用户名')).toBeInTheDocument();
    expect(within(dialog).getByText('请输入密码')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('用户名'), 'ab');
    await user.type(within(dialog).getByLabelText('密码'), 'abcdefg');
    expect(within(dialog).getByText('用户名至少 3 个字符')).toBeInTheDocument();
    expect(within(dialog).getByText('密码至少 8 个字符')).toBeInTheDocument();
    expect(within(dialog).getByText('密码需包含字母和数字')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the account, password and full name of a new user', async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal(null);
    const dialog = await screen.findByRole('dialog', { name: '新建用户' });
    await user.type(within(dialog).getByLabelText('用户名'), 'bob');
    await user.type(within(dialog).getByLabelText('密码'), 'passw0rd');
    await user.type(within(dialog).getByLabelText('全名'), 'Bob');
    await user.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(onSubmit).toHaveBeenCalledWith({ username: 'bob', password: 'passw0rd', full_name: 'Bob' });
  });

  it('edits only the full name of an existing user', async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal(ALICE);
    const dialog = await screen.findByRole('dialog', { name: '编辑用户' });
    expect(within(dialog).queryByLabelText('用户名')).not.toBeInTheDocument();
    const fullName = within(dialog).getByLabelText('全名');
    expect(fullName).toHaveValue('Alice Chen');
    await user.clear(fullName);
    await user.type(fullName, 'Alice Wang');
    await user.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(onSubmit).toHaveBeenCalledWith({ full_name: 'Alice Wang' });
  });
});

describe('users table actions', () => {
  it('deletes a user only after the destructive confirmation', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    const columns = buildUsersTableColumns({ onDelete, onEdit, onOpenRoleModal: vi.fn() });
    const actions = columns[columns.length - 1];
    render(<LobeProvider>{actions.render?.(undefined, ALICE, 0) as React.ReactNode}</LobeProvider>);

    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(onEdit).toHaveBeenCalledWith(ALICE);

    await user.click(screen.getByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog', { name: '删除用户' });
    expect(within(dialog).getByText('确定要删除用户 alice 吗？')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith(ALICE);
  });
});
