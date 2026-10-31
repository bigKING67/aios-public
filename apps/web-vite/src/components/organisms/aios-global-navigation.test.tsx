import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { useAuthStore } from '@/stores/auth.store';
import { AiosGlobalFrame } from './aios-global-frame';

function Location() { return <output aria-label="当前位置">{useLocation().pathname}</output>; }
function renderFrame(path = '/content/ai-studio/trends') {
  render(<LobeProvider><MemoryRouter initialEntries={[path]}><AiosGlobalFrame><Location /></AiosGlobalFrame></MemoryRouter></LobeProvider>);
}

beforeEach(() => useAuthStore.setState({
  user: { id: 'test', username: 'test', email: 'test@example.test', is_active: true, roles: ['admin'] },
  permissions: ['*'], isAuthenticated: true,
}));
afterEach(() => { cleanup(); useAuthStore.setState(useAuthStore.getInitialState(), true); });

describe('AIOS product navigation', () => {
  it('opens the dashboard in the same workspace and marks its group active', async () => {
    const user = userEvent.setup(); renderFrame();
    const nav = await screen.findByRole('navigation', { name: 'AIOS 全局导航' });
    await user.click(within(nav).getByRole('button', { name: '看板' }));
    await user.click(await screen.findByRole('menuitem', { name: '经营看板' }));
    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/dashboard');
    expect(within(nav).getByRole('button', { name: '看板' })).toHaveAttribute('data-active', 'true');
  });

  it('labels the product groups without chevrons; only 更多 keeps one', async () => {
    renderFrame();
    const nav = await screen.findByRole('navigation', { name: 'AIOS 全局导航' });
    const tabs = within(nav).getAllByRole('button');
    expect(tabs.filter((tab) => tab.querySelector('svg')).map((tab) => tab.textContent)).toEqual(['更多']);
  });

  it('opens a group on hover, with an icon on every destination', async () => {
    const user = userEvent.setup(); renderFrame();
    const nav = await screen.findByRole('navigation', { name: 'AIOS 全局导航' });
    await user.hover(within(nav).getByRole('button', { name: '报告' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['周报', '月报', '专题报告']);
    expect(items.every((item) => item.querySelector('svg'))).toBe(true);
  });

  it('keeps administration hidden from an ordinary account', async () => {
    useAuthStore.setState({ user: { id: 'test', username: 'test', email: 'test@example.test', is_active: true, roles: [] }, permissions: [] });
    const user = userEvent.setup(); renderFrame();
    const nav = await screen.findByRole('navigation', { name: 'AIOS 全局导航' });
    await user.click(within(nav).getByRole('button', { name: '更多' }));
    expect(screen.queryByRole('menuitem', { name: '系统管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '用户管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '角色管理' })).not.toBeInTheDocument();
  });

  it('does not put console navigation on the login screen', () => {
    renderFrame('/login');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByLabelText('当前位置')).toHaveTextContent('/login');
  });
});
