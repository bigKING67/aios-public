import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AiosGlobalFrame } from '@/components/organisms/aios-global-frame';
import { resolveModuleProfileRedirect } from '@/lib/module-profile';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

// The BQL profile keeps legacy data clients out of the bundle. Navigation stays
// available; disconnected modules render their explicit data-onboarding state.
const FULL_PROFILE_BUILD = process.env.VITE_AIOS_MODULE_PROFILE !== 'ai_studio';

const NotConnected = lazy(() => import('@/components/organisms/module-not-connected').then((module) => ({ default: module.ModuleNotConnected })));

const HomePage = lazy(() => import('@/app/page'));
const LoginPage = lazy(() => import('@/app/login/page'));
const MarketingPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/marketing/page')) : NotConnected;
const CreatorLibraryPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/marketing/creator-library/page')) : NotConnected;
const IndustryNewsPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/marketing/industry-news/page')) : NotConnected;
const ContentAssetsPage = lazy(() => import('@/app/marketing/content-assets/page'));
const ContentAssetDetailPage = lazy(() => import('@/app/marketing/content-assets/[assetId]/page'));
const SampleInventoryPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/sample-inventory/page')) : NotConnected;
const LiveCenterPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/content/live-center/page')) : NotConnected;
const LiveCenterAnalysisResultPage = FULL_PROFILE_BUILD ? lazy(
  () => import('@/app/content/live-center/[sessionId]/analysis/[analysisId]/page'),
) : NotConnected;
const AiStudioHomePage = lazy(() => import('@/app/content/ai-studio/page'));
const AiStudioAssetsPage = lazy(() => import('@/app/content/ai-studio/assets/page'));
const AiStudioSegmentsPage = lazy(() => import('@/app/content/ai-studio/segments/page'));
const AiStudioSellingPointsPage = lazy(() => import('@/app/content/ai-studio/selling-points/page'));
const AiStudioOutputsPage = lazy(() => import('@/app/content/ai-studio/outputs/page'));
const AiStudioAnalysisPage = lazy(() => import('@/app/content/ai-studio/analysis/page'));
const AiStudioEditingPage = lazy(() => import('@/app/content/ai-studio/editing/page'));
const AiStudioEditingRunPage = lazy(() => import('@/app/content/ai-studio/editing/[runId]/page'));
const AiStudioTrendsPage = lazy(() => import('@/app/content/ai-studio/trends/page'));
const AiStudioTeamOutputPage = lazy(() => import('@/app/content/ai-studio/team-output/page'));
const AiStudioCompetitorPage = lazy(() => import('@/app/content/ai-studio/competitor/page'));
const DocsPage = lazy(() => import('@/app/docs/page'));
const ExportsPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/exports/page')) : NotConnected;
const ProfilePage = lazy(() => import('@/app/profile/page'));
const UsersPage = lazy(() => import('@/app/admin/users/page'));
const RolesPage = lazy(() => import('@/app/admin/roles/page'));
const PermissionsPage = lazy(() => import('@/app/admin/permissions/page'));
const AuditLogsPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/admin/audit-logs/page')) : NotConnected;
const RecruitingPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/admin/recruiting/page')) : NotConnected;
// Candidate intake is public in both deployments and has no legacy data client.
const JoinAiInternPage = lazy(() => import('@/app/join/ai-intern/page'));
const IndustryMaterialInspirationPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/dashboard/industry-material-inspiration/page')) : NotConnected;
const CreatorLiveDashboardPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/dashboard/creator/live/page')) : NotConnected;
const CreatorShortVideoDashboardPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/dashboard/creator/short-video/page')) : NotConnected;
const CreatorTargetListDashboardPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/dashboard/creator/target-list/page')) : NotConnected;
const DashboardPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/dashboard/page')) : NotConnected;
const WeeklyReportPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/reports/weekly/page')) : NotConnected;
const MonthlyReportPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/reports/monthly/page')) : NotConnected;
const DataOpsPage = FULL_PROFILE_BUILD ? lazy(() => import('@/app/ops/dataops/page')) : NotConnected;

function DocsReferenceFallbackRoute() {
  return <Navigate to={ROUTE_PATHS.docsReferences} replace />;
}

/** 爆款打法 was folded into 爆款分析; old links keep their category/period query. */
function AiStudioPatternsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`${ROUTE_PATHS.contentAiStudioCompetitor}${search}`} replace />;
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-[var(--aios-workspace-height,100dvh)] flex items-center justify-center bg-bg-global text-text-secondary">
      页面加载中...
    </div>
  );
}

// Known console routes remain accessible in the BQL profile. Unsupported routes
// return to AI 创作中心; legacy data pages never mount in this build.
function ModuleProfileGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const redirect = resolveModuleProfileRedirect(pathname);
  return redirect ? <Navigate to={redirect} replace /> : children;
}

export function AppRoutes() {
  return (
    <ModuleProfileGuard>
      <AiosGlobalFrame>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path={ROUTE_PATHS.home} element={<HomePage />} />
            <Route path={ROUTE_PATHS.login} element={<LoginPage />} />
            <Route path={ROUTE_PATHS.joinAiIntern} element={<JoinAiInternPage />} />
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
            {/* 内容中台 opens on AI 创作中心, the module every account can open. */}
            <Route path={ROUTE_PATHS.content} element={<Navigate to={ROUTE_PATHS.contentAiStudio} replace />} />
            <Route path={ROUTE_PATHS.contentLiveCenter} element={<LiveCenterPage />} />
            <Route path={ROUTE_PATHS.contentLiveCenterAnalysis} element={<LiveCenterAnalysisResultPage />} />
            <Route path={ROUTE_PATHS.contentAiStudio} element={<AiStudioHomePage />} />
            <Route path={ROUTE_PATHS.contentAiStudioAssets} element={<AiStudioAssetsPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioSegments} element={<AiStudioSegmentsPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioSellingPoints} element={<AiStudioSellingPointsPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioOutputs} element={<AiStudioOutputsPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioAnalysis} element={<AiStudioAnalysisPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioEditing} element={<AiStudioEditingPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioEditingRun} element={<AiStudioEditingRunPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioCompetitor} element={<AiStudioCompetitorPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioTrends} element={<AiStudioTrendsPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioTeamOutput} element={<AiStudioTeamOutputPage />} />
            <Route path={ROUTE_PATHS.contentAiStudioPatterns} element={<AiStudioPatternsRedirect />} />
            <Route path={ROUTE_PATHS.docs} element={<DocsPage />} />
            <Route path={ROUTE_PATHS.docsGuide} element={<DocsPage />} />
            <Route path={`${ROUTE_PATHS.docsGuide}/:slug`} element={<DocsPage />} />
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
            <Route path={ROUTE_PATHS.adminRecruiting} element={<RecruitingPage />} />
            <Route path="*" element={<Navigate to={ROUTE_PATHS.home} replace />} />
          </Routes>
        </Suspense>
      </AiosGlobalFrame>
    </ModuleProfileGuard>
  );
}
