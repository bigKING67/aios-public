import type { components, paths } from '@/generated/api/aios-v2';
import type { AuthUser } from './auth-user';

type GatewayPathFor<Path extends keyof paths> = Path extends `/v2${infer RelativePath}` ? RelativePath : never;

type GatewayBasePathFor<Path extends keyof paths, Suffix extends string> =
  GatewayPathFor<Path> extends `${infer BasePath}${Suffix}` ? BasePath : never;

type IndustryMaterialBrandAiBackfillOperation =
  paths['/v2/dashboard/industry-material-inspiration/brand-ai-analysis/backfill']['post'];

type ApiPathIdentifier = string | number;

const ROLE_PATH = '/roles/{role_id}' satisfies GatewayPathFor<'/v2/roles/{role_id}'>;
const ROLE_PERMISSIONS_PATH =
  '/roles/{role_id}/permissions' satisfies GatewayPathFor<'/v2/roles/{role_id}/permissions'>;
const USER_PATH = '/users/{user_id}' satisfies GatewayPathFor<'/v2/users/{user_id}'>;
const USER_ROLES_PATH = '/users/{user_id}/roles' satisfies GatewayPathFor<'/v2/users/{user_id}/roles'>;
const DASHBOARD_NOTE_PATH = '/dashboard/notes/{id}' satisfies GatewayPathFor<'/v2/dashboard/notes/{id}'>;
const REPORT_WEEKLY_PATH = '/reports/weekly/{report_id}' satisfies GatewayPathFor<'/v2/reports/weekly/{report_id}'>;
const REPORT_WEEKLY_METADATA_PATH =
  '/reports/weekly/{report_id}/meta' satisfies GatewayPathFor<'/v2/reports/weekly/{report_id}/meta'>;
const REPORT_WEEKLY_GENERATE_SUMMARY_PATH =
  '/reports/weekly/{report_id}/generate-summary' satisfies GatewayPathFor<'/v2/reports/weekly/{report_id}/generate-summary'>;
const REPORT_WEEKLY_SUMMARY_STATUS_PATH =
  '/reports/weekly/{report_id}/summary-status' satisfies GatewayPathFor<'/v2/reports/weekly/{report_id}/summary-status'>;
const REPORT_WEEKLY_SUMMARY_PATH =
  '/reports/weekly/{report_id}/summary' satisfies GatewayPathFor<'/v2/reports/weekly/{report_id}/summary'>;
const REPORT_MONTHLY_PATH =
  '/reports/monthly/{month_period}' satisfies GatewayPathFor<'/v2/reports/monthly/{month_period}'>;
const REPORT_MONTHLY_METADATA_PATH =
  '/reports/monthly/{month_period}/meta' satisfies GatewayPathFor<'/v2/reports/monthly/{month_period}/meta'>;
const SAMPLE_INVENTORY_SAMPLE_PATH =
  '/sample-inventory/samples/{sample_id}' satisfies GatewayPathFor<'/v2/sample-inventory/samples/{sample_id}'>;
const SAMPLE_INVENTORY_SAMPLE_ADJUSTMENT_PATH =
  '/sample-inventory/samples/{sample_id}/adjustments' satisfies GatewayPathFor<'/v2/sample-inventory/samples/{sample_id}/adjustments'>;
const SAMPLE_INVENTORY_SAMPLE_ARCHIVE_PATH =
  '/sample-inventory/samples/{sample_id}/archive' satisfies GatewayPathFor<'/v2/sample-inventory/samples/{sample_id}/archive'>;
const SAMPLE_INVENTORY_INBOUND_VOID_PATH =
  '/sample-inventory/inbound-records/{inbound_id}/void' satisfies GatewayPathFor<'/v2/sample-inventory/inbound-records/{inbound_id}/void'>;
const SAMPLE_INVENTORY_OUTBOUND_PATH =
  '/sample-inventory/outbound-requests/{request_id}' satisfies GatewayPathFor<'/v2/sample-inventory/outbound-requests/{request_id}'>;
