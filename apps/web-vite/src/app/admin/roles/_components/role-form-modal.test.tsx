import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { RoleFormModal } from './role-form-modal';
import type { Role } from './roles-types';

function renderModal(role: Role | null, canManageElevatedRoles = true) {
  const onSubmit = vi.fn();
  render(
    <LobeProvider>
      <RoleFormModal
        role={role}
        open
        canManageElevatedRoles={canManageElevatedRoles}
        isSaving={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    </LobeProvider>,
  );
  return onSubmit;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoleFormModal', () => {
  it('requires a name and a code, and explains reserved roles', async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal(null, false);
    const dialog = await screen.findByRole('dialog', { name: '新建角色' });
    expect(within(dialog).getByText('当前账号仅可维护 admin 之下角色；admin 与 super_admin 为保留角色。')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('角色编码')).toHaveAccessibleDescription(
      '建议使用小写英文与下划线，例如 dashboard_view、viewer、operator、tmall、douyin、xhs、jd、wx。',
    );

    await user.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(await within(dialog).findByText('请输入角色名称')).toBeInTheDocument();
    expect(within(dialog).getByText('请输入角色编码')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a new role as active by default', async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal(null);
    const dialog = await screen.findByRole('dialog', { name: '新建角色' });
    await user.type(within(dialog).getByLabelText('角色名称'), '运营管理员');
    await user.type(within(dialog).getByLabelText('角色编码'), 'ops_admin');
    await user.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: '运营管理员', code: 'ops_admin', description: '', is_active: true });
  });

  it('starts from the edited role and submits its toggled state', async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal({ id: 3, name: '查看者', code: 'viewer', is_active: true });
    const dialog = await screen.findByRole('dialog', { name: '编辑角色' });
    expect(within(dialog).getByLabelText('角色名称')).toHaveValue('查看者');
    const toggle = within(dialog).getByRole('switch', { name: '启用状态' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: '查看者', code: 'viewer', description: undefined, is_active: false });
  });
});
