import { describe, expect, it } from 'vitest';

import { canAccessPath } from './auth-navigation';
import { ROUTE_PATHS } from './route-policy-registry';

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
