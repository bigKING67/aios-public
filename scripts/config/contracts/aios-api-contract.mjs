export const AIOS_OPENAPI_PATH = 'contracts/openapi/aios-v2.json';
export const AIOS_GENERATED_TYPES_PATH = 'apps/web-vite/src/generated/api/aios-v2.ts';
export const AIOS_API_VERSION_PREFIX = '/v2';

const CREATOR_LIBRARY_BOOLEAN_QUERY_VALUES = Object.freeze([
  'true', '1', 'yes', 'y', '是', '可合作',
  'false', '0', 'no', 'n', '否', '不可合作',
]);

const CREATOR_LIBRARY_SORT_VALUES = Object.freeze([
  'owner_priority_desc',
  'updated_at_desc',
  'updated_at_asc',
  'identity_asc',
  'identity_desc',
  'name_asc',
  'name_desc',
  'platform_asc',
  'platform_desc',
  'fans_desc',
  'fans_asc',
  'anchor_tag_asc',
  'anchor_tag_desc',
  'anchor_level_asc',
  'anchor_level_desc',
  'sales_30d_desc',
  'sales_30d_asc',
  'sales_90d_desc',
  'sales_90d_asc',
  'status_asc',
  'status_desc',
  'owner_asc',
  'owner_desc',
  'last_follow_asc',
  'last_follow_desc',
]);

const DASHBOARD_NOTE_PLATFORM_VALUES = Object.freeze(['taobao', 'douyin', 'xhs', 'jd', 'wx']);
const DASHBOARD_NOTE_QUERY_PLATFORM_VALUES = Object.freeze([
  'overview',
  ...DASHBOARD_NOTE_PLATFORM_VALUES,
]);

const DASHBOARD_NOTE_TEXT_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 67,
});

const DASHBOARD_NOTE_METRIC_KEY_SCHEMA = Object.freeze({
  anyOf: [
    { type: 'string', maxLength: 32 },
    { type: 'null' },
  ],
});

export const AIOS_RUST_ROUTE_SOURCES = Object.freeze([
  { file: 'backend-rust/src/auth/mod.rs', prefix: '/auth', tag: 'auth' },
  { file: 'backend-rust/src/audit_logs/mod.rs', prefix: '/audit-logs', tag: 'audit-logs' },
  { file: 'backend-rust/src/dataops/routes.rs', prefix: '/dataops', tag: 'dataops' },
  { file: 'backend-rust/src/content_live_center/handlers.rs', prefix: '/content/live-center', tag: 'content-live-center' },
  { file: 'backend-rust/src/dashboard.rs', prefix: '/dashboard', tag: 'dashboard' },
  { file: 'backend-rust/src/marketing/handlers/mod.rs', prefix: '/marketing/creator-library', tag: 'creator-library' },
  { file: 'backend-rust/src/marketing/content_assets/production/mod.rs', prefix: '/marketing/content-assets', tag: 'content-production' },
  { file: 'backend-rust/src/marketing/content_assets/handlers.rs', prefix: '/marketing/content-assets', tag: 'content-assets' },
  { file: 'backend-rust/src/marketing/industry_news/handlers.rs', prefix: '/marketing/industry-news', tag: 'industry-news' },
  { file: 'backend-rust/src/permissions/mod.rs', prefix: '/permissions', tag: 'permissions' },
  { file: 'backend-rust/src/roles/mod.rs', prefix: '/roles', tag: 'roles' },
  { file: 'backend-rust/src/users/handlers/mod.rs', prefix: '/users', tag: 'users' },
  { file: 'backend-rust/src/reports/handlers.rs', prefix: '/reports', tag: 'reports' },
  { file: 'backend-rust/src/sample_inventory/handlers.rs', prefix: '/sample-inventory', tag: 'sample-inventory' },
]);

