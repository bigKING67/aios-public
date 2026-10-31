import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLayoutMenuItems } from '@/components/organisms/layout-navigation-model';
import { moduleDataStatus } from '@/lib/module-profile';
import { useAuthStore, type User } from '@/stores/auth.store';
import { buildHomeDirectory } from './home-directory';
import { HomePage } from './home-page';

const SUPER_ADMIN_FIXTURE: User = { id: 'u-1', username: 'fixture-super-admin', email: 'fixture-super-admin@example.test', is_active: true, roles: ['admin'] };
const TEST: User = { id: 'u-2', username: 'Test', email: 'test@example.test', is_active: true, roles: ['content_ops'] };

function signIn(user: User | null, permissions: string[] = []) {
  useAuthStore.setState({ user, permissions, isAuthenticated: !!user, hasSessionChecked: true });
}

function directory(user: User, permissions: string[], profile: 'full' | 'ai_studio') {
  const items = buildLayoutMenuItems({ pathname: '/', permissions, roles: user.roles ?? [], user, isAuthenticated: true });
  return buildHomeDirectory(items, (path) => moduleDataStatus(path, profile));
}

afterEach(() => { cleanup(); useAuthStore.setState(useAuthStore.getInitialState(), true); });

describe('AIOS home directory', () => {
  it('lists the super admin every business domain, connected ones first, without system settings', () => {
    const domains = directory(SUPER_ADMIN_FIXTURE, ['*'], 'ai_studio');
    expect(domains.map((domain) => domain.label)).toEqual(['内容中台', '看板', '报告', '营销', '更多', '文档']);
    const content = domains[0].modules.map((module) => [module.label, module.status]);
    expect(content).toEqual([['素材库', 'not_open'], ['AI 创作中心', 'open'], ['直播中台', 'not_connected']]);
    const all = domains.flatMap((domain) => domain.modules.map((module) => module.label));
    expect(all).not.toContain('用户管理');
    expect(all).not.toContain('行业素材灵感');
  });

  it('keeps the menu order and marks everything open in the full build', () => {
    const domains = directory(SUPER_ADMIN_FIXTURE, ['*'], 'full');
    expect(domains.map((domain) => domain.label)).toEqual(['看板', '报告', '内容中台', '营销', '更多', '文档']);
    expect(domains.every((domain) => domain.modules.every((module) => module.status === 'open'))).toBe(true);
  });

  it('shows an ordinary account only what it can open', () => {
    const domains = directory(TEST, ['marketing:content_assets:write'], 'ai_studio');
    const content = domains.find((domain) => domain.label === '内容中台');
    expect(content?.modules.map((module) => module.label)).toEqual(['AI 创作中心']);
  });
});

describe('AIOS home', () => {
  it('reads as the company home and links each module with its data status', () => {
    signIn(SUPER_ADMIN_FIXTURE, ['*']);
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('公司的每一项业务，在同一个 AIOS 里运转。');
    expect(screen.queryByRole('link', { name: /进入 AI 创作中心/ })).not.toBeInTheDocument();
    expect(screen.queryByText('创作流程示意')).not.toBeInTheDocument();
    const content = screen.getByRole('region', { name: '内容中台' });
    expect(within(content).getByRole('link', { name: /AI 创作中心/ })).toHaveAttribute('href', '/content/ai-studio');
    expect(screen.getByRole('region', { name: '即将接入' }).textContent).toContain('产品 · 人力 · 财务');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in instead of listing modules', () => {
    signIn(null);
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login?redirect=%2F');
    expect(screen.queryByRole('region', { name: '内容中台' })).not.toBeInTheDocument();
  });
});

vi.mock('@/lib/frontend-env', async (original) => {
  const actual = await original<typeof import('@/lib/frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, superAdminAccounts: 'fixture-super-admin' } };
});
