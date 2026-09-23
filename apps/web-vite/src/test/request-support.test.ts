import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiGatewayPath, resolveApiGatewayPrefix } from '@/lib/api-gateway';
import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import {
  asRecord,
  readFiniteNumber,
  readString,
  readStringArray,
} from '@/lib/unknown-data';

describe('request support contracts', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('keeps API gateway paths normalized', () => {
    expect(resolveApiGatewayPrefix()).toBe('/v1');
    expect(buildApiGatewayPath('/dashboard/overview')).toBe('/v1/dashboard/overview');
    expect(buildApiGatewayPath('dashboard/overview')).toBe('/v1/dashboard/overview');
    expect(buildApiGatewayPath('')).toBe('/v1/');
  });

  it('builds gateway-relative generated admin paths', () => {
    expect(AIOS_API_PATHS.authRegister).toBe('/auth/register');
    expect(AIOS_API_PATHS.role('role-1')).toBe('/roles/role-1');
    expect(AIOS_API_PATHS.rolePermissions(7)).toBe('/roles/7/permissions');
    expect(AIOS_API_PATHS.user('user-1')).toBe('/users/user-1');
    expect(AIOS_API_PATHS.userRoles(9)).toBe('/users/9/roles');
  });

  it('uses bounded no-op auth bridge defaults before application wiring', async () => {
    vi.resetModules();
    const bridge = await import('@/lib/auth-session-bridge');

    expect(bridge.readSessionAccessToken()).toBeNull();
    expect(() => bridge.writeSessionAccessToken('fixture')).not.toThrow();
    expect(() => bridge.clearAuthSession()).not.toThrow();
  });

  it('delegates auth bridge reads, writes, and clearing after configuration', async () => {
    vi.resetModules();
    const bridge = await import('@/lib/auth-session-bridge');
    let accessToken: string | null = 'initial';
    const clearSession = vi.fn(() => {
      accessToken = null;
    });

    bridge.configureAuthSessionBridge({
      getAccessToken: () => accessToken,
      setAccessToken: (nextAccessToken) => {
        accessToken = nextAccessToken;
      },
      clearSession,
    });

    expect(bridge.readSessionAccessToken()).toBe('initial');
    bridge.writeSessionAccessToken('next');
    expect(bridge.readSessionAccessToken()).toBe('next');
    bridge.clearAuthSession();
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(bridge.readSessionAccessToken()).toBeNull();
  });

  it('normalizes unknown values without broad casts', () => {
    expect(asRecord({ ok: true })).toEqual({ ok: true });
    expect(asRecord(null)).toBeNull();
    expect(asRecord('value')).toBeNull();
    expect(asRecord([])).toBeNull();
    expect(readString('value')).toBe('value');
    expect(readString(7, 'fallback')).toBe('fallback');
    expect(readStringArray(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(readStringArray('a')).toEqual([]);
    expect(readFiniteNumber(12.5)).toBe(12.5);
    expect(readFiniteNumber(Number.NaN)).toBeUndefined();
    expect(readFiniteNumber('12')).toBeUndefined();
  });
});
