import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { buildLayoutMenuItems, resolveModuleNavigation } from './layout-navigation-model';

const keysOf = (items: ReturnType<typeof buildLayoutMenuItems>) => items.map((item) => item.key);

describe('layout sample inventory navigation', () => {
  it('keeps sample inventory before docs without the retired agent entry', () => {
    const keys = keysOf(buildLayoutMenuItems({
      pathname: ROUTE_PATHS.sampleInventory,
      permissions: ['agent:read'],
      roles: ['admin'],
      user: null,
      isAuthenticated: true,
    }));

    expect(keys.indexOf(ROUTE_PATHS.sampleInventory)).toBe(keys.indexOf(ROUTE_PATHS.marketing) + 1);
    expect(keys.indexOf(ROUTE_PATHS.docs)).toBe(keys.indexOf(ROUTE_PATHS.sampleInventory) + 1);
    expect(keys).not.toContain('/agent');
  });

  it('shows sample inventory to an authenticated account without a new permission', () => {
    const keys = keysOf(buildLayoutMenuItems({
      pathname: ROUTE_PATHS.sampleInventory,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    }));

    expect(keys).toContain(ROUTE_PATHS.sampleInventory);
  });

  it('does not expose the retired agent entry to authenticated accounts', () => {
    const keys = keysOf(buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    }));

    expect(keys).not.toContain('/agent');
  });

  it('sends anonymous visitors to sign-in for reports', () => {
    const reports = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: false,
    }).find((item) => item.key === ROUTE_PATHS.reportsWeekly);

    expect(reports).toMatchObject({ kind: 'link', label: '报告', href: `/login?redirect=${encodeURIComponent(ROUTE_PATHS.reportsWeekly)}` });
  });
});

describe('module-local navigation', () => {
  const items = buildLayoutMenuItems({ pathname: '/', permissions: ['*'], roles: ['admin'], user: null, isAuthenticated: true });

  it('keeps report links together without repeating other global modules', () => {
    const module = resolveModuleNavigation(items, '/reports/special/example');
    expect(module?.label).toBe('报告');
    expect(module?.links.map((link) => link.key)).toEqual(['/reports/weekly', '/reports/monthly', '/reports/special']);
  });

  it('resolves nested dashboard routes to their local navigation', () => {
    const module = resolveModuleNavigation(items, '/dashboard/creator/short-video');
    expect(module?.label).toBe('看板');
    expect(module?.links.every((link) => link.key.startsWith('/dashboard'))).toBe(true);
  });

  it('does not invent a sidebar for a standalone page or a forbidden destination', () => {
    expect(resolveModuleNavigation(items, '/profile')).toBeUndefined();
    expect(resolveModuleNavigation(items, '/sample-inventory')).toBeUndefined();
    expect(resolveModuleNavigation([], '/admin/users')).toBeUndefined();
  });
});