const SAMPLE_INVENTORY_OUTBOUND_TRANSITION_PATH =
  '/sample-inventory/outbound-requests/{request_id}/transition' satisfies GatewayPathFor<'/v2/sample-inventory/outbound-requests/{request_id}/transition'>;
const SAMPLE_INVENTORY_OUTBOUND_TRACKING_PATH =
  '/sample-inventory/outbound-requests/{request_id}/tracking' satisfies GatewayPathFor<'/v2/sample-inventory/outbound-requests/{request_id}/tracking'>;

function interpolatePath(template: string, parameter: string, value: ApiPathIdentifier): string {
  return template.replace(`{${parameter}}`, String(value));
}

function interpolateEncodedPath(template: string, parameter: string, value: ApiPathIdentifier): string {
  return interpolatePath(template, parameter, encodeURIComponent(String(value)));
}

export const AIOS_API_PATHS = {
  auditLogs: '/audit-logs',
  authRegister: '/auth/register',
  sessionLogin: '/auth/session/login',
  sessionLogout: '/auth/session/logout',
  sessionMe: '/auth/session/me',
  sessionRefresh: '/auth/session/refresh',
  changePassword: '/auth/change-password',
  creatorLibrary: '/marketing/creator-library',
  creatorLibraryParseXlsx: '/marketing/creator-library/import/parse-xlsx',
  dashboardDateBounds: '/dashboard/date-bounds',
  dashboardNotes: '/dashboard/notes',
  dashboardNote: (noteId: ApiPathIdentifier) => interpolatePath(DASHBOARD_NOTE_PATH, 'id', noteId),
  industryMaterialInspiration: '/dashboard/industry-material-inspiration',
  industryNewsArticles: '/marketing/industry-news/articles',
  industryNewsSources: '/marketing/industry-news/sources',
  liveCenter: '/content/live-center',
  liveCenterDateBounds: '/content/live-center/date-bounds',
  liveCenterSessions: '/content/live-center/sessions',
  permissions: '/permissions',
  reports: '/reports',
  sampleInventoryAccessPolicy: '/sample-inventory/access-policy',
  sampleInventoryBackup: '/sample-inventory/backup.json',
  sampleInventoryBackupParse: '/sample-inventory/backup/parse',
  sampleInventoryBackupRestore: '/sample-inventory/backup/restore',
  sampleInventorySettings: '/sample-inventory/settings',
  sampleInventorySummary: '/sample-inventory/summary',
  sampleInventorySamples: '/sample-inventory/samples',
  sampleInventorySample: (sampleId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_SAMPLE_PATH, 'sample_id', sampleId),
  sampleInventorySampleAdjustment: (sampleId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_SAMPLE_ADJUSTMENT_PATH, 'sample_id', sampleId),
  sampleInventorySampleArchive: (sampleId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_SAMPLE_ARCHIVE_PATH, 'sample_id', sampleId),
  sampleInventorySampleBatchArchive: '/sample-inventory/samples/batch-archive',
  sampleInventorySampleTemplate: '/sample-inventory/samples/template.xlsx',
  sampleInventorySampleParseXlsx: '/sample-inventory/samples/parse-xlsx',
  sampleInventorySampleImport: '/sample-inventory/samples/import',
  sampleInventorySampleExport: '/sample-inventory/samples/export.xlsx',
  sampleInventoryInbounds: '/sample-inventory/inbound-records',
  sampleInventoryInboundBatch: '/sample-inventory/inbound-records/batch',
  sampleInventoryInboundBatchVoid: '/sample-inventory/inbound-records/batch-void',
  sampleInventoryInboundVoid: (inboundId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_INBOUND_VOID_PATH, 'inbound_id', inboundId),
  sampleInventoryInboundTemplate: '/sample-inventory/inbound-records/template.xlsx',
  sampleInventoryInboundParseXlsx: '/sample-inventory/inbound-records/parse-xlsx',
  sampleInventoryInboundImport: '/sample-inventory/inbound-records/import',
  sampleInventoryInboundExport: '/sample-inventory/inbound-records/export.xlsx',
  sampleInventoryOutbounds: '/sample-inventory/outbound-requests',
  sampleInventoryOutbound: (requestId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_OUTBOUND_PATH, 'request_id', requestId),
  sampleInventoryOutboundBatch: '/sample-inventory/outbound-requests/batch',
  sampleInventoryOutboundTracking: (requestId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_OUTBOUND_TRACKING_PATH, 'request_id', requestId),
  sampleInventoryOutboundBatchTracking: '/sample-inventory/outbound-requests/batch-tracking',
  sampleInventoryOutboundTransition: (requestId: ApiPathIdentifier) =>
    interpolatePath(SAMPLE_INVENTORY_OUTBOUND_TRANSITION_PATH, 'request_id', requestId),
  sampleInventoryOutboundBatchEdit: '/sample-inventory/outbound-requests/batch-edit',
  sampleInventoryOutboundBatchTransition: '/sample-inventory/outbound-requests/batch-transition',
  sampleInventoryOutboundBatchArchive: '/sample-inventory/outbound-requests/batch-archive',
  sampleInventoryOutboundExport: '/sample-inventory/outbound-requests/export.xlsx',
  reportWeeklyByPeriod: '/reports/weekly/by-period',
  reportWeeklyLatestPeriod: '/reports/weekly/latest-period',
  reportWeeklyAllPeriods: '/reports/weekly/all-periods',
  reportWeekly: (reportId: ApiPathIdentifier) => interpolateEncodedPath(REPORT_WEEKLY_PATH, 'report_id', reportId),
  reportWeeklyMetadata: (reportId: ApiPathIdentifier) =>
    interpolateEncodedPath(REPORT_WEEKLY_METADATA_PATH, 'report_id', reportId),
  reportWeeklyGenerateSummary: (reportId: ApiPathIdentifier) =>
    interpolateEncodedPath(REPORT_WEEKLY_GENERATE_SUMMARY_PATH, 'report_id', reportId),
  reportWeeklySummaryStatus: (reportId: ApiPathIdentifier) =>
    interpolateEncodedPath(REPORT_WEEKLY_SUMMARY_STATUS_PATH, 'report_id', reportId),
  reportWeeklySummary: (reportId: ApiPathIdentifier) =>
    interpolateEncodedPath(REPORT_WEEKLY_SUMMARY_PATH, 'report_id', reportId),
  reportMonthlyByPeriod: '/reports/monthly/by-period',
  reportMonthlyLatestPeriod: '/reports/monthly/latest-period',
  reportMonthlyAllPeriods: '/reports/monthly/all-periods',
  reportMonthly: (monthPeriod: ApiPathIdentifier) =>
    interpolateEncodedPath(REPORT_MONTHLY_PATH, 'month_period', monthPeriod),
  reportMonthlyMetadata: (monthPeriod: ApiPathIdentifier) =>
    interpolateEncodedPath(REPORT_MONTHLY_METADATA_PATH, 'month_period', monthPeriod),
  roles: '/roles',
  role: (roleId: ApiPathIdentifier) => interpolatePath(ROLE_PATH, 'role_id', roleId),
  rolePermissions: (roleId: ApiPathIdentifier) => interpolatePath(ROLE_PERMISSIONS_PATH, 'role_id', roleId),
  users: '/users',
  user: (userId: ApiPathIdentifier) => interpolatePath(USER_PATH, 'user_id', userId),
  userRoles: (userId: ApiPathIdentifier) => interpolatePath(USER_ROLES_PATH, 'user_id', userId),
} satisfies {
  auditLogs: GatewayPathFor<'/v2/audit-logs'>;
  authRegister: GatewayPathFor<'/v2/auth/register'>;
  sessionLogin: GatewayPathFor<'/v2/auth/session/login'>;
  sessionLogout: GatewayPathFor<'/v2/auth/session/logout'>;
  sessionMe: GatewayPathFor<'/v2/auth/session/me'>;
  sessionRefresh: GatewayPathFor<'/v2/auth/session/refresh'>;
  changePassword: GatewayPathFor<'/v2/auth/change-password'>;
  creatorLibrary: GatewayPathFor<'/v2/marketing/creator-library'>;
  creatorLibraryParseXlsx: GatewayPathFor<'/v2/marketing/creator-library/import/parse-xlsx'>;
  dashboardDateBounds: GatewayPathFor<'/v2/dashboard/date-bounds'>;
  dashboardNotes: GatewayPathFor<'/v2/dashboard/notes'>;
  dashboardNote: (noteId: ApiPathIdentifier) => string;
  industryMaterialInspiration: GatewayPathFor<'/v2/dashboard/industry-material-inspiration'>;
  industryNewsArticles: GatewayPathFor<'/v2/marketing/industry-news/articles'>;
  industryNewsSources: GatewayPathFor<'/v2/marketing/industry-news/sources'>;
  liveCenter: GatewayBasePathFor<'/v2/content/live-center/sessions', '/sessions'>;
  liveCenterDateBounds: GatewayPathFor<'/v2/content/live-center/date-bounds'>;
  liveCenterSessions: GatewayPathFor<'/v2/content/live-center/sessions'>;
  permissions: GatewayPathFor<'/v2/permissions'>;
  reports: GatewayPathFor<'/v2/reports'>;
  sampleInventoryAccessPolicy: GatewayPathFor<'/v2/sample-inventory/access-policy'>;
  sampleInventoryBackup: GatewayPathFor<'/v2/sample-inventory/backup.json'>;
  sampleInventoryBackupParse: GatewayPathFor<'/v2/sample-inventory/backup/parse'>;
  sampleInventoryBackupRestore: GatewayPathFor<'/v2/sample-inventory/backup/restore'>;
  sampleInventorySettings: GatewayPathFor<'/v2/sample-inventory/settings'>;
  sampleInventorySummary: GatewayPathFor<'/v2/sample-inventory/summary'>;
  sampleInventorySamples: GatewayPathFor<'/v2/sample-inventory/samples'>;
  sampleInventorySample: (sampleId: ApiPathIdentifier) => string;
  sampleInventorySampleAdjustment: (sampleId: ApiPathIdentifier) => string;
  sampleInventorySampleArchive: (sampleId: ApiPathIdentifier) => string;
  sampleInventorySampleBatchArchive: GatewayPathFor<'/v2/sample-inventory/samples/batch-archive'>;
  sampleInventorySampleTemplate: GatewayPathFor<'/v2/sample-inventory/samples/template.xlsx'>;
  sampleInventorySampleParseXlsx: GatewayPathFor<'/v2/sample-inventory/samples/parse-xlsx'>;
  sampleInventorySampleImport: GatewayPathFor<'/v2/sample-inventory/samples/import'>;
  sampleInventorySampleExport: GatewayPathFor<'/v2/sample-inventory/samples/export.xlsx'>;
  sampleInventoryInbounds: GatewayPathFor<'/v2/sample-inventory/inbound-records'>;
  sampleInventoryInboundBatch: GatewayPathFor<'/v2/sample-inventory/inbound-records/batch'>;
  sampleInventoryInboundBatchVoid: GatewayPathFor<'/v2/sample-inventory/inbound-records/batch-void'>;
  sampleInventoryInboundVoid: (inboundId: ApiPathIdentifier) => string;
  sampleInventoryInboundTemplate: GatewayPathFor<'/v2/sample-inventory/inbound-records/template.xlsx'>;
  sampleInventoryInboundParseXlsx: GatewayPathFor<'/v2/sample-inventory/inbound-records/parse-xlsx'>;
  sampleInventoryInboundImport: GatewayPathFor<'/v2/sample-inventory/inbound-records/import'>;
  sampleInventoryInboundExport: GatewayPathFor<'/v2/sample-inventory/inbound-records/export.xlsx'>;
  sampleInventoryOutbounds: GatewayPathFor<'/v2/sample-inventory/outbound-requests'>;
  sampleInventoryOutbound: (requestId: ApiPathIdentifier) => string;
  sampleInventoryOutboundBatch: GatewayPathFor<'/v2/sample-inventory/outbound-requests/batch'>;
  sampleInventoryOutboundTracking: (requestId: ApiPathIdentifier) => string;
  sampleInventoryOutboundBatchTracking: GatewayPathFor<'/v2/sample-inventory/outbound-requests/batch-tracking'>;
  sampleInventoryOutboundTransition: (requestId: ApiPathIdentifier) => string;
  sampleInventoryOutboundBatchEdit: GatewayPathFor<'/v2/sample-inventory/outbound-requests/batch-edit'>;
  sampleInventoryOutboundBatchTransition: GatewayPathFor<'/v2/sample-inventory/outbound-requests/batch-transition'>;
  sampleInventoryOutboundBatchArchive: GatewayPathFor<'/v2/sample-inventory/outbound-requests/batch-archive'>;
  sampleInventoryOutboundExport: GatewayPathFor<'/v2/sample-inventory/outbound-requests/export.xlsx'>;
  reportWeeklyByPeriod: GatewayPathFor<'/v2/reports/weekly/by-period'>;
  reportWeeklyLatestPeriod: GatewayPathFor<'/v2/reports/weekly/latest-period'>;
  reportWeeklyAllPeriods: GatewayPathFor<'/v2/reports/weekly/all-periods'>;
  reportWeekly: (reportId: ApiPathIdentifier) => string;
  reportWeeklyMetadata: (reportId: ApiPathIdentifier) => string;
  reportWeeklyGenerateSummary: (reportId: ApiPathIdentifier) => string;
  reportWeeklySummaryStatus: (reportId: ApiPathIdentifier) => string;
  reportWeeklySummary: (reportId: ApiPathIdentifier) => string;
  reportMonthlyByPeriod: GatewayPathFor<'/v2/reports/monthly/by-period'>;
  reportMonthlyLatestPeriod: GatewayPathFor<'/v2/reports/monthly/latest-period'>;
  reportMonthlyAllPeriods: GatewayPathFor<'/v2/reports/monthly/all-periods'>;
  reportMonthly: (monthPeriod: ApiPathIdentifier) => string;
  reportMonthlyMetadata: (monthPeriod: ApiPathIdentifier) => string;
  roles: GatewayPathFor<'/v2/roles'>;
  role: (roleId: ApiPathIdentifier) => string;
  rolePermissions: (roleId: ApiPathIdentifier) => string;
  users: GatewayPathFor<'/v2/users'>;
  user: (userId: ApiPathIdentifier) => string;
  userRoles: (userId: ApiPathIdentifier) => string;
};

