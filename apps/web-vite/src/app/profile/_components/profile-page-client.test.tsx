import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import { ProfilePageClient } from './profile-page-client';

const auth = vi.hoisted(() => ({
  user: { username: 'alice', full_name: 'Alice Chen', email: 'alice@example.com', roles: ['admin'] },
  permissions: ['user:list:all'],
}));

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('@/components/organisms/layout', () => ({ Layout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/protected-route', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));

function renderProfile() {
  render(
    <LobeProvider>
      <ProfilePageClient />
    </LobeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfilePageClient', () => {
  it('lists the account, its roles and its permissions', () => {
    renderProfile();
    expect(screen.getByRole('heading', { name: '个人信息' })).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.getByText('权限列表 (1)')).toBeInTheDocument();
    expect(screen.getByText('user:list:all')).toBeInTheDocument();
  });

  it('validates the new password with the original rules', async () => {
    const user = userEvent.setup();
    renderProfile();
    await user.click(screen.getByRole('button', { name: '更新密码' }));
    expect(await screen.findByText('请输入当前密码')).toBeInTheDocument();
    expect(screen.getByText('请输入新密码')).toBeInTheDocument();
    expect(screen.getByText('请再次输入新密码')).toBeInTheDocument();

    await user.type(screen.getByLabelText('新密码'), 'abcdefg');
    expect(screen.getByText('新密码长度至少为 8 位')).toBeInTheDocument();
    expect(screen.getByText('新密码至少包含 1 个字母和 1 个数字')).toBeInTheDocument();

    await user.type(screen.getByLabelText('确认新密码'), 'abcdefg1');
    expect(screen.getByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('changes the password and clears the form', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    renderProfile();
    await user.type(screen.getByLabelText('当前密码'), 'old-pass1');
    await user.type(screen.getByLabelText('新密码'), 'new-pass1');
    await user.type(screen.getByLabelText('确认新密码'), 'new-pass1');
    await user.click(screen.getByRole('button', { name: '更新密码' }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(AIOS_API_PATHS.changePassword, {
        current_password: 'old-pass1',
        new_password: 'new-pass1',
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('当前密码')).toHaveValue(''));
  });
});
