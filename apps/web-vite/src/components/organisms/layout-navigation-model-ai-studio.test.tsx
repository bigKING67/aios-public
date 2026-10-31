import { describe, expect, it, vi } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { buildLayoutMenuItems, collectRouteKeys, resolveLayoutMenuPath, type LayoutMenuItems } from './layout-navigation-model';
import { resolveSelectedMenuKey } from './layout-route-selection';

function contentChildren(items: LayoutMenuItems) {
  const content = items.find((item) => item.key === 'content');
  return content?.kind === 'group' ? content.links : [];
}

function childKeys(items: LayoutMenuItems) {
  return contentChildren(items).map((item) => item.key);
}

describe('content hub AI studio navigation', () => {
  it('offers other signed-in accounts only AI 创作中心 under 内容中台', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: ['marketing:content_assets:manage'],
      roles: ['content_ops', 'content_ops_manager'],
      user: { id: 'u-test', username: 'Test', email: 'test@example.test', is_active: true, roles: ['content_ops'] },
      isAuthenticated: true,
    });

    expect(childKeys(items)).toEqual([ROUTE_PATHS.contentAiStudio]);
  });

  it('places AI 创作中心 between 素材库 and 直播中台 for the super admin', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: ['admin'],
      user: { id: 'u-fixture-super-admin', username: 'fixture-super-admin', email: 'fixture-super-admin@example.test', is_active: true, roles: ['admin'] },
      isAuthenticated: true,
    });

    expect(childKeys(items)).toEqual([
      ROUTE_PATHS.marketingContentAssets,
      ROUTE_PATHS.contentAiStudio,
      ROUTE_PATHS.contentLiveCenter,
    ]);
  });

  it('opens in a new tab like its content hub siblings and marks studio sub-pages as current', () => {
    const pathname = `${ROUTE_PATHS.contentAiStudioEditing}/run-1`;
    const items = buildLayoutMenuItems({
      pathname,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    });
    const studio = contentChildren(items).find((item) => item.key === ROUTE_PATHS.contentAiStudio);

    expect(studio).toMatchObject({ href: ROUTE_PATHS.contentAiStudio, openInNewTab: true });
    expect(resolveSelectedMenuKey(resolveLayoutMenuPath(pathname), collectRouteKeys(items))).toBe(ROUTE_PATHS.contentAiStudio);
  });

  it('hides the studio entry from anonymous visitors', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: false,
    });

    expect(childKeys(items)).not.toContain(ROUTE_PATHS.contentAiStudio);
  });
});

vi.mock('@/lib/frontend-env', async (original) => {
  const actual = await original<typeof import('@/lib/frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, superAdminAccounts: 'fixture-super-admin' } };
});
