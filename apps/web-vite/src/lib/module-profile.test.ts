import { describe, expect, it } from 'vitest';

import {
  AI_STUDIO_GUIDE_PATH,
  isPathServedByModuleProfile,
  moduleProfileServesHomePage,
  resolveModuleProfileRedirect,
} from './module-profile';
import { ROUTE_PATHS } from './route-policy-registry';

const SERVED_IN_AI_STUDIO = [
  ROUTE_PATHS.login,
  ROUTE_PATHS.joinAiIntern,
  `${ROUTE_PATHS.joinAiIntern}/`,
  `${ROUTE_PATHS.joinAiIntern}?source=invitation`,
  ROUTE_PATHS.profile,
  ROUTE_PATHS.adminUsers,
  ROUTE_PATHS.adminRoles,
  ROUTE_PATHS.adminPermissions,
  ROUTE_PATHS.contentAiStudio,
  `${ROUTE_PATHS.contentAiStudio}/`,
  ROUTE_PATHS.contentAiStudioSegments,
  `${ROUTE_PATHS.contentAiStudioEditing}/run-1`,
  `${ROUTE_PATHS.contentAiStudioOutputs}?batch=1`,
  ROUTE_PATHS.marketingContentAssets,
  `${ROUTE_PATHS.marketingContentAssets}/asset-1`,
  AI_STUDIO_GUIDE_PATH,
];

const CONSOLE_IN_AI_STUDIO = [
  ROUTE_PATHS.home,
  ROUTE_PATHS.dashboard,
  ROUTE_PATHS.dashboardCreatorLive,
  ROUTE_PATHS.reportsWeekly,
  ROUTE_PATHS.opsDataops,
  ROUTE_PATHS.marketing,
  ROUTE_PATHS.marketingCreatorLibrary,
  ROUTE_PATHS.marketingIndustryNews,
  ROUTE_PATHS.sampleInventory,
  ROUTE_PATHS.contentLiveCenter,
  ROUTE_PATHS.docs,
  ROUTE_PATHS.docsGuide,
  `${ROUTE_PATHS.docsGuide}/content-assets`,
  ROUTE_PATHS.exports,
  ROUTE_PATHS.adminAuditLogs,
  ROUTE_PATHS.adminRecruiting,
];

describe('module profile', () => {
  it('serves every path and the home page under the full profile', () => {
    for (const path of [...SERVED_IN_AI_STUDIO, ...CONSOLE_IN_AI_STUDIO]) {
      expect(isPathServedByModuleProfile(path, 'full'), path).toBe(true);
      expect(resolveModuleProfileRedirect(path, 'full'), path).toBeNull();
    }
    expect(moduleProfileServesHomePage('full')).toBe(true);
  });

  it('serves the complete console without redirecting BQL modules to the studio', () => {
    for (const path of SERVED_IN_AI_STUDIO) {
      expect(isPathServedByModuleProfile(path, 'ai_studio'), path).toBe(true);
      expect(resolveModuleProfileRedirect(path, 'ai_studio'), path).toBeNull();
    }
    for (const path of CONSOLE_IN_AI_STUDIO) {
      expect(isPathServedByModuleProfile(path, 'ai_studio'), path).toBe(true);
      expect(resolveModuleProfileRedirect(path, 'ai_studio'), path).toBeNull();
    }
    expect(moduleProfileServesHomePage('ai_studio')).toBe(true);
  });
  it('opens bare 内容中台 on AI 创作中心, the module every account can open', () => {
    expect(resolveModuleProfileRedirect(ROUTE_PATHS.content, 'ai_studio')).toBe(ROUTE_PATHS.contentAiStudio);
  });
  it('still excludes unrelated or legacy paths from BQL', () => {
    for (const path of ['/agent', '/content/ai-studio-legacy', `${ROUTE_PATHS.joinAiIntern}/unknown`]) {
      expect(resolveModuleProfileRedirect(path, 'ai_studio')).toBe(ROUTE_PATHS.contentAiStudio);
    }
  });
});
