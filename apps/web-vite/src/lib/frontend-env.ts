const DEFAULT_API_GATEWAY_PREFIX = '/v1';

export type SampleInventoryAccessMode = 'public' | 'authenticated';

function normalizePrefix(rawPrefix: string): string {
  const trimmed = rawPrefix.trim();
  if (!trimmed) {
    return DEFAULT_API_GATEWAY_PREFIX;
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return withoutTrailingSlash || DEFAULT_API_GATEWAY_PREFIX;
}

function readEnv(name: string): string {
  return process.env[name] || '';
}

function isEnabled(rawValue: string): boolean {
  return rawValue.trim() === '1';
}

function resolveSampleInventoryAccessMode(rawValue: string): SampleInventoryAccessMode {
  const normalized = rawValue.trim().toLowerCase() || 'authenticated';
  if (normalized === 'public' || normalized === 'authenticated') {
    return normalized;
  }

  throw new Error(
    `Invalid VITE_SAMPLE_INVENTORY_ACCESS_MODE: ${normalized}; expected public or authenticated`,
  );
}

export const frontendEnv = Object.freeze({
  apiDebugLogs: isEnabled(readEnv('VITE_API_DEBUG_LOGS')),
  apiGatewayPrefix: normalizePrefix(
    readEnv('VITE_API_GATEWAY_PREFIX') ||
      readEnv('API_GATEWAY_PREFIX') ||
      DEFAULT_API_GATEWAY_PREFIX,
  ),
  dashboardMaxQueryDays: readEnv('VITE_DASHBOARD_MAX_QUERY_DAYS').trim(),
  forceFreshData: isEnabled(readEnv('VITE_FORCE_FRESH_DATA')),
  isDevelopment: readEnv('NODE_ENV') === 'development',
  sampleInventoryAccessMode: resolveSampleInventoryAccessMode(
    readEnv('VITE_SAMPLE_INVENTORY_ACCESS_MODE'),
  ),
  serverApiUrl:
    readEnv('VITE_API_GATEWAY_TARGET') ||
    readEnv('VITE_REPORT_API') ||
    readEnv('VITE_API_URL') ||
    'http://localhost:8000/v1',
  superAdminAccounts: readEnv('VITE_SUPER_ADMIN_ACCOUNTS'),
});

export function shouldBypassFrontendCache(): boolean {
  return frontendEnv.forceFreshData;
}

export function shouldBypassQueryCache(): boolean {
  return frontendEnv.isDevelopment || frontendEnv.forceFreshData;
}
