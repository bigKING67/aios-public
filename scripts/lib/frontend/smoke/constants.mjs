import { fileURLToPath } from 'node:url';

export const DEFAULT_BASE_URL = 'http://localhost:3000';
export const SMOKE_ROUTES_PATH = fileURLToPath(new URL('../../../config/frontend/smoke-routes.json', import.meta.url));
export const VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1440, height: 960, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]);
export const DEFAULT_TIMEOUT_MS = 12_000;
export const STARTUP_TIMEOUT_MS = 8_000;
export const DEFAULT_BODY_TEXT_MIN_LENGTH = 40;
export const DEFAULT_ROUTE_SETTLE_TIMEOUT_MS = 8_000;
export const DEFAULT_ROUTE_SETTLE_POLL_MS = 250;
export const DEFAULT_SESSION_CHECK_TIMEOUT_MS = 5_000;
export const DEFAULT_ACCESS_COOKIE_NAME = 'aios_access_token';
export const DEFAULT_REFRESH_COOKIE_NAME = 'aios_refresh_token';
export const BLOCKED_MINIMAL_TEXTS = new Set([
  '加载中',
  '加载中...',
  '页面加载中',
  '页面加载中...',
  'Loading',
  'Loading...',
]);
