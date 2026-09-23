export type RoutePolicyKind =
  | 'public'
  | 'authenticated'
  | 'creator_dashboard'
  | 'admin'
  | 'dataops'
  | 'report_read'
  | 'report_export'
  | 'sample_inventory'
  | 'marketing_workspace'
  | 'creator_library'
  | 'content_assets'
  | 'content_assets_write';

export type ProtectedRoutePolicyEntry = {
  path: string;
  kind: Exclude<RoutePolicyKind, 'public'>;
  layoutMenuPath?: string;
};

export type PublicRoutePolicyEntry = {
  path: string;
  kind: 'public';
};

export type RoutePolicyAliasEntry = {
  path: string;
  kind: Exclude<RoutePolicyKind, 'public'>;
};

export type RoutePolicyEntry = ProtectedRoutePolicyEntry | PublicRoutePolicyEntry | RoutePolicyAliasEntry;

export const ROUTE_PATHS = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  dashboardIndustryMaterialInspiration: '/dashboard/industry-material-inspiration',
  dashboardCreator: '/dashboard/creator',
  dashboardCreatorLive: '/dashboard/creator/live',
  dashboardCreatorShortVideo: '/dashboard/creator/short-video',
  dashboardCreatorTargetList: '/dashboard/creator/target-list',
  reportsWeekly: '/reports/weekly',
  reportsMonthly: '/reports/monthly',
  reportsSpecial: '/reports/special',
  reportsSpecialGsvMonthlyChannel: '/reports/special/gsv-monthly-channel',
  opsDataops: '/ops/dataops',
  marketing: '/marketing',
  marketingCreatorLibrary: '/marketing/creator-library',
  marketingIndustryNews: '/marketing/industry-news',
  marketingContentAssets: '/marketing/content-assets',
  marketingContentAssetDetail: '/marketing/content-assets/:assetId',
  sampleInventory: '/sample-inventory',
  content: '/content',
  contentLiveCenter: '/content/live-center',
  contentLiveCenterAnalysis: '/content/live-center/:sessionId/analysis/:analysisId',
  docs: '/docs',
  docsGuide: '/docs/guide',
  docsAnalysisFrameworks: '/docs/analysis-frameworks',
  docsAnalysisPlans: '/docs/analysis-plans',
  docsReferences: '/docs/references',
  exports: '/exports',
  profile: '/profile',
  admin: '/admin',
  adminUsers: '/admin/users',
  adminRoles: '/admin/roles',
  adminPermissions: '/admin/permissions',
  adminAuditLogs: '/admin/audit-logs',
} as const;

export const PUBLIC_ROUTE_POLICY_ENTRIES = [
  { path: ROUTE_PATHS.home, kind: 'public' },
  { path: ROUTE_PATHS.login, kind: 'public' },
  { path: ROUTE_PATHS.dashboard, kind: 'public' },
  { path: ROUTE_PATHS.docs, kind: 'public' },
  { path: ROUTE_PATHS.docsGuide, kind: 'public' },
  { path: ROUTE_PATHS.docsAnalysisFrameworks, kind: 'public' },
  { path: ROUTE_PATHS.docsAnalysisPlans, kind: 'public' },
  { path: ROUTE_PATHS.docsReferences, kind: 'public' },
] as const satisfies readonly PublicRoutePolicyEntry[];

