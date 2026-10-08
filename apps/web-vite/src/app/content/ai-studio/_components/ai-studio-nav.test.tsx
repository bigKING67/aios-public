import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { AiStudioCompactNav, AiStudioRailNav } from './ai-studio-nav';

function renderRail(pathname: string) {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <AiStudioRailNav />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'AI 创作中心导航' });
}

afterEach(cleanup);

describe('AI studio navigation', () => {
  it('lists the phase-one entries in their groups without trends or generation', () => {
    const nav = renderRail(ROUTE_PATHS.contentAiStudio);
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent);

    expect(labels).toEqual(['首页', '原片', '片段素材', '成片', 'AI 分析', 'AI 剪辑']);
    expect(within(nav).getByText('核心工作台')).toBeInTheDocument();
    expect(within(nav).getByText('处理链路')).toBeInTheDocument();
    expect(within(nav).queryByText('行业热点')).not.toBeInTheDocument();
    expect(within(nav).queryByText('AI 生成')).not.toBeInTheDocument();
  });

  it('highlights only the home entry on the studio root', () => {
    const nav = renderRail(ROUTE_PATHS.contentAiStudio);

    expect(within(nav).getByRole('link', { name: '首页' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  it('highlights the matching sub-page instead of home', () => {
    const nav = renderRail(`${ROUTE_PATHS.contentAiStudioSegments}?label=street`);

    expect(within(nav).getByRole('link', { name: '片段素材' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '首页' })).not.toHaveAttribute('aria-current');
  });

  it('keeps AI 剪辑 active on a task deep link', () => {
    const nav = renderRail(`${ROUTE_PATHS.contentAiStudioEditing}/run-1`);

    expect(within(nav).getByRole('link', { name: 'AI 剪辑' })).toHaveAttribute('href', ROUTE_PATHS.contentAiStudioEditing);
    expect(within(nav).getByRole('link', { name: 'AI 剪辑' })).toHaveAttribute('aria-current', 'page');
  });

  it('uses the same route-driven state in the compact navigation', () => {
    render(
      <MemoryRouter initialEntries={[ROUTE_PATHS.contentAiStudioOutputs]}>
        <AiStudioCompactNav />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'AI 创作中心导航' });

    expect(within(nav).getByRole('link', { name: '成片' })).toHaveAttribute('aria-current', 'page');
  });
});
