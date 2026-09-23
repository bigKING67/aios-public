import { PROTECTED_ROUTE_POLICY_ENTRIES, ROUTE_PATHS, type ProtectedRoutePolicyEntry } from './route-policy-registry';

export {
  AUTH_NAVIGATION_POLICY_PATHS,
  PUBLIC_ROUTE_POLICY_ENTRIES,
  PROTECTED_LAYOUT_MENU_PATHS,
  PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
  PROTECTED_ROUTE_POLICY_ENTRIES,
  ROUTE_POLICY_ENTRIES,
  ROUTE_PATHS,
  findRoutePolicyEntry,
  normalizeRoutePolicyPath,
} from './route-policy-registry';

type ProtectedRouteSourceOwner = {
  page: string;
  importedProtectedComponent?: string;
};

type ProtectedRoutePath = (typeof PROTECTED_ROUTE_POLICY_ENTRIES)[number]['path'];

const PROTECTED_ROUTE_SOURCE_OWNERS = {
  [ROUTE_PATHS.dashboardIndustryMaterialInspiration]: {
    page: 'apps/web-vite/src/app/dashboard/industry-material-inspiration/page.tsx',
  },
  [ROUTE_PATHS.dashboardCreatorLive]: {
    page: 'apps/web-vite/src/app/dashboard/creator/live/page.tsx',
  },
  [ROUTE_PATHS.dashboardCreatorShortVideo]: {
    page: 'apps/web-vite/src/app/dashboard/creator/short-video/page.tsx',
  },
  [ROUTE_PATHS.dashboardCreatorTargetList]: {
    page: 'apps/web-vite/src/app/dashboard/creator/target-list/page.tsx',
  },
  [ROUTE_PATHS.reportsWeekly]: {
    page: 'apps/web-vite/src/app/reports/weekly/page.tsx',
  },
  [ROUTE_PATHS.reportsMonthly]: {
    page: 'apps/web-vite/src/app/reports/monthly/page.tsx',
  },
  [ROUTE_PATHS.reportsSpecial]: {
    page: 'apps/web-vite/src/app/reports/special/page.tsx',
  },
  [ROUTE_PATHS.reportsSpecialGsvMonthlyChannel]: {
    page: 'apps/web-vite/src/app/reports/special/gsv-monthly-channel/page.tsx',
  },
  [ROUTE_PATHS.opsDataops]: {
    page: 'apps/web-vite/src/app/ops/dataops/page.tsx',
  },
  [ROUTE_PATHS.marketing]: {
    page: 'apps/web-vite/src/app/marketing/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/marketing/_components/marketing-page-content.tsx',
  },
  [ROUTE_PATHS.marketingCreatorLibrary]: {
    page: 'apps/web-vite/src/app/marketing/creator-library/page.tsx',
    importedProtectedComponent:
      'apps/web-vite/src/app/marketing/creator-library/_components/creator-library-client.tsx',
  },
  [ROUTE_PATHS.marketingIndustryNews]: {
    page: 'apps/web-vite/src/app/marketing/industry-news/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/marketing/industry-news/_components/industry-news-client.tsx',
  },
  [ROUTE_PATHS.marketingContentAssets]: {
    page: 'apps/web-vite/src/app/marketing/content-assets/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-client.tsx',
  },
  [ROUTE_PATHS.contentLiveCenter]: {
    page: 'apps/web-vite/src/app/content/live-center/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/content/live-center/_components/live-center-client.tsx',
  },
  [ROUTE_PATHS.contentLiveCenterAnalysis]: {
    page: 'apps/web-vite/src/app/content/live-center/[sessionId]/analysis/[analysisId]/page.tsx',
    importedProtectedComponent:
      'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-client.tsx',
  },
  [ROUTE_PATHS.marketingContentAssetDetail]: {
    page: 'apps/web-vite/src/app/marketing/content-assets/[assetId]/page.tsx',
    importedProtectedComponent:
      'apps/web-vite/src/app/marketing/content-assets/_components/content-asset-detail-client.tsx',
  },
  [ROUTE_PATHS.sampleInventory]: {
    page: 'apps/web-vite/src/app/sample-inventory/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/sample-inventory/_components/sample-inventory-client.tsx',
  },
  [ROUTE_PATHS.exports]: {
    page: 'apps/web-vite/src/app/exports/page.tsx',
  },
  [ROUTE_PATHS.profile]: {
    page: 'apps/web-vite/src/app/profile/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/profile/_components/profile-page-client.tsx',
  },
  [ROUTE_PATHS.adminUsers]: {
    page: 'apps/web-vite/src/app/admin/users/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/admin/users/_components/users-page-client.tsx',
  },
  [ROUTE_PATHS.adminRoles]: {
    page: 'apps/web-vite/src/app/admin/roles/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/admin/roles/_components/roles-page-client.tsx',
  },
  [ROUTE_PATHS.adminPermissions]: {
    page: 'apps/web-vite/src/app/admin/permissions/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/admin/permissions/_components/permissions-page-client.tsx',
  },
  [ROUTE_PATHS.adminAuditLogs]: {
    page: 'apps/web-vite/src/app/admin/audit-logs/page.tsx',
    importedProtectedComponent: 'apps/web-vite/src/app/admin/audit-logs/_components/audit-logs-page-client.tsx',
  },
} as const satisfies Record<ProtectedRoutePath, ProtectedRouteSourceOwner>;

export type ProtectedRouteGovernanceEntry = ProtectedRoutePolicyEntry & ProtectedRouteSourceOwner;

export const PROTECTED_ROUTE_GOVERNANCE_ENTRIES = PROTECTED_ROUTE_POLICY_ENTRIES.map((entry) => ({
  ...entry,
  ...PROTECTED_ROUTE_SOURCE_OWNERS[entry.path],
})) satisfies readonly ProtectedRouteGovernanceEntry[];
