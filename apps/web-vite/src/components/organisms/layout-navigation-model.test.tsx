import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { buildLayoutMenuItems } from './layout-navigation-model';

describe('layout sample inventory navigation', () => {
  it('keeps sample inventory before docs without the retired agent entry', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.sampleInventory,
      permissions: ['agent:read'],
      roles: ['admin'],
      user: null,
      isAuthenticated: true,
    });
    const keys = items.map((item) => item && 'key' in item ? String(item.key) : '');

    expect(keys.indexOf(ROUTE_PATHS.sampleInventory)).toBe(
      keys.indexOf(ROUTE_PATHS.marketing) + 1
    );
    expect(keys.indexOf(ROUTE_PATHS.docs)).toBe(keys.indexOf(ROUTE_PATHS.sampleInventory) + 1);
    expect(keys).not.toContain('/agent');
  });

  it('shows sample inventory to an authenticated account without a new permission', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.sampleInventory,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    });
    const keys = items.map((item) => item && 'key' in item ? String(item.key) : '');

    expect(keys).toContain(ROUTE_PATHS.sampleInventory);
  });

  it('does not expose the retired agent entry to authenticated accounts', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    });
    const keys = items.map((item) => item && 'key' in item ? String(item.key) : '');

    expect(keys).not.toContain('/agent');
  });
});