export type SessionLoginRequest = components['schemas']['LoginRequest'];
export type SessionLoginResponse = components['schemas']['SessionLoginResponse'];
export type SessionLogoutResponse = components['schemas']['SessionLogoutResponse'];
export type SessionMeResponse = components['schemas']['SessionMeResponse'];
export type SessionRefreshResponse = components['schemas']['SessionRefreshResponse'];
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];
export type CreatorLibraryItem = components['schemas']['CreatorLibraryItem'];
export type CreatorLibraryFollowLogItem = components['schemas']['CreatorLibraryFollowLogItem'];
export type CreatorLibrarySummary = components['schemas']['CreatorLibrarySummary'];
export type CreatorLibraryFilterOptions = components['schemas']['CreatorLibraryFilterOptions'];
export type CreatorLibraryBdUser = components['schemas']['CreatorLibraryBdUser'];
export type CreatorLibraryListResponse = components['schemas']['CreatorLibraryListResponse'];
export type CreatorLibraryFollowLogListResponse = components['schemas']['CreatorLibraryFollowLogListResponse'];
export type CreatorLibraryXlsxParseResponse = components['schemas']['CreatorLibraryXlsxParseResponse'];
export type DashboardDateBoundsResponse = components['schemas']['DashboardDateBoundsResponse'];
export type DashboardDailyNoteRow = components['schemas']['DashboardDailyNoteRow'];
export type DashboardDailyNotesResponse = components['schemas']['DashboardDailyNotesResponse'];
export type DashboardCreateNoteRequest =
  paths['/v2/dashboard/notes']['post']['requestBody']['content']['application/json'];
