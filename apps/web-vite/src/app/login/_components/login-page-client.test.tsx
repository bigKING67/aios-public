import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { LoginPageClient } from './login-page-client';

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  signIn: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<object>()),
  useNavigate: () => navigate,
}));

function renderLogin() {
  render(
    <LobeProvider>
      <MemoryRouter>
        <LoginPageClient />
      </MemoryRouter>
    </LobeProvider>,
  );
}

beforeEach(() => {
  auth.error = null;
  auth.signIn.mockReset();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoginPageClient', () => {
  it('keeps the brand, the named fields and the footnote', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: 'AGI AIOS' })).toBeInTheDocument();
    expect(screen.getByText('AI 驱动的业务生产力系统')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toHaveAttribute('placeholder', '输入用户名');
    expect(screen.getByLabelText('密码')).toHaveAttribute('placeholder', '输入密码');
    expect(screen.getByRole('button', { name: '登录' })).toHaveAttribute('type', 'submit');
    expect(screen.getByText('使用公司账号登录，权限按角色自动收敛。')).toBeInTheDocument();
  });

  it('validates with the original rules and messages before signing in', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('请输入用户名')).toBeInTheDocument();
    expect(screen.getByText('请输入密码')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByLabelText('用户名'), 'ab');
    expect(screen.getByText('用户名至少 3 个字符')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('signs in with the typed credentials and redirects', async () => {
    const user = userEvent.setup();
    auth.signIn.mockResolvedValue(undefined);
    renderLogin();
    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'secret-1');
    await user.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('alice', 'secret-1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('shows the sign-in failure in an alert', async () => {
    const user = userEvent.setup();
    auth.signIn.mockRejectedValue(new Error('用户名或密码错误'));
    renderLogin();
    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('登录失败')).toBeInTheDocument();
    expect((await screen.findAllByText('用户名或密码错误')).length).toBeGreaterThan(0);
    expect(navigate).not.toHaveBeenCalled();
  });
});
