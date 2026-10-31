import { describe, expect, it, vi } from 'vitest';

import { canAccessPath } from './auth-navigation';
import { ROUTE_PATHS, findRoutePolicyEntry } from './route-policy-registry';

const AI_STUDIO_PATHS = [
  ROUTE_PATHS.contentAiStudio,
  ROUTE_PATHS.contentAiStudioAssets,
  ROUTE_PATHS.contentAiStudioSegments,
  ROUTE_PATHS.contentAiStudioSellingPoints,
  ROUTE_PATHS.contentAiStudioOutputs,
  ROUTE_PATHS.contentAiStudioAnalysis,
  ROUTE_PATHS.contentAiStudioEditing,
  `${ROUTE_PATHS.contentAiStudioEditing}/run-1`,
  ROUTE_PATHS.contentAiStudioTrends,
];

const ACCESS_CONTEXTS: Array<{ name: string; permissions: string[]; roles: string[]; authenticated: boolean }> = [
  { name: 'anonymous', permissions: [], roles: [], authenticated: false },
  { name: 'anonymous with content permission', permissions: ['marketing:content_assets:read'], roles: [], authenticated: false },
  { name: 'regular account', permissions: [], roles: [], authenticated: true },
  { name: 'content writer', permissions: ['marketing:content_assets:write'], roles: ['content_ops'], authenticated: true },
];

const SUPER_ADMIN_ONLY_PATHS = [
  ROUTE_PATHS.marketingContentAssets,
  `${ROUTE_PATHS.marketingContentAssets}/asset-1`,
  ROUTE_PATHS.contentLiveCenter,
  '/content/live-center/session-1/analysis/analysis-1',
];

describe('AI studio route access', () => {
  // The /content alias gate requires children to share its `authenticated` kind.
  it('registers every studio page as a protected route anchored to the studio menu', () => {
    for (const path of AI_STUDIO_PATHS) {
      const entry = findRoutePolicyEntry(path);
      expect(entry?.kind, path).toBe('authenticated');
      expect(entry && 'layoutMenuPath' in entry ? entry.layoutMenuPath : undefined, path).toBe(ROUTE_PATHS.contentAiStudio);
    }
  });

  it.each(ACCESS_CONTEXTS)('opens the studio to every signed-in account, not the library or live center: $name', ({ permissions, roles, authenticated }) => {
    for (const path of AI_STUDIO_PATHS) {
      expect(canAccessPath(path, permissions, roles, null, authenticated), path).toBe(authenticated);
    }
    for (const path of SUPER_ADMIN_ONLY_PATHS) {
      expect(canAccessPath(path, permissions, roles, null, authenticated), path).toBe(false);
    }
  });

  it('opens 团队产出 only with its permission, to admins and to the super admin', () => {
    const path = ROUTE_PATHS.contentAiStudioTeamOutput;
    expect(findRoutePolicyEntry(path)?.kind).toBe('team_output');
    expect(canAccessPath(path, ['marketing:team_output:read'], [], null, true)).toBe(true);
    expect(canAccessPath(path, ['marketing:team_output:read'], [], null, false)).toBe(false);
    expect(canAccessPath(path, ['marketing:content_assets:manage'], ['content_ops_manager'], null, true)).toBe(false);
    expect(canAccessPath(path, [], [], null, true)).toBe(false);
    expect(canAccessPath(path, [], ['admin'], null, true)).toBe(true);
    expect(canAccessPath(path, [], [], { username: 'fixture-super-admin' }, true)).toBe(true);
  });

  it('keeps an account limited to 团队产出 on that page and the studio home that forwards to it', () => {
    const roles = ['team_output_viewer', 'team_output_only'];
    const permissions = ['marketing:team_output:read'];
    expect(canAccessPath(ROUTE_PATHS.contentAiStudioTeamOutput, permissions, roles, null, true)).toBe(true);
    expect(canAccessPath(ROUTE_PATHS.contentAiStudio, permissions, roles, null, true)).toBe(true);
    for (const path of AI_STUDIO_PATHS.filter((p) => p !== ROUTE_PATHS.contentAiStudio)) {
      expect(canAccessPath(path, permissions, roles, null, true), path).toBe(false);
    }
    expect(canAccessPath(ROUTE_PATHS.contentAiStudioCompetitor, permissions, [...roles, 'admin'], null, true)).toBe(true);
    expect(canAccessPath(ROUTE_PATHS.contentAiStudioAssets, ['marketing:team_output:read'], ['team_output_viewer'], null, true)).toBe(true);
  });

  it('opens 素材库 and 直播中台 to the super admin, by identity or role', () => {
    for (const path of SUPER_ADMIN_ONLY_PATHS) {
      expect(canAccessPath(path, [], ['admin'], { username: 'fixture-super-admin' }, true), path).toBe(true);
      expect(canAccessPath(path, [], ['super_admin'], null, true), path).toBe(true);
      expect(canAccessPath(path, [], ['admin'], { username: 'Test' }, true), path).toBe(false);
      expect(canAccessPath(path, [], ['super_admin'], null, false), path).toBe(false);
    }
  });
});

vi.mock('@/lib/frontend-env', async (original) => {
  const actual = await original<typeof import('@/lib/frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, superAdminAccounts: 'fixture-super-admin' } };
});