export const AIOS_RUST_SCHEMA_SOURCES = Object.freeze([
  {
    file: 'backend-rust/src/auth/types.rs',
    names: [
      'LoginRequest',
      'ChangePasswordRequest',
      'SessionUserResponse',
      'SessionLoginResponse',
      'SessionRefreshResponse',
      'SessionLogoutResponse',
      'SessionMeResponse',
    ],
  },
  {
    file: 'backend-rust/src/marketing/creator_library_xlsx/types.rs',
    names: ['CreatorLibraryXlsxParseResponse'],
  },
  {
    file: 'backend-rust/src/users/types.rs',
    names: [
      { name: 'CreateUserRequest', request: true },
      { name: 'UpdateUserRequest', request: true },
      { name: 'UpdateUserRolesRequest', request: true },
      'UserAdminResponse',
      'UserListResponse',
      'UserRoleItem',
      'UserRoleListResponse',
      { source: 'MessageResponse', name: 'UserMessageResponse' },
    ],
  },
  {
    file: 'backend-rust/src/roles/types.rs',
    names: [
      { name: 'CreateRoleRequest', request: true },
      { name: 'UpdateRoleRequest', request: true },
      { name: 'UpdateRolePermissionsRequest', request: true },
      'RoleListItem',
      'RoleListResponse',
      { source: 'MessageResponse', name: 'RoleMessageResponse' },
    ],
  },
  {
    file: 'backend-rust/src/permissions/types.rs',
    names: ['PermissionItem', 'PermissionListResponse'],
  },
  {
    file: 'backend-rust/src/audit_logs/types.rs',
    names: ['AuditLogItem', 'AuditLogListResponse'],
  },
  {
    file: 'backend-rust/src/sample_inventory/types.rs',
    names: [
      'SampleInventoryAccessPolicyResponse',
      'SampleInventorySettingsResponse',
      { name: 'UpdateSampleInventorySettingsRequest', request: true },
      'SampleInventorySampleItem',
      'SampleInventorySummary',
      'SampleInventorySampleListResponse',
      { name: 'CreateSampleInventorySampleRequest', request: true },
      { name: 'UpdateSampleInventorySampleRequest', request: true },
      { name: 'SampleInventoryAdjustmentRequest', request: true },
      { name: 'ArchiveSampleInventorySampleRequest', request: true },
      { name: 'BatchArchiveSampleInventorySamplesRequest', request: true },
      'SampleInventorySampleBatchMutationResponse',
      'SampleInventoryInboundItem',
      'SampleInventoryInboundListResponse',
      { name: 'CreateSampleInventoryInboundRequest', request: true },
      { name: 'CreateSampleInventoryInboundItem', request: true },
      { name: 'CreateSampleInventoryInboundBatchRequest', request: true },
      { name: 'VoidSampleInventoryInboundRequest', request: true },
      'SampleInventoryInboundBatchResponse',
      { name: 'BatchVoidSampleInventoryInboundsRequest', request: true },
      'SampleInventoryInboundBatchMutationResponse',
      'SampleInventoryOutboundItem',
      'SampleInventoryOutboundListResponse',
      { name: 'CreateSampleInventoryOutboundRequest', request: true },
      { name: 'CreateSampleInventoryOutboundItem', request: true },
      { name: 'CreateSampleInventoryOutboundBatchRequest', request: true },
      'SampleInventoryOutboundBatchResponse',
      { name: 'UpdateSampleInventoryOutboundRequest', request: true },
      { name: 'UpdateSampleInventoryOutboundTrackingRequest', request: true },
      { name: 'BatchUpdateSampleInventoryOutboundTrackingItem', request: true },
      { name: 'BatchUpdateSampleInventoryOutboundTrackingRequest', request: true },
      { name: 'TransitionSampleInventoryOutboundRequest', request: true },
      { name: 'SampleInventoryVersionTarget', request: true },
      { name: 'BatchTransitionSampleInventoryOutboundRequest', request: true },
      { name: 'BatchArchiveSampleInventoryOutboundRequest', request: true },
      { name: 'BatchEditSampleInventoryOutboundItem', request: true },
      { name: 'BatchEditSampleInventoryOutboundRequest', request: true },
      'SampleInventoryBatchMutationResponse',
      'SampleInventoryImportIssue',
      'SampleInventorySampleImportRow',
      'SampleInventorySampleXlsxParseResponse',
      { name: 'ImportSampleInventorySamplesRequest', request: true },
      'SampleInventorySampleImportResponse',
      'SampleInventoryInboundImportRow',
      'SampleInventoryInboundXlsxParseResponse',
      { name: 'ImportSampleInventoryInboundsRequest', request: true },
    ],
  },
  {
    file: 'backend-rust/src/sample_inventory/types/backup.rs',
    names: [
      { name: 'SampleInventoryBackupSettings', request: true },
      { name: 'SampleInventoryBackupSample', request: true },
      { name: 'SampleInventoryBackupInbound', request: true },
      { name: 'SampleInventoryBackupOutbound', request: true },
      { name: 'SampleInventoryBackupState', request: true },
      { name: 'SampleInventoryBackupFile', request: true },
      'SampleInventoryBackupPlanCounts',
      { name: 'ParseSampleInventoryBackupRequest', request: true },
      'SampleInventoryBackupPlanResponse',
      { name: 'RestoreSampleInventoryBackupRequest', request: true },
      'SampleInventoryBackupRestoreResponse',
    ],
  },
  {
    file: 'backend-rust/src/marketing/types/items.rs',
    names: [
      'CreatorLibraryItem',
      'CreatorLibraryFollowLogItem',
      'CreatorLibrarySummary',
      'CreatorLibraryFilterOptions',
      'CreatorLibraryBdUser',
    ],
  },
  {
    file: 'backend-rust/src/marketing/types/responses.rs',
    names: ['CreatorLibraryListResponse', 'CreatorLibraryFollowLogListResponse'],
  },
  {
    file: 'backend-rust/src/marketing/industry_news/types.rs',
    names: [
      'IndustryArticleItem',
      'IndustryArticleSummary',
      'IndustryArticleSource',
      'IndustryArticleListResponse',
    ],
  },
  {
    file: 'backend-rust/src/content_live_center/types.rs',
    names: [
      'LiveCenterSessionItem',
      'LiveCenterSessionListResponse',
      'LiveCenterDateBoundsResponse',
      'LiveCenterMinuteMetric',
      'LiveCenterRecordingSegment',
      'LiveCenterRecording',
      'LiveCenterAnalysisJob',
      'LiveCenterSessionDetailResponse',
      { name: 'LiveCenterUploadCreateRequest', request: true },
      'LiveCenterUploadCreateResponse',
      { name: 'LiveCenterMultipartResumeRequest', request: true },
      'LiveCenterMultipartResumeResponse',
      'LiveCenterUploadPartUrl',
      'LiveCenterUploadCompletePartResponse',
      { name: 'LiveCenterUploadCompleteRequest', request: true },
      { name: 'LiveCenterUploadCompletePartRequest', request: true },
      'LiveCenterPlaybackUrlResponse',
      'LiveCenterRecordingSegmentCleanupResponse',
      { name: 'LiveCenterAnalysisCreateRequest', request: true },
    ],
  },
  {
    file: 'backend-rust/src/dashboard/industry_material_inspiration.rs',
    names: [
      'IndustryMaterialInspirationResponse',
      { name: 'IndustryMaterialBrandAiBackfillRequest', request: true },
      'IndustryMaterialBrandAiBackfillBrand',
      'IndustryMaterialBrandAiBackfillResponse',
    ],
  },
  {
    file: 'backend-rust/src/dashboard/industry_material_inspiration/brand_ai_worker_trigger.rs',
    names: ['BrandAiBackfillWorkerTrigger'],
  },
  {
    file: 'backend-rust/src/dashboard/date_bounds.rs',
    names: ['DashboardDateBoundsResponse'],
  },
  {
    file: 'backend-rust/src/dashboard/notes/model.rs',
    names: [
      { name: 'CreateDashboardNoteRequest', request: true },
      { name: 'UpdateDashboardNoteRequest', request: true },
      'DashboardDailyNoteRow',
      'DashboardDailyNotesResponse',
    ],
  },
  {
    file: 'backend-rust/src/reports/types/common.rs',
    names: [
      'Kpi',
      'TrendPoint',
      'TrendData',
      'PlatformData',
      'PeriodOption',
      'ReportListItem',
      'ReportsListResponse',
    ],
  },
  {
    file: 'backend-rust/src/reports/types/goods.rs',
    names: [
      'ProductAttributionItem',
      'GoodsAttributionData',
      'GoodsChannelAttributionItem',
      'GoodsChannelAttributionData',
      'GoodsChannelFunnelMetricItem',
      'GoodsChannelDriverContribution',
      'GoodsChannelQuantAttributionByChannel',
      'GoodsChannelSelectionDetail',
      'GoodsChannelFunnelDiagnosisData',
    ],
  },
  {
    file: 'backend-rust/src/reports/types/weekly.rs',
    names: [
      'WeeklyMetadata',
      'WeeklyCharts',
      'WeeklyReportResponse',
      'WeeklyPeriodsResponse',
      'WeeklyLatestPeriodResponse',
    ],
  },
  {
    file: 'backend-rust/src/reports/types/monthly.rs',
    names: [
      'MonthlyMetadata',
      'MonthlyCharts',
      'MonthlyReportResponse',
      'MonthlyPeriodsResponse',
      'MonthlyLatestPeriodResponse',
    ],
  },
  {
    file: 'backend-rust/src/reports/types/summary.rs',
    names: [
      { name: 'WeeklySummaryGeneratePayload', request: true },
      { name: 'WeeklySummaryManualUpdatePayload', request: true },
      'Conclusions',
      'WeeklySummaryGenerateResponse',
      'WeeklySummaryStatusResponse',
      'WeeklySummaryContentResponse',
    ],
  },
]);