export type DashboardUpdateNoteRequest =
  paths['/v2/dashboard/notes/{id}']['patch']['requestBody']['content']['application/json'];
export type IndustryMaterialInspirationResponse = components['schemas']['IndustryMaterialInspirationResponse'];
export type IndustryMaterialBrandAiBackfillRequest =
  IndustryMaterialBrandAiBackfillOperation['requestBody']['content']['application/json'];
export type IndustryMaterialBrandAiBackfillResponse = components['schemas']['IndustryMaterialBrandAiBackfillResponse'];
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
export type UpdateUserRequest = components['schemas']['UpdateUserRequest'];
export type UpdateUserRolesRequest = components['schemas']['UpdateUserRolesRequest'];
export type UserAdminResponse = components['schemas']['UserAdminResponse'];
export type UserListResponse = components['schemas']['UserListResponse'];
export type UserRoleListResponse = components['schemas']['UserRoleListResponse'];
export type UserMessageResponse = components['schemas']['UserMessageResponse'];
export type CreateRoleRequest = components['schemas']['CreateRoleRequest'];
export type UpdateRoleRequest = components['schemas']['UpdateRoleRequest'];
export type UpdateRolePermissionsRequest =
  paths['/v2/roles/{role_id}/permissions']['put']['requestBody']['content']['application/json'];
