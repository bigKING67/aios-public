import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJSONStorage } from 'zustand/middleware';

import { usePermission, usePermissions, useRole } from '@/hooks/use-permission';

import { selectUserRoles, useAuthStore, type User } from './auth.store';

const user: User = {
  id: 'migration-fixture', username: 'migration-fixture', email: 'fixture@example.test', is_active: true,
};
const values = new Map<string, string>();
const persisted = () => JSON.parse(values.get('auth-store') ?? 'null');

beforeEach(() => {
  useAuthStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    })),
  });
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  values.clear();
});
afterEach(cleanup);

describe('auth store persistence compatibility', () => {
  it('hydrates an empty store and keeps the server session unchecked', async () => {
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState()).toMatchObject({
      user: null, isAuthenticated: false, hasHydrated: true, hasSessionChecked: false,
    });
  });

  it('persists only the UI identity, never credentials or transient flags', () => {
    useAuthStore.getState().login(user, ['report:view:all'], 'synthetic-access');
    useAuthStore.getState().setTokens('synthetic-access', 'synthetic-refresh');
    useAuthStore.getState().setLoading(true);
    useAuthStore.getState().setError('temporary');
    expect(persisted()).toEqual({ version: 2, state: {
      user, permissions: ['report:view:all'], isAuthenticated: true,
    } });
  });

  it('hydrates version 2 identity while requiring a fresh server session check', async () => {
    values.set('auth-store', JSON.stringify({ version: 2, state: {
      user, permissions: ['report:view:all'], isAuthenticated: true,
    } }));
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState()).toMatchObject({
      user, permissions: ['report:view:all'], isAuthenticated: true,
      token: null, refreshToken: null, hasHydrated: true, hasSessionChecked: false,
    });
  });

  it('migrates version 1 and removes old persisted credentials', async () => {
    values.set('auth-store', JSON.stringify({ version: 1, state: {
      user, permissions: [], isAuthenticated: true, token: 'old-synthetic-access',
      refreshToken: 'old-synthetic-refresh', hasSessionChecked: true,
    } }));
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState()).toMatchObject({
      user, token: null, refreshToken: null, hasHydrated: true, hasSessionChecked: false,
    });
    expect(persisted()).toEqual({ version: 2, state: { user, permissions: [], isAuthenticated: true } });
  });

  it('does not retain authenticated state from a legacy entry without a user', async () => {
    values.set('auth-store', JSON.stringify({ version: 1, state: { user: null, isAuthenticated: true } }));
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('clears credentials, identity and permissions on logout and subsequent hydration', async () => {
    useAuthStore.getState().login(user, ['report:view:all'], 'synthetic-access');
    useAuthStore.getState().setTokens('synthetic-access', 'synthetic-refresh');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState()).toMatchObject({
      user: null, token: null, refreshToken: null, permissions: [], isAuthenticated: false,
    });
    expect(persisted()).toEqual({ version: 2, state: { user: null, permissions: [], isAuthenticated: false } });
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('keeps role subscriptions stable across anonymous, login and logout renders', () => {
    const { result, rerender } = renderHook(() => ({
      roles: useAuthStore(selectUserRoles),
      allowed: usePermission('report:view:all'),
      permissions: usePermissions(['report:view:all']),
      role: useRole(),
    }));
    const emptyRoles = result.current.roles;
    rerender();
    expect(result.current.roles).toBe(emptyRoles);
    expect(result.current.allowed).toBe(false);
    act(() => useAuthStore.getState().login({ ...user, roles: ['viewer'] }, ['report:view:all']));
    expect(result.current.roles).toEqual(['viewer']);
    expect(result.current.allowed).toBe(true);
    expect(result.current.permissions.hasAll).toBe(true);
    act(() => useAuthStore.getState().logout());
    expect(result.current.roles).toBe(emptyRoles);
    expect(result.current.allowed).toBe(false);
  });
});
