import { frontendEnv, type ModuleProfile } from './frontend-env';
import { findRoutePolicyEntry, ROUTE_PATHS } from './route-policy-registry';

/**
 * `VITE_AIOS_MODULE_PROFILE`, mirroring the backend `AIOS_MODULE_PROFILE`.
 * `full` connects every module; `ai_studio` connects AI 创作中心 to the
 * 百雀羚 database. Both show the AIOS shell and docs; BQL modules without
 * data integration have an explicit disconnected state, never legacy clients.
 */
export type { ModuleProfile };

export const AI_STUDIO_GUIDE_PATH = `${ROUTE_PATHS.docsGuide}/ai-studio`;

const AI_STUDIO_PROFILE_EXACT_PATHS: ReadonlySet<string> = new Set([
  ROUTE_PATHS.login,
  ROUTE_PATHS.profile,
  ROUTE_PATHS.adminUsers,
  ROUTE_PATHS.adminRoles,
  ROUTE_PATHS.adminPermissions,
  // AI 创作中心 deep-links to the asset library and its detail page.
  ROUTE_PATHS.marketingContentAssets,
  AI_STUDIO_GUIDE_PATH,
]);

const AI_STUDIO_PROFILE_PATH_PREFIXES = [
  `${ROUTE_PATHS.contentAiStudio}/`,
  `${ROUTE_PATHS.marketingContentAssets}/`,
] as const;

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export function isPathServedByModuleProfile(
  pathname: string,
  profile: ModuleProfile = frontendEnv.moduleProfile,
): boolean {
  if (profile === 'full') return true;
  const path = stripTrailingSlash(pathname.split(/[?#]/, 1)[0] || ROUTE_PATHS.home);
  // The product shell is complete in BQL too. Data-dependent routes render
  // ModuleNotConnected until their own BQL data integration exists.
  const route = findRoutePolicyEntry(path);
  const knownRoute = route && (route.path.split('/').length === path.split('/').length || path.startsWith(`${ROUTE_PATHS.docs}/`));
  if (knownRoute) return true;
  if (path === ROUTE_PATHS.contentAiStudio || AI_STUDIO_PROFILE_EXACT_PATHS.has(path)) return true;
  return AI_STUDIO_PROFILE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * A module's state in this deployment, for honest status on the AIOS home: `open` modules work,
 * `not_connected` ones render ModuleNotConnected (routes.tsx picks the page per FULL_PROFILE_BUILD),
 * and `not_open` ones work but are held back from the company (素材库 is the previous company's
 * library; only the super admin reaches it, 2026-10-27).
 */
export type ModuleDataStatus = 'open' | 'not_connected' | 'not_open';

const AI_STUDIO_OPEN_MODULES: readonly string[] = [ROUTE_PATHS.contentAiStudio, ROUTE_PATHS.docs];
const AI_STUDIO_NOT_OPEN_MODULES: readonly string[] = [ROUTE_PATHS.marketingContentAssets];

function coveredBy(modules: readonly string[], path: string): boolean {
  return modules.some((module) => path === module || path.startsWith(`${module}/`));
}

export function moduleDataStatus(path: string, profile: ModuleProfile = frontendEnv.moduleProfile): ModuleDataStatus {
  if (profile === 'full') return 'open';
  if (coveredBy(AI_STUDIO_OPEN_MODULES, path)) return 'open';
  return coveredBy(AI_STUDIO_NOT_OPEN_MODULES, path) ? 'not_open' : 'not_connected';
}

/** The AIOS home is a static module directory in both deployment profiles. */
export function moduleProfileServesHomePage(profile: ModuleProfile = frontendEnv.moduleProfile): boolean {
  return profile === 'full' || profile === 'ai_studio';
}

/** Where a request for `pathname` must go instead, or `null` to render it. */
export function resolveModuleProfileRedirect(
  pathname: string,
  profile: ModuleProfile = frontendEnv.moduleProfile,
): string | null {
  if (profile === 'full' || isPathServedByModuleProfile(pathname, profile)) return null;
  return ROUTE_PATHS.contentAiStudio;
}