export type RoleListItem = components['schemas']['RoleListItem'];
export type RoleListResponse = components['schemas']['RoleListResponse'];
export type RoleMessageResponse = components['schemas']['RoleMessageResponse'];
export type PermissionsResponse = paths['/v2/permissions']['get']['responses'][200]['content']['application/json'];
export type AuditLogListResponse = components['schemas']['AuditLogListResponse'];
export type SampleInventoryAccessPolicy = components['schemas']['SampleInventoryAccessPolicyResponse'];
export type SampleInventoryBackupSettings = components['schemas']['SampleInventoryBackupSettings'];
export type SampleInventoryBackupSample = components['schemas']['SampleInventoryBackupSample'];
export type SampleInventoryBackupInbound = components['schemas']['SampleInventoryBackupInbound'];
export type SampleInventoryBackupOutbound = components['schemas']['SampleInventoryBackupOutbound'];
export type SampleInventoryBackupState = components['schemas']['SampleInventoryBackupState'];
export type SampleInventoryBackupFile = components['schemas']['SampleInventoryBackupFile'];
export type SampleInventoryBackupPlanCounts = components['schemas']['SampleInventoryBackupPlanCounts'];
export type ParseSampleInventoryBackupRequest = components['schemas']['ParseSampleInventoryBackupRequest'];
export type SampleInventoryBackupPlanResponse = components['schemas']['SampleInventoryBackupPlanResponse'];
export type RestoreSampleInventoryBackupRequest = components['schemas']['RestoreSampleInventoryBackupRequest'];
export type SampleInventoryBackupRestoreResponse = components['schemas']['SampleInventoryBackupRestoreResponse'];
export type SampleInventorySettings = components['schemas']['SampleInventorySettingsResponse'];
export type UpdateSampleInventorySettingsRequest = components['schemas']['UpdateSampleInventorySettingsRequest'];
export type SampleInventorySample = components['schemas']['SampleInventorySampleItem'];
export type SampleInventorySummary = components['schemas']['SampleInventorySummary'];
export type SampleInventorySampleListResponse = components['schemas']['SampleInventorySampleListResponse'];
export type CreateSampleInventorySampleRequest = components['schemas']['CreateSampleInventorySampleRequest'];
export type UpdateSampleInventorySampleRequest = components['schemas']['UpdateSampleInventorySampleRequest'];
export type SampleInventoryAdjustmentRequest = components['schemas']['SampleInventoryAdjustmentRequest'];
export type ArchiveSampleInventorySampleRequest = components['schemas']['ArchiveSampleInventorySampleRequest'];
export type BatchArchiveSampleInventorySamplesRequest =
  components['schemas']['BatchArchiveSampleInventorySamplesRequest'];
