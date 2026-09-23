import { describe, expect, it } from 'vitest';

import { canAccessPath } from './auth-navigation';
import {
  AUTH_NAVIGATION_POLICY_PATHS,
  PROTECTED_LAYOUT_MENU_PATHS,
  findRoutePolicyEntry,
} from './route-policy-registry';

const RETIRED_AGENT_PATH = '/agent';

describe('retired agent route', () => {
  it('stays absent from route and navigation policy', () => {
    expect(findRoutePolicyEntry(RETIRED_AGENT_PATH)).toBeUndefined();
    expect(AUTH_NAVIGATION_POLICY_PATHS).not.toContain(RETIRED_AGENT_PATH);
    expect(PROTECTED_LAYOUT_MENU_PATHS).not.toContain(RETIRED_AGENT_PATH);
  });

  it('cannot be restored by legacy permissions or an elevated role', () => {
    expect(canAccessPath(RETIRED_AGENT_PATH, ['agent:read'], ['admin'], null, true)).toBe(false);
  });
});
