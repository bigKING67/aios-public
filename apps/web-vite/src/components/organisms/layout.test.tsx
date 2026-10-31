import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { useAuthStore } from '@/stores/auth.store';
import { Layout } from './layout';

beforeEach(() => useAuthStore.setState({ permissions: ['*'], isAuthenticated: true, user: { id: 'test', username: 'test', email: 'test@example.test', is_active: true, roles: ['admin'] } }));
afterEach(() => { cleanup(); useAuthStore.setState(useAuthStore.getInitialState(), true); });
const renderLayout = (path: string) => render(<LobeProvider><MemoryRouter initialEntries={[path]}><Layout><h1>页面正文</h1></Layout></MemoryRouter></LobeProvider>);

describe('module shell ownership', () => {
  it('renders only dashboard destinations in the dashboard sidebar', () => {
    renderLayout('/dashboard');
    const navigation = screen.getByRole('navigation', { name: '看板导航' });
    expect(within(navigation).getByRole('link', { name: '经营看板' })).toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: '文档首页' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'AI 创作中心' })).not.toBeInTheDocument();
  });

  it.each(['/docs', '/docs/guide/ai-studio', '/profile'])('leaves %s free of a second console sidebar', (path) => {
    renderLayout(path);
    expect(screen.getByRole('heading', { name: '页面正文' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收起侧栏' })).not.toBeInTheDocument();
  });
});