export type SampleInventorySampleBatchMutationResponse =
  components['schemas']['SampleInventorySampleBatchMutationResponse'];
export type SampleInventoryInbound = components['schemas']['SampleInventoryInboundItem'];
export type SampleInventoryInboundListResponse = components['schemas']['SampleInventoryInboundListResponse'];
export type CreateSampleInventoryInboundRequest = components['schemas']['CreateSampleInventoryInboundRequest'];
export type CreateSampleInventoryInboundItem = components['schemas']['CreateSampleInventoryInboundItem'];
export type CreateSampleInventoryInboundBatchRequest =
  components['schemas']['CreateSampleInventoryInboundBatchRequest'];
export type SampleInventoryInboundBatchResponse = components['schemas']['SampleInventoryInboundBatchResponse'];
export type VoidSampleInventoryInboundRequest = components['schemas']['VoidSampleInventoryInboundRequest'];
export type BatchVoidSampleInventoryInboundsRequest = components['schemas']['BatchVoidSampleInventoryInboundsRequest'];
export type SampleInventoryInboundBatchMutationResponse =
  components['schemas']['SampleInventoryInboundBatchMutationResponse'];
export type SampleInventoryOutbound = components['schemas']['SampleInventoryOutboundItem'];
export type SampleInventoryOutboundListResponse = components['schemas']['SampleInventoryOutboundListResponse'];
export type CreateSampleInventoryOutboundRequest = components['schemas']['CreateSampleInventoryOutboundRequest'];
export type CreateSampleInventoryOutboundItem = components['schemas']['CreateSampleInventoryOutboundItem'];
export type CreateSampleInventoryOutboundBatchRequest =
  components['schemas']['CreateSampleInventoryOutboundBatchRequest'];
