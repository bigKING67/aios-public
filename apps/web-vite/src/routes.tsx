import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';

const HomePage = lazy(() => import('@/app/page'));
const LoginPage = lazy(() => import('@/app/login/page'));
const MarketingPage = lazy(() => import('@/app/marketing/page'));
const CreatorLibraryPage = lazy(() => import('@/app/marketing/creator-library/page'));
const IndustryNewsPage = lazy(() => import('@/app/marketing/industry-news/page'));
const ContentAssetsPage = lazy(() => import('@/app/marketing/content-assets/page'));
const ContentAssetDetailPage = lazy(() => import('@/app/marketing/content-assets/[assetId]/page'));
const SampleInventoryPage = lazy(() => import('@/app/sample-inventory/page'));
const LiveCenterPage = lazy(() => import('@/app/content/live-center/page'));
const LiveCenterAnalysisResultPage = lazy(
  () => import('@/app/content/live-center/[sessionId]/analysis/[analysisId]/page'),
);
const DocsPage = lazy(() => import('@/app/docs/page'));
const ExportsPage = lazy(() => import('@/app/exports/page'));
const ProfilePage = lazy(() => import('@/app/profile/page'));
const UsersPage = lazy(() => import('@/app/admin/users/page'));
const RolesPage = lazy(() => import('@/app/admin/roles/page'));
const PermissionsPage = lazy(() => import('@/app/admin/permissions/page'));
const AuditLogsPage = lazy(() => import('@/app/admin/audit-logs/page'));
const IndustryMaterialInspirationPage = lazy(() => import('@/app/dashboard/industry-material-inspiration/page'));
const CreatorLiveDashboardPage = lazy(() => import('@/app/dashboard/creator/live/page'));
const CreatorShortVideoDashboardPage = lazy(() => import('@/app/dashboard/creator/short-video/page'));
const CreatorTargetListDashboardPage = lazy(() => import('@/app/dashboard/creator/target-list/page'));
const DashboardPage = lazy(() => import('@/app/dashboard/page'));
const WeeklyReportPage = lazy(() => import('@/app/reports/weekly/page'));
const MonthlyReportPage = lazy(() => import('@/app/reports/monthly/page'));
const DataOpsPage = lazy(() => import('@/app/ops/dataops/page'));

function DocsReferenceFallbackRoute() {
  return <Navigate to={ROUTE_PATHS.docsReferences} replace />;
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-bg-global text-text-secondary">
      页面加载中...
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path={ROUTE_PATHS.home} element={<HomePage />} />
        <Route path={ROUTE_PATHS.login} element={<LoginPage />} />
        <Route path={ROUTE_PATHS.dashboard} element={<DashboardPage />} />
        <Route path={ROUTE_PATHS.dashboardIndustryMaterialInspiration} element={<IndustryMaterialInspirationPage />} />
        <Route
          path={ROUTE_PATHS.dashboardCreator}
          element={<Navigate to={ROUTE_PATHS.dashboardCreatorLive} replace />}
        />
        <Route path={ROUTE_PATHS.dashboardCreatorLive} element={<CreatorLiveDashboardPage />} />
        <Route path={ROUTE_PATHS.dashboardCreatorShortVideo} element={<CreatorShortVideoDashboardPage />} />
        <Route path={ROUTE_PATHS.dashboardCreatorTargetList} element={<CreatorTargetListDashboardPage />} />
        <Route path={ROUTE_PATHS.reportsWeekly} element={<WeeklyReportPage />} />
        <Route path={ROUTE_PATHS.reportsMonthly} element={<MonthlyReportPage />} />
        <Route path={ROUTE_PATHS.opsDataops} element={<DataOpsPage />} />
        <Route path={ROUTE_PATHS.marketing} element={<MarketingPage />} />
        <Route path={ROUTE_PATHS.marketingCreatorLibrary} element={<CreatorLibraryPage />} />
        <Route path={ROUTE_PATHS.marketingIndustryNews} element={<IndustryNewsPage />} />
        <Route path={ROUTE_PATHS.marketingContentAssets} element={<ContentAssetsPage />} />
        <Route path={ROUTE_PATHS.marketingContentAssetDetail} element={<ContentAssetDetailPage />} />
        <Route path={ROUTE_PATHS.sampleInventory} element={<SampleInventoryPage />} />
        <Route path={ROUTE_PATHS.content} element={<Navigate to={ROUTE_PATHS.contentLiveCenter} replace />} />
        <Route path={ROUTE_PATHS.contentLiveCenter} element={<LiveCenterPage />} />
        <Route path={ROUTE_PATHS.contentLiveCenterAnalysis} element={<LiveCenterAnalysisResultPage />} />
        <Route path={ROUTE_PATHS.docs} element={<DocsPage />} />
        <Route path={ROUTE_PATHS.docsGuide} element={<DocsPage />} />
        <Route path={ROUTE_PATHS.docsAnalysisFrameworks} element={<DocsPage />} />
        <Route path={ROUTE_PATHS.docsAnalysisPlans} element={<DocsPage />} />
        <Route path={`${ROUTE_PATHS.docsAnalysisPlans}/:slug`} element={<DocsPage />} />
        <Route path={ROUTE_PATHS.docsReferences} element={<DocsPage />} />
        <Route path={`${ROUTE_PATHS.docs}/references/:slug`} element={<DocsReferenceFallbackRoute />} />
        <Route path={ROUTE_PATHS.exports} element={<ExportsPage />} />
        <Route path={ROUTE_PATHS.profile} element={<ProfilePage />} />
        <Route path={ROUTE_PATHS.adminUsers} element={<UsersPage />} />
        <Route path={ROUTE_PATHS.adminRoles} element={<RolesPage />} />
        <Route path={ROUTE_PATHS.adminPermissions} element={<PermissionsPage />} />
        <Route path={ROUTE_PATHS.adminAuditLogs} element={<AuditLogsPage />} />
        <Route path="*" element={<Navigate to={ROUTE_PATHS.home} replace />} />
      </Routes>
    </Suspense>
  );
}