export const AIOS_TYPED_OPERATION_OVERRIDES = Object.freeze({
  'POST /v2/auth/session/login': { request: 'LoginRequest', response: 'SessionLoginResponse' },
  'POST /v2/auth/session/refresh': { response: 'SessionRefreshResponse' },
  'POST /v2/auth/session/logout': { response: 'SessionLogoutResponse' },
  'GET /v2/auth/session/me': { response: 'SessionMeResponse' },
  'POST /v2/auth/change-password': { request: 'ChangePasswordRequest' },
  'GET /v2/reports': {
    queryParameters: [
      { name: 'report_type', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
      { name: 'offset', in: 'query', required: false, schema: { type: 'integer' } },
    ],
    response: 'ReportsListResponse',
  },
  'GET /v2/reports/weekly/by-period': {
    queryParameters: [
      { name: 'week_period', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: 'WeeklyReportResponse',
  },
  'GET /v2/reports/weekly/latest-period': { response: 'WeeklyLatestPeriodResponse' },
  'GET /v2/reports/weekly/all-periods': {
    queryParameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
    ],
    response: 'WeeklyPeriodsResponse',
  },
  'GET /v2/reports/weekly/{report_id}/meta': {
    queryParameters: [
      { name: 'week_period', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'WeeklyMetadata',
  },
  'GET /v2/reports/weekly/{report_id}': {
    queryParameters: [
      { name: 'week_period', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'WeeklyReportResponse',
  },
  'POST /v2/reports/weekly/{report_id}/generate-summary': {
    request: 'WeeklySummaryGeneratePayload',
    response: 'WeeklySummaryGenerateResponse',
  },
  'GET /v2/reports/weekly/{report_id}/summary-status': {
    queryParameters: [
      { name: 'week_period', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'summary_scope', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'WeeklySummaryStatusResponse',
  },
  'GET /v2/reports/weekly/{report_id}/summary': {
    queryParameters: [
      { name: 'week_period', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'summary_scope', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'WeeklySummaryContentResponse',
  },
  'PUT /v2/reports/weekly/{report_id}/summary': {
    request: 'WeeklySummaryManualUpdatePayload',
    response: 'WeeklySummaryContentResponse',
  },
  'GET /v2/reports/monthly/by-period': {
    queryParameters: [
      { name: 'month_period', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: 'MonthlyReportResponse',
  },
  'GET /v2/reports/monthly/latest-period': { response: 'MonthlyLatestPeriodResponse' },
  'GET /v2/reports/monthly/all-periods': {
    queryParameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
    ],
    response: 'MonthlyPeriodsResponse',
  },
  'GET /v2/reports/monthly/{month_period}/meta': { response: 'MonthlyMetadata' },
  'GET /v2/reports/monthly/{month_period}': { response: 'MonthlyReportResponse' },
  'POST /v2/marketing/creator-library/import/parse-xlsx': {
    multipartRequest: { field: 'file' },
    response: 'CreatorLibraryXlsxParseResponse',
  },
  'GET /v2/marketing/creator-library': {
    queryParameters: [
      { name: 'keyword', in: 'query', required: false, schema: { type: 'string', maxLength: 500 } },
      { name: 'platform', in: 'query', required: false, schema: { type: 'string', maxLength: 500 } },
      { name: 'category', in: 'query', required: false, schema: { type: 'string', maxLength: 500 } },
      { name: 'anchor_tag', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'anchor_tags', in: 'query', required: false, schema: { type: 'string' } },
      {
        name: 'fans_band',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          enum: ['lt_10w', '10w_50w', '50w_100w', '100w_500w', 'gte_500w'],
        },
      },
      { name: 'anchor_level', in: 'query', required: false, schema: { type: 'string' } },
      {
        name: 'cooperation_status',
        in: 'query',
        required: false,
        schema: { type: 'string', maxLength: 500 },
      },
      { name: 'owner_name', in: 'query', required: false, schema: { type: 'string', maxLength: 500 } },
      {
        name: 'owner_user_id',
        in: 'query',
        required: false,
        schema: { type: 'string', maxLength: 500 },
      },
      {
        name: 'last_follow_range',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['none', 'over_30d', 'over_14d', 'within_7d'] },
      },
      {
        name: 'is_cooperable',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: CREATOR_LIBRARY_BOOLEAN_QUERY_VALUES },
      },
      {
        name: 'source_type',
        in: 'query',
        required: false,
        schema: { type: 'string', maxLength: 500 },
      },
      {
        name: 'ownership',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['public_seed', 'mine', 'others'] },
      },
      {
        name: 'mcn_status',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['registered', 'missing'] },
      },
      {
        name: 'include_filter_options',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: CREATOR_LIBRARY_BOOLEAN_QUERY_VALUES },
      },
      {
        name: 'include_summary',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: CREATOR_LIBRARY_BOOLEAN_QUERY_VALUES },
      },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
      { name: 'page_size', in: 'query', required: false, schema: { type: 'integer' } },
      {
        name: 'sort',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: CREATOR_LIBRARY_SORT_VALUES },
      },
    ],
    response: 'CreatorLibraryListResponse',
  },
  'GET /v2/marketing/creator-library/filter-options': {
    response: 'CreatorLibraryFilterOptions',
  },
  'GET /v2/marketing/creator-library/{id}/follow-logs': {
    response: 'CreatorLibraryFollowLogListResponse',
  },
  'POST /v2/auth/register': { request: 'CreateUserRequest', response: 'UserAdminResponse' },
  'GET /v2/users': { response: 'UserListResponse' },
  'PUT /v2/users/{user_id}': { request: 'UpdateUserRequest', response: 'UserAdminResponse' },
  'DELETE /v2/users/{user_id}': { response: 'UserMessageResponse' },
  'GET /v2/users/{user_id}/roles': { response: 'UserRoleListResponse' },
  'PUT /v2/users/{user_id}/roles': {
    request: 'UpdateUserRolesRequest',
    response: 'UserRoleListResponse',
  },
  'GET /v2/roles': { response: 'RoleListResponse' },
  'POST /v2/roles': { request: 'CreateRoleRequest', response: 'RoleListItem' },
  'PUT /v2/roles/{role_id}': { request: 'UpdateRoleRequest', response: 'RoleListItem' },
  'DELETE /v2/roles/{role_id}': { response: 'RoleMessageResponse' },
  'PUT /v2/roles/{role_id}/permissions': {
    request: 'UpdateRolePermissionsRequest',
    requestSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['permission_ids'],
      properties: {
        permission_ids: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'integer', minimum: 1 },
              { type: 'string', pattern: '^[1-9][0-9]*$' },
            ],
          },
        },
      },
    },
    response: 'RoleMessageResponse',
  },
  'GET /v2/permissions': {
    queryParameters: [
      { name: 'grouped', in: 'query', required: false, schema: { type: 'boolean' } },
    ],
    responseSchema: {
      oneOf: [
        { $ref: '#/components/schemas/PermissionListResponse' },
        {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { $ref: '#/components/schemas/PermissionItem' },
          },
        },
      ],
    },
  },
  'GET /v2/audit-logs': {
    queryParameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
      { name: 'page_size', in: 'query', required: false, schema: { type: 'integer' } },
      { name: 'module', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'action', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'keyword', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'AuditLogListResponse',
  },
  'GET /v2/marketing/industry-news/articles': {
    queryParameters: [
      { name: 'keyword', in: 'query', required: false, schema: { type: 'string', maxLength: 100 } },
      { name: 'source_fakeid', in: 'query', required: false, schema: { type: 'string', maxLength: 200 } },
      { name: 'date_from', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
      { name: 'date_to', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
      {
        name: 'content_status',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['list_only', 'content_fetched', 'content_failed'] },
      },
      {
        name: 'has_content',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['1', 'true', 'yes', '0', 'false', 'no'] },
      },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10000 } },
      { name: 'page_size', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
      {
        name: 'sort',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          enum: ['publish_time_desc', 'fetched_at_desc', 'source_publish_time_desc', 'relevance'],
        },
      },
    ],
    response: 'IndustryArticleListResponse',
  },
  'GET /v2/marketing/industry-news/sources': {
    responseSchema: {
      type: 'array',
      items: { $ref: '#/components/schemas/IndustryArticleSource' },
    },
  },
  'GET /v2/dashboard/date-bounds': {
    queryParameters: [
      { name: 'platform', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'dimension', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'DashboardDateBoundsResponse',
  },
  'GET /v2/dashboard/notes': {
    queryParameters: [
      { name: 'start_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
      { name: 'end_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
      {
        name: 'platform',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: DASHBOARD_NOTE_QUERY_PLATFORM_VALUES },
      },
      { name: 'include_rows', in: 'query', required: false, schema: { type: 'string', enum: ['0', '1'] } },
      { name: 'note_date', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
    ],
    response: 'DashboardDailyNotesResponse',
  },
  'POST /v2/dashboard/notes': {
    request: 'CreateDashboardNoteRequest',
    requestSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['note_date', 'platform', 'action_text', 'reason_text', 'summary_text'],
      properties: {
        note_date: { type: 'string', format: 'date' },
        platform: { type: 'string', enum: DASHBOARD_NOTE_PLATFORM_VALUES },
        metric_key: DASHBOARD_NOTE_METRIC_KEY_SCHEMA,
        action_text: DASHBOARD_NOTE_TEXT_SCHEMA,
        reason_text: DASHBOARD_NOTE_TEXT_SCHEMA,
        summary_text: DASHBOARD_NOTE_TEXT_SCHEMA,
      },
    },
    response: 'DashboardDailyNoteRow',
    successStatus: 201,
  },
  'PATCH /v2/dashboard/notes/{id}': {
    request: 'UpdateDashboardNoteRequest',
    requestSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        metric_key: DASHBOARD_NOTE_METRIC_KEY_SCHEMA,
        action_text: DASHBOARD_NOTE_TEXT_SCHEMA,
        reason_text: DASHBOARD_NOTE_TEXT_SCHEMA,
        summary_text: DASHBOARD_NOTE_TEXT_SCHEMA,
      },
    },
    response: 'DashboardDailyNoteRow',
  },
  'DELETE /v2/dashboard/notes/{id}': {
    emptyResponse: true,
    successStatus: 204,
  },
  'GET /v2/dashboard/industry-material-inspiration': {
    queryParameters: [
      {
        name: 'tab',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          enum: [
            'douyin_live_lead_short_video',
            'douyin_goods_short_video',
            'xhs_note',
          ],
        },
      },
      {
        name: 'month',
        in: 'query',
        required: false,
        schema: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      },
      { name: 'brand', in: 'query', required: false, schema: { type: 'string' } },
    ],
    response: 'IndustryMaterialInspirationResponse',
  },
  'POST /v2/dashboard/industry-material-inspiration/brand-ai-analysis/backfill': {
    request: 'IndustryMaterialBrandAiBackfillRequest',
    requestSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['tab', 'month', 'brand'],
      properties: {
        tab: {
          type: 'string',
          enum: ['douyin_live_lead_short_video', 'douyin_goods_short_video'],
        },
        month: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
        brand: { type: 'string', minLength: 1, not: { const: 'all' } },
        source: {
          anyOf: [
            { type: 'string', enum: ['preview', 'raw', 'auto'] },
            { type: 'null' },
          ],
        },
        profile: {
          anyOf: [
            { type: 'string', enum: ['preview_fast', 'raw_deep', 'action_detail'] },
            { type: 'null' },
          ],
        },
        limit: {
          anyOf: [
            { type: 'integer', minimum: 1, maximum: 100 },
            { type: 'null' },
          ],
        },
      },
    },
    response: 'IndustryMaterialBrandAiBackfillResponse',
  },
  'GET /v2/content/live-center/date-bounds': {
    response: 'LiveCenterDateBoundsResponse',
  },
  'GET /v2/content/live-center/sessions': {
    queryParameters: [
      {
        name: 'keyword',
        in: 'query',
        required: false,
        schema: { type: 'string', maxLength: 120 },
      },
      { name: 'shopId', in: 'query', required: false, schema: { type: 'string', maxLength: 80 } },
      {
        name: 'anchorDouyinId',
        in: 'query',
        required: false,
        schema: { type: 'string', maxLength: 120 },
      },
      { name: 'startDate', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
      { name: 'endDate', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 10000 },
      },
      {
        name: 'pageSize',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
    ],
    response: 'LiveCenterSessionListResponse',
  },
  'GET /v2/content/live-center/sessions/{session_id}': {
    response: 'LiveCenterSessionDetailResponse',
  },
  'POST /v2/content/live-center/sessions/{session_id}/recordings/uploads': {
    request: 'LiveCenterUploadCreateRequest',
    response: 'LiveCenterUploadCreateResponse',
  },
  'POST /v2/content/live-center/recordings/{recording_id}/segments/{segment_id}/complete': {
    request: 'LiveCenterUploadCompleteRequest',
    response: 'LiveCenterRecordingSegment',
  },
  'POST /v2/content/live-center/recordings/{recording_id}/segments/{segment_id}/multipart/resume': {
    request: 'LiveCenterMultipartResumeRequest',
    response: 'LiveCenterMultipartResumeResponse',
  },
  'POST /v2/content/live-center/recordings/{recording_id}/segments/{segment_id}/playback-url': {
    response: 'LiveCenterPlaybackUrlResponse',
  },
  'POST /v2/content/live-center/recordings/{recording_id}/segments/{segment_id}/cleanup': {
    response: 'LiveCenterRecordingSegmentCleanupResponse',
  },
  'POST /v2/content/live-center/sessions/{session_id}/analysis': {
    request: 'LiveCenterAnalysisCreateRequest',
    response: 'LiveCenterAnalysisJob',
  },
  'GET /v2/sample-inventory/access-policy': {
    response: 'SampleInventoryAccessPolicyResponse',
  },
  'GET /v2/sample-inventory/settings': {
    response: 'SampleInventorySettingsResponse',
  },
  'GET /v2/sample-inventory/summary': {
    response: 'SampleInventorySummary',
  },
  'PATCH /v2/sample-inventory/settings': {
    request: 'UpdateSampleInventorySettingsRequest',
    response: 'SampleInventorySettingsResponse',
  },
  'GET /v2/sample-inventory/samples': {
    queryParameters: [
      { name: 'keyword', in: 'query', required: false, schema: { type: 'string', maxLength: 120 } },
      { name: 'include_archived', in: 'query', required: false, schema: { type: 'boolean' } },
      { name: 'stockStatus', in: 'query', required: false, schema: { type: 'string', enum: ['in_stock', 'low', 'out'] } },
      { name: 'productKind', in: 'query', required: false, schema: { type: 'string', enum: ['primary', 'gift'] } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'page_size', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'dateFrom', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'dateTo', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'sortBy', in: 'query', required: false, schema: { type: 'string', enum: ['sampleCode', 'sampleName', 'availableQuantity', 'updatedAt'] } },
      { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'] } },
    ],
    response: 'SampleInventorySampleListResponse',
  },
  'POST /v2/sample-inventory/samples': {
    request: 'CreateSampleInventorySampleRequest',
    response: 'SampleInventorySampleItem',
  },
  'PATCH /v2/sample-inventory/samples/{sample_id}': {
    request: 'UpdateSampleInventorySampleRequest',
    response: 'SampleInventorySampleItem',
  },
  'POST /v2/sample-inventory/samples/{sample_id}/archive': {
    request: 'ArchiveSampleInventorySampleRequest',
    response: 'SampleInventorySampleItem',
  },
  'POST /v2/sample-inventory/samples/batch-archive': {
    request: 'BatchArchiveSampleInventorySamplesRequest',
    response: 'SampleInventorySampleBatchMutationResponse',
  },
  'POST /v2/sample-inventory/samples/{sample_id}/adjustments': {
    request: 'SampleInventoryAdjustmentRequest',
    response: 'SampleInventorySampleItem',
  },
  'POST /v2/sample-inventory/samples/parse-xlsx': {
    multipartRequest: { field: 'file' },
    response: 'SampleInventorySampleXlsxParseResponse',
  },
  'POST /v2/sample-inventory/samples/import': {
    request: 'ImportSampleInventorySamplesRequest',
    response: 'SampleInventorySampleImportResponse',
  },
  'GET /v2/sample-inventory/inbound-records': {
    queryParameters: [
      { name: 'keyword', in: 'query', required: false, schema: { type: 'string', maxLength: 120 } },
      { name: 'sample_id', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'include_voided', in: 'query', required: false, schema: { type: 'boolean' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'page_size', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'dateFrom', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'dateTo', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'sortBy', in: 'query', required: false, schema: { type: 'string', enum: ['occurredAt', 'sampleCode', 'quantity', 'trackingNumber'] } },
      { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'] } },
    ],
    response: 'SampleInventoryInboundListResponse',
  },
  'POST /v2/sample-inventory/inbound-records': {
    request: 'CreateSampleInventoryInboundRequest',
    response: 'SampleInventoryInboundItem',
  },
  'POST /v2/sample-inventory/inbound-records/batch': {
    request: 'CreateSampleInventoryInboundBatchRequest',
    response: 'SampleInventoryInboundBatchResponse',
  },
  'POST /v2/sample-inventory/inbound-records/{inbound_id}/void': {
    request: 'VoidSampleInventoryInboundRequest',
    response: 'SampleInventoryInboundItem',
  },
  'POST /v2/sample-inventory/inbound-records/batch-void': {
    request: 'BatchVoidSampleInventoryInboundsRequest',
    response: 'SampleInventoryInboundBatchMutationResponse',
  },
  'POST /v2/sample-inventory/inbound-records/parse-xlsx': {
    multipartRequest: { field: 'file' },
    response: 'SampleInventoryInboundXlsxParseResponse',
  },
  'POST /v2/sample-inventory/inbound-records/import': {
    request: 'ImportSampleInventoryInboundsRequest',
    response: 'SampleInventoryInboundBatchResponse',
  },
  'GET /v2/sample-inventory/outbound-requests': {
    queryParameters: [
      { name: 'keyword', in: 'query', required: false, schema: { type: 'string', maxLength: 120 } },
      { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['pending', 'approved', 'sampled', 'rejected'] } },
      { name: 'sample_id', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'page_size', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'dateFrom', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'dateTo', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'sortBy', in: 'query', required: false, schema: { type: 'string', enum: ['requestedAt', 'sampleCode', 'applicant', 'department', 'status', 'trackingNumber'] } },
      { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'] } },
    ],
    response: 'SampleInventoryOutboundListResponse',
  },
  'POST /v2/sample-inventory/outbound-requests': {
    request: 'CreateSampleInventoryOutboundRequest',
    response: 'SampleInventoryOutboundItem',
  },
  'POST /v2/sample-inventory/outbound-requests/batch': {
    request: 'CreateSampleInventoryOutboundBatchRequest',
    response: 'SampleInventoryOutboundBatchResponse',
  },
  'PATCH /v2/sample-inventory/outbound-requests/{request_id}': {
    request: 'UpdateSampleInventoryOutboundRequest',
    response: 'SampleInventoryOutboundItem',
  },
  'PATCH /v2/sample-inventory/outbound-requests/{request_id}/tracking': {
    request: 'UpdateSampleInventoryOutboundTrackingRequest',
    response: 'SampleInventoryOutboundItem',
  },
  'PATCH /v2/sample-inventory/outbound-requests/batch-tracking': {
    request: 'BatchUpdateSampleInventoryOutboundTrackingRequest',
    response: 'SampleInventoryBatchMutationResponse',
  },
  'POST /v2/sample-inventory/outbound-requests/{request_id}/transition': {
    request: 'TransitionSampleInventoryOutboundRequest',
    response: 'SampleInventoryOutboundItem',
  },
  'POST /v2/sample-inventory/outbound-requests/batch-edit': {
    request: 'BatchEditSampleInventoryOutboundRequest',
    response: 'SampleInventoryBatchMutationResponse',
  },
  'POST /v2/sample-inventory/outbound-requests/batch-transition': {
    request: 'BatchTransitionSampleInventoryOutboundRequest',
    response: 'SampleInventoryBatchMutationResponse',
  },
  'POST /v2/sample-inventory/outbound-requests/batch-archive': {
    request: 'BatchArchiveSampleInventoryOutboundRequest',
    response: 'SampleInventoryBatchMutationResponse',
  },
  'GET /v2/sample-inventory/backup.json': {
    response: 'SampleInventoryBackupFile',
  },
  'POST /v2/sample-inventory/backup/parse': {
    request: 'ParseSampleInventoryBackupRequest',
    response: 'SampleInventoryBackupPlanResponse',
  },
  'POST /v2/sample-inventory/backup/restore': {
    request: 'RestoreSampleInventoryBackupRequest',
    response: 'SampleInventoryBackupRestoreResponse',
  },
});