export type SampleInventoryOutboundBatchResponse = components['schemas']['SampleInventoryOutboundBatchResponse'];
export type UpdateSampleInventoryOutboundRequest = components['schemas']['UpdateSampleInventoryOutboundRequest'];
export type UpdateSampleInventoryOutboundTrackingRequest =
  components['schemas']['UpdateSampleInventoryOutboundTrackingRequest'];
export type BatchUpdateSampleInventoryOutboundTrackingRequest =
  components['schemas']['BatchUpdateSampleInventoryOutboundTrackingRequest'];
export type TransitionSampleInventoryOutboundRequest =
  components['schemas']['TransitionSampleInventoryOutboundRequest'];
export type SampleInventoryVersionTarget = components['schemas']['SampleInventoryVersionTarget'];
export type BatchTransitionSampleInventoryOutboundRequest =
  components['schemas']['BatchTransitionSampleInventoryOutboundRequest'];
export type BatchArchiveSampleInventoryOutboundRequest =
  components['schemas']['BatchArchiveSampleInventoryOutboundRequest'];
export type BatchEditSampleInventoryOutboundRequest = components['schemas']['BatchEditSampleInventoryOutboundRequest'];
export type SampleInventoryBatchMutationResponse = components['schemas']['SampleInventoryBatchMutationResponse'];
export type SampleInventoryImportIssue = components['schemas']['SampleInventoryImportIssue'];
export type SampleInventorySampleImportRow = components['schemas']['SampleInventorySampleImportRow'];
export type SampleInventorySampleXlsxParseResponse = components['schemas']['SampleInventorySampleXlsxParseResponse'];
export type ImportSampleInventorySamplesRequest = components['schemas']['ImportSampleInventorySamplesRequest'];
export type SampleInventorySampleImportResponse = components['schemas']['SampleInventorySampleImportResponse'];
export type SampleInventoryInboundImportRow = components['schemas']['SampleInventoryInboundImportRow'];
export type SampleInventoryInboundXlsxParseResponse = components['schemas']['SampleInventoryInboundXlsxParseResponse'];
export type ImportSampleInventoryInboundsRequest = components['schemas']['ImportSampleInventoryInboundsRequest'];
export type IndustryNewsArticleItem = components['schemas']['IndustryArticleItem'];
export type IndustryNewsArticleSummary = components['schemas']['IndustryArticleSummary'];
export type IndustryNewsArticleSource = components['schemas']['IndustryArticleSource'];
export type IndustryNewsArticleListResponse = components['schemas']['IndustryArticleListResponse'];
export type IndustryNewsArticleSourcesResponse =
  paths['/v2/marketing/industry-news/sources']['get']['responses'][200]['content']['application/json'];
