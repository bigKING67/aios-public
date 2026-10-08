import { describe, expect, it } from 'vitest';

import { canAccessPath } from './auth-navigation';
import { ROUTE_PATHS, findRoutePolicyEntry } from './route-policy-registry';

const AI_STUDIO_PATHS = [
  ROUTE_PATHS.contentAiStudio,
  ROUTE_PATHS.contentAiStudioAssets,
  ROUTE_PATHS.contentAiStudioSegments,
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

describe('AI studio route access', () => {
  // The /content alias gate requires children to share its `authenticated` kind; that
  // kind grants the same login-only access as `content_assets` (asserted below).
  it('registers every studio page as a protected route anchored to the studio menu', () => {
    for (const path of AI_STUDIO_PATHS) {
      const entry = findRoutePolicyEntry(path);
      expect(entry?.kind, path).toBe('authenticated');
      expect(entry && 'layoutMenuPath' in entry ? entry.layoutMenuPath : undefined, path).toBe(ROUTE_PATHS.contentAiStudio);
    }
  });

  it.each(ACCESS_CONTEXTS)('follows content-asset access for $name', ({ permissions, roles, authenticated }) => {
    const contentAssetsAccess = canAccessPath(ROUTE_PATHS.marketingContentAssets, permissions, roles, null, authenticated);
    for (const path of AI_STUDIO_PATHS) {
      expect(canAccessPath(path, permissions, roles, null, authenticated), path).toBe(contentAssetsAccess);
    }
  });
});
