import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAccessPolicy(mode: 'public' | 'authenticated') {
  vi.resetModules();
  vi.doMock('@/lib/frontend-env', () => ({
    frontendEnv: { sampleInventoryAccessMode: mode },
  }));
  const [{ canAccessPath }, { ROUTE_PATHS }] = await Promise.all([
    import('./auth-navigation'),
    import('./route-policy-registry'),
  ]);
  return { canAccessPath, path: ROUTE_PATHS.sampleInventory };
}

describe('sample inventory route access mode', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/frontend-env');
    vi.resetModules();
  });

  it('allows an anonymous visitor only in public mode', async () => {
    const { canAccessPath, path } = await loadAccessPolicy('public');

    expect(canAccessPath(path, [], [], null, false)).toBe(true);
  });

  it('keeps authenticated mode fail closed', async () => {
    const { canAccessPath, path } = await loadAccessPolicy('authenticated');

    expect(canAccessPath(path, [], [], null, false)).toBe(false);
    expect(canAccessPath(path, [], [], null, true)).toBe(true);
  });
});
