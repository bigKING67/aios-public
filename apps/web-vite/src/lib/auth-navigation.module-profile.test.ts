import { describe, expect, it, vi } from 'vitest';

vi.mock('./frontend-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, moduleProfile: 'ai_studio' } };
});

const { canAccessPath, resolveSafeEntryPath } = await import('./auth-navigation');
const { ROUTE_PATHS } = await import('./route-policy-registry');

const ADMIN = { permissions: ['*'], roles: ['admin'] };

describe('route access under VITE_AIOS_MODULE_PROFILE=ai_studio', () => {
  it('serves console routes for an administrator while data pages use the BQL disconnected state', () => {
    for (const path of [ROUTE_PATHS.dashboard, ROUTE_PATHS.reportsWeekly, ROUTE_PATHS.marketingCreatorLibrary, ROUTE_PATHS.adminAuditLogs]) {
      expect(canAccessPath(path, ADMIN.permissions, ADMIN.roles, null, true), path).toBe(true);
    }
  });

  it('keeps AI 创作中心 and account administration reachable', () => {
    for (const path of [ROUTE_PATHS.contentAiStudio, ROUTE_PATHS.contentAiStudioSegments, ROUTE_PATHS.adminUsers]) {
      expect(canAccessPath(path, ADMIN.permissions, ADMIN.roles, null, true), path).toBe(true);
    }
  });

  it('preserves an authorized console destination after login', () => {
    const entry = resolveSafeEntryPath(ROUTE_PATHS.dashboard, ADMIN.permissions, ADMIN.roles, null, true);
    expect(entry).toBe(ROUTE_PATHS.dashboard);
  });

  it('keeps candidate intake public while reviewer access requires an administrator', () => {
    expect(canAccessPath(ROUTE_PATHS.joinAiIntern, [], [], null, false)).toBe(true);
    expect(canAccessPath(ROUTE_PATHS.adminRecruiting, [], [], null, false)).toBe(false);
    expect(canAccessPath(ROUTE_PATHS.adminRecruiting, [], [], null, true)).toBe(false);
    expect(canAccessPath(ROUTE_PATHS.adminRecruiting, ADMIN.permissions, ADMIN.roles, null, true)).toBe(true);
  });

  it('still applies authentication and permissions to restored routes', () => {
    expect(canAccessPath(ROUTE_PATHS.adminAuditLogs, [], [], null, true)).toBe(false);
    expect(canAccessPath(ROUTE_PATHS.reportsWeekly, [], [], null, false)).toBe(false);
    expect(canAccessPath(ROUTE_PATHS.contentAiStudio, [], [], null, false)).toBe(false);
  });
});
