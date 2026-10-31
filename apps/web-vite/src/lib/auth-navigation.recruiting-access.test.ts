import { describe, expect, it, vi } from 'vitest';

import { canAccessPath } from './auth-navigation';
import { ROUTE_PATHS } from './route-policy-registry';

// Recruiting belongs to the full profile; do not inherit a developer's BQL preview mode.
vi.mock('./frontend-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, moduleProfile: 'full' } };
});

describe('recruiting route access', () => {
  it('keeps the intern test public', () => {
    expect(canAccessPath(ROUTE_PATHS.joinAiIntern, [], [], null, false)).toBe(true);
  });

  it('keeps recruiting review closed to anonymous visitors and non-admins', () => {
    expect(canAccessPath(ROUTE_PATHS.adminRecruiting, [], [], null, false)).toBe(false);
    expect(canAccessPath(ROUTE_PATHS.adminRecruiting, [], [], null, true)).toBe(false);
    expect(canAccessPath(ROUTE_PATHS.adminRecruiting, [], ['admin'], null, true)).toBe(true);
  });
});
