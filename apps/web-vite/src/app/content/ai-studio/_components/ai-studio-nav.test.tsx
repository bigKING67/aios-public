import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { AiStudioNav } from './ai-studio-nav';
import { studioLocation } from './ai-studio-nav-config';

function renderNav(pathname: string) {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <AiStudioNav />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'AI 创作中心导航' });
}

function currentLinks(nav: HTMLElement) {
  return within(nav)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent?.trim());
}

afterEach(() => {
  cleanup();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

describe('AI studio navigation', () => {
  it('lists the shared entries first, then the AI 剪辑 and 竞品爆款 groups, without generation', () => {
    const nav = renderNav(ROUTE_PATHS.contentAiStudio);
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());

    expect(labels).toEqual(['首页', '原片', '成片', '框架片段', '卖点片段', 'AI 合成', '爆款分析', '爆款视频']);
    expect(within(nav).getByText('AI 剪辑')).toBeInTheDocument();
    expect(within(nav).getByText('竞品爆款')).toBeInTheDocument();
    expect(within(nav).queryByText('AI 生成')).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: '爆款分析' })).toHaveAttribute('href', ROUTE_PATHS.contentAiStudioCompetitor);
  });

  it('shows the 团队 group only to accounts that may open 团队产出', () => {
    useAuthStore.setState({
      user: { id: 'u-1', username: 'editor', email: 'editor@example.test', is_active: true, roles: [] },
      isAuthenticated: true,
      permissions: [],
    });
    expect(within(renderNav(ROUTE_PATHS.contentAiStudio)).queryByText('团队')).not.toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ permissions: ['marketing:team_output:read'] });
    const nav = renderNav(ROUTE_PATHS.contentAiStudioTeamOutput);
    expect(within(nav).getByText('团队')).toBeInTheDocument();
    expect(currentLinks(nav)).toEqual(['团队产出']);
  });

  it('shows an account limited to 团队产出 that entry alone', () => {
    useAuthStore.setState({
      user: { id: 'u-hr', username: 'Binco', email: 'binco@example.test', is_active: true, roles: ['team_output_viewer', 'team_output_only'] },
      isAuthenticated: true,
      permissions: ['marketing:team_output:read'],
    });
    const nav = renderNav(ROUTE_PATHS.contentAiStudioTeamOutput);
    expect(within(nav).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual(['团队产出']);
    expect(within(nav).queryByText('AI 剪辑')).not.toBeInTheDocument();
  });

  it('highlights only the home entry on the studio root', () => {
    expect(currentLinks(renderNav(ROUTE_PATHS.contentAiStudio))).toEqual(['首页']);
  });

  it('highlights the matching sub-page instead of home', () => {
    expect(currentLinks(renderNav(`${ROUTE_PATHS.contentAiStudioSegments}?label=street`))).toEqual(['框架片段']);
  });

  it('keeps AI 合成 active on a task deep link', () => {
    expect(currentLinks(renderNav(`${ROUTE_PATHS.contentAiStudioEditing}/run-1`))).toEqual(['AI 合成']);
  });

  it('keeps 原片 active on AI 切段, which has no entry of its own', () => {
    expect(currentLinks(renderNav(ROUTE_PATHS.contentAiStudioAnalysis))).toEqual(['原片']);
  });
});

describe('studio location', () => {
  it('reads an annotation from where it was opened', () => {
    const fromAssets = studioLocation(ROUTE_PATHS.contentAiStudioSegments, '?assetId=a1&from=assets');
    expect(fromAssets.item?.path).toBe(ROUTE_PATHS.contentAiStudioAssets);
    expect(fromAssets.crumbs).toEqual([{ label: '原片', href: ROUTE_PATHS.contentAiStudioAssets }, { label: '标注片段' }]);

    const fromAnalysis = studioLocation(ROUTE_PATHS.contentAiStudioSellingPoints, '?assetId=a1&from=analysis');
    expect(fromAnalysis.crumbs.map((crumb) => crumb.label)).toEqual(['原片', 'AI 切段', '标注片段']);

    const fromLibrary = studioLocation(ROUTE_PATHS.contentAiStudioSegments, '?assetId=a1');
    expect(fromLibrary.item?.path).toBe(ROUTE_PATHS.contentAiStudioSegments);
    expect(fromLibrary.crumbs.map((crumb) => crumb.label)).toEqual(['AI 剪辑', '框架片段', '标注片段']);
  });

  it('keeps plain pages and subpages as before', () => {
    expect(studioLocation(ROUTE_PATHS.contentAiStudioSegments, '').crumbs.map((crumb) => crumb.label)).toEqual(['AI 剪辑', '框架片段']);
    expect(studioLocation(ROUTE_PATHS.contentAiStudioAnalysis, '').crumbs).toEqual([
      { label: '原片', href: ROUTE_PATHS.contentAiStudioAssets },
      { label: 'AI 切段' },
    ]);
    // A stray `from` outside an annotation changes nothing.
    expect(studioLocation(ROUTE_PATHS.contentAiStudioSegments, '?from=assets').item?.path).toBe(ROUTE_PATHS.contentAiStudioSegments);
  });
});