export type LiveCenterSessionItem = components['schemas']['LiveCenterSessionItem'];
export type LiveCenterSessionListResponse = components['schemas']['LiveCenterSessionListResponse'];
export type LiveCenterDateBoundsResponse = components['schemas']['LiveCenterDateBoundsResponse'];
export type LiveCenterMinuteMetric = components['schemas']['LiveCenterMinuteMetric'];
export type LiveCenterRecordingSegment = components['schemas']['LiveCenterRecordingSegment'];
export type LiveCenterRecording = components['schemas']['LiveCenterRecording'];
export type LiveCenterAnalysisJob = components['schemas']['LiveCenterAnalysisJob'];
export type LiveCenterSessionDetailResponse = components['schemas']['LiveCenterSessionDetailResponse'];
export type LiveCenterUploadCreateRequest = components['schemas']['LiveCenterUploadCreateRequest'];
export type LiveCenterUploadCreateResponse = components['schemas']['LiveCenterUploadCreateResponse'];
export type LiveCenterMultipartResumeRequest = components['schemas']['LiveCenterMultipartResumeRequest'];
export type LiveCenterMultipartResumeResponse = components['schemas']['LiveCenterMultipartResumeResponse'];
export type LiveCenterUploadPartUrl = components['schemas']['LiveCenterUploadPartUrl'];
export type LiveCenterUploadCompletePartResponse = components['schemas']['LiveCenterUploadCompletePartResponse'];
export type LiveCenterUploadCompleteRequest = components['schemas']['LiveCenterUploadCompleteRequest'];
export type LiveCenterUploadCompletePartRequest = components['schemas']['LiveCenterUploadCompletePartRequest'];
export type LiveCenterPlaybackUrlResponse = components['schemas']['LiveCenterPlaybackUrlResponse'];
export type LiveCenterRecordingSegmentCleanupResponse =
  components['schemas']['LiveCenterRecordingSegmentCleanupResponse'];
export type LiveCenterAnalysisCreateRequest = components['schemas']['LiveCenterAnalysisCreateRequest'];
export type ReportsListResponse = components['schemas']['ReportsListResponse'];
export type ReportsWeeklyResponse = components['schemas']['WeeklyReportResponse'];
export type ReportsWeeklyMetadata = components['schemas']['WeeklyMetadata'];
export type ReportsWeeklyPeriodsResponse = components['schemas']['WeeklyPeriodsResponse'];
export type ReportsWeeklyLatestPeriodResponse = components['schemas']['WeeklyLatestPeriodResponse'];
export type ReportsWeeklySummaryGenerateRequest = components['schemas']['WeeklySummaryGeneratePayload'];
export type ReportsWeeklySummaryGenerateResponse = components['schemas']['WeeklySummaryGenerateResponse'];
export type ReportsWeeklySummaryStatusResponse = components['schemas']['WeeklySummaryStatusResponse'];
export type ReportsWeeklySummaryContentResponse = components['schemas']['WeeklySummaryContentResponse'];
export type ReportsWeeklySummaryUpdateRequest = components['schemas']['WeeklySummaryManualUpdatePayload'];
export type ReportsMonthlyResponse = components['schemas']['MonthlyReportResponse'];
export type ReportsMonthlyMetadata = components['schemas']['MonthlyMetadata'];
export type ReportsMonthlyPeriodsResponse = components['schemas']['MonthlyPeriodsResponse'];
export type ReportsMonthlyLatestPeriodResponse = components['schemas']['MonthlyLatestPeriodResponse'];

export function authUserFromSession(user: components['schemas']['SessionUserResponse']): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name ?? undefined,
    roles: user.roles,
    is_active: user.is_active,
  };
}
