import { describe, expect, it } from 'vitest';

import { canAccessPath } from './auth-navigation';
import { ROUTE_PATHS } from './route-policy-registry';

describe('anonymous route access', () => {
  it('keeps business routes closed to anonymous visitors', () => {
    for (const path of [ROUTE_PATHS.dashboard, ROUTE_PATHS.sampleInventory]) {
      expect(canAccessPath(path, [], [], null, false), path).toBe(false);
      expect(canAccessPath(path, [], [], null, true), path).toBe(true);
    }
  });

  it('keeps the home page and help docs public', () => {
    for (const path of [ROUTE_PATHS.home, ROUTE_PATHS.login, ROUTE_PATHS.docs, ROUTE_PATHS.docsGuide]) {
      expect(canAccessPath(path, [], [], null, false), path).toBe(true);
    }
  });
});
