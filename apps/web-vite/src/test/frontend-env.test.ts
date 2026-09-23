import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'API_GATEWAY_PREFIX',
  'NODE_ENV',
  'VITE_API_DEBUG_LOGS',
  'VITE_API_GATEWAY_PREFIX',
  'VITE_API_GATEWAY_TARGET',
  'VITE_API_URL',
  'VITE_DASHBOARD_MAX_QUERY_DAYS',
  'VITE_FORCE_FRESH_DATA',
  'VITE_REPORT_API',
  'VITE_SAMPLE_INVENTORY_ACCESS_MODE',
  'VITE_SUPER_ADMIN_ACCOUNTS',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function clearFrontendEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

async function loadFrontendEnv() {
  vi.resetModules();
  return import('@/lib/frontend-env');
}

describe('frontend environment normalization', () => {
  afterEach(() => {
    clearFrontendEnv();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    vi.resetModules();
  });

  it('uses bounded defaults', async () => {
    clearFrontendEnv();
    const { frontendEnv, shouldBypassFrontendCache, shouldBypassQueryCache } = await loadFrontendEnv();

    expect(frontendEnv.apiGatewayPrefix).toBe('/v1');
    expect(frontendEnv.serverApiUrl).toBe('http://localhost:8000/v1');
    expect(frontendEnv.apiDebugLogs).toBe(false);
    expect(frontendEnv.forceFreshData).toBe(false);
    expect(frontendEnv.isDevelopment).toBe(false);
    expect(frontendEnv.sampleInventoryAccessMode).toBe('authenticated');
    expect(shouldBypassFrontendCache()).toBe(false);
    expect(shouldBypassQueryCache()).toBe(false);
  });

  it('normalizes explicit prefixes and enabled flags', async () => {
    clearFrontendEnv();
    process.env.VITE_API_GATEWAY_PREFIX = ' gateway/// ';
    process.env.VITE_API_DEBUG_LOGS = '1';
    process.env.VITE_FORCE_FRESH_DATA = '1';
    process.env.NODE_ENV = 'development';
    process.env.VITE_DASHBOARD_MAX_QUERY_DAYS = ' 90 ';
    process.env.VITE_SUPER_ADMIN_ACCOUNTS = 'admin@example.test';
    process.env.VITE_SAMPLE_INVENTORY_ACCESS_MODE = ' PUBLIC ';
    process.env.VITE_API_GATEWAY_TARGET = 'http://api.example.test/v1';
    const { frontendEnv, shouldBypassFrontendCache, shouldBypassQueryCache } = await loadFrontendEnv();

    expect(frontendEnv).toMatchObject({
      apiDebugLogs: true,
      apiGatewayPrefix: '/gateway',
      dashboardMaxQueryDays: '90',
      forceFreshData: true,
      isDevelopment: true,
      sampleInventoryAccessMode: 'public',
      serverApiUrl: 'http://api.example.test/v1',
      superAdminAccounts: 'admin@example.test',
    });
    expect(shouldBypassFrontendCache()).toBe(true);
    expect(shouldBypassQueryCache()).toBe(true);
  });

  it('falls back across prefix and server URL aliases', async () => {
    clearFrontendEnv();
    process.env.VITE_API_GATEWAY_PREFIX = '/';
    process.env.API_GATEWAY_PREFIX = 'legacy';
    process.env.VITE_REPORT_API = 'http://reports.example.test/v1';
    let loaded = await loadFrontendEnv();
    expect(loaded.frontendEnv.apiGatewayPrefix).toBe('/v1');
    expect(loaded.frontendEnv.serverApiUrl).toBe('http://reports.example.test/v1');

    clearFrontendEnv();
    process.env.API_GATEWAY_PREFIX = 'legacy///';
    process.env.VITE_API_URL = 'http://legacy.example.test/v1';
    loaded = await loadFrontendEnv();
    expect(loaded.frontendEnv.apiGatewayPrefix).toBe('/legacy');
    expect(loaded.frontendEnv.serverApiUrl).toBe('http://legacy.example.test/v1');
  });

  it('fails closed when the sample inventory access mode is invalid', async () => {
    clearFrontendEnv();
    process.env.VITE_SAMPLE_INVENTORY_ACCESS_MODE = 'anonymous';

    await expect(loadFrontendEnv()).rejects.toThrow(
      'Invalid VITE_SAMPLE_INVENTORY_ACCESS_MODE',
    );
  });
});