export const PROTECTED_ROUTE_POLICY_ENTRIES = [
  {
    path: ROUTE_PATHS.dashboardIndustryMaterialInspiration,
    kind: 'content_assets_write',
    layoutMenuPath: ROUTE_PATHS.dashboardIndustryMaterialInspiration,
  },
  {
    path: ROUTE_PATHS.dashboardCreatorLive,
    kind: 'creator_dashboard',
    layoutMenuPath: ROUTE_PATHS.dashboardCreator,
  },
  {
    path: ROUTE_PATHS.dashboardCreatorShortVideo,
    kind: 'creator_dashboard',
    layoutMenuPath: ROUTE_PATHS.dashboardCreator,
  },
  {
    path: ROUTE_PATHS.dashboardCreatorTargetList,
    kind: 'creator_dashboard',
    layoutMenuPath: ROUTE_PATHS.dashboardCreator,
  },
  {
    path: ROUTE_PATHS.reportsWeekly,
    kind: 'report_read',
    layoutMenuPath: ROUTE_PATHS.reportsWeekly,
  },
  {
    path: ROUTE_PATHS.reportsMonthly,
    kind: 'report_read',
    layoutMenuPath: ROUTE_PATHS.reportsMonthly,
  },
  {
    path: ROUTE_PATHS.reportsSpecial,
    kind: 'report_read',
    layoutMenuPath: ROUTE_PATHS.reportsSpecial,
  },
  {
    path: ROUTE_PATHS.reportsSpecialGsvMonthlyChannel,
    kind: 'report_read',
    layoutMenuPath: ROUTE_PATHS.reportsSpecial,
  },
  {
    path: ROUTE_PATHS.opsDataops,
    kind: 'dataops',
    layoutMenuPath: ROUTE_PATHS.opsDataops,
  },
  {
    path: ROUTE_PATHS.marketing,
    kind: 'authenticated',
  },
  {
    path: ROUTE_PATHS.marketingCreatorLibrary,
    kind: 'creator_library',
    layoutMenuPath: ROUTE_PATHS.marketingCreatorLibrary,
  },
  {
    path: ROUTE_PATHS.marketingIndustryNews,
    kind: 'authenticated',
    layoutMenuPath: ROUTE_PATHS.marketingIndustryNews,
  },
  {
    path: ROUTE_PATHS.marketingContentAssets,
    kind: 'content_assets',
    layoutMenuPath: ROUTE_PATHS.marketingContentAssets,
  },
  {
    path: ROUTE_PATHS.contentLiveCenter,
    kind: 'authenticated',
    layoutMenuPath: ROUTE_PATHS.contentLiveCenter,
  },
  {
    path: ROUTE_PATHS.contentLiveCenterAnalysis,
    kind: 'authenticated',
    layoutMenuPath: ROUTE_PATHS.contentLiveCenter,
  },
  {
    path: ROUTE_PATHS.marketingContentAssetDetail,
    kind: 'content_assets',
    layoutMenuPath: ROUTE_PATHS.marketingContentAssets,
  },
  {
    path: ROUTE_PATHS.sampleInventory,
    kind: 'sample_inventory',
    layoutMenuPath: ROUTE_PATHS.sampleInventory,
  },
  {
    path: ROUTE_PATHS.exports,
    kind: 'report_export',
    layoutMenuPath: ROUTE_PATHS.exports,
  },
  {
    path: ROUTE_PATHS.profile,
    kind: 'authenticated',
  },
  {
    path: ROUTE_PATHS.adminUsers,
    kind: 'admin',
    layoutMenuPath: ROUTE_PATHS.adminUsers,
  },
  {
    path: ROUTE_PATHS.adminRoles,
    kind: 'admin',
    layoutMenuPath: ROUTE_PATHS.adminRoles,
  },
  {
    path: ROUTE_PATHS.adminPermissions,
    kind: 'admin',
    layoutMenuPath: ROUTE_PATHS.adminPermissions,
  },
  {
    path: ROUTE_PATHS.adminAuditLogs,
    kind: 'admin',
    layoutMenuPath: ROUTE_PATHS.adminAuditLogs,
  },
] as const satisfies readonly ProtectedRoutePolicyEntry[];

export const PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES = [
  {
    path: ROUTE_PATHS.dashboardCreator,
    kind: 'creator_dashboard',
  },
  {
    path: ROUTE_PATHS.admin,
    kind: 'admin',
  },
  {
    path: ROUTE_PATHS.content,
    kind: 'authenticated',
  },
] as const satisfies readonly RoutePolicyAliasEntry[];

export const ROUTE_POLICY_ENTRIES = [
  ...PUBLIC_ROUTE_POLICY_ENTRIES,
  ...PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
  ...PROTECTED_ROUTE_POLICY_ENTRIES,
] as const satisfies readonly RoutePolicyEntry[];

export const PROTECTED_LAYOUT_MENU_PATHS = Array.from(
  new Set(
    (PROTECTED_ROUTE_POLICY_ENTRIES as readonly ProtectedRoutePolicyEntry[])
      .map((entry) => entry.layoutMenuPath)
      .filter((path): path is string => typeof path === 'string'),
  ),
);

export const AUTH_NAVIGATION_POLICY_PATHS = Array.from(
  new Set([...PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES, ...PROTECTED_ROUTE_POLICY_ENTRIES].map((entry) => entry.path)),
);

export function normalizeRoutePolicyPath(path?: string): string {
  if (!path) {
    return '/';
  }

  const normalized = path.trim();
  if (!normalized) {
    return '/';
  }

  const withoutQuery = normalized.split('?')[0].split('#')[0] || '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

function routePolicyPathMatches(pathname: string, policyPath: string): boolean {
  const normalizedPath = normalizeRoutePolicyPath(pathname);
  const normalizedPolicyPath = normalizeRoutePolicyPath(policyPath);

  if (normalizedPolicyPath === '/') {
    return normalizedPath === '/';
  }

  const pathSegments = normalizedPath.split('/').filter(Boolean);
  const policySegments = normalizedPolicyPath.split('/').filter(Boolean);

  if (pathSegments.length < policySegments.length) {
    return false;
  }

  return policySegments.every((policySegment, index) => {
    if (policySegment.startsWith(':') && policySegment.length > 1) {
      return pathSegments[index].length > 0;
    }

    return pathSegments[index] === policySegment;
  });
}

export function findRoutePolicyEntry(pathname: string): RoutePolicyEntry | undefined {
  const normalizedPath = normalizeRoutePolicyPath(pathname);

  return (ROUTE_POLICY_ENTRIES as readonly RoutePolicyEntry[])
    .filter((entry) => routePolicyPathMatches(normalizedPath, entry.path))
    .sort((a, b) => normalizeRoutePolicyPath(b.path).length - normalizeRoutePolicyPath(a.path).length)[0];
}
