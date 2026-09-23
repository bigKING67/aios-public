import { readFileSync } from 'node:fs';

import { AIOS_RUST_ROUTE_SOURCES } from '../../config/contracts/aios-api-contract.mjs';
import { buildAiosOpenApi, renderAiosOpenApi } from './aios-openapi-core.mjs';
import { normalizeOpenapiTypescriptSource } from './openapi-typescript-runner.mjs';
import { collectRustRouteOperations, extractRustRouteOperations } from './rust-route-extractor.mjs';
import { collectRustStructSchemas, extractRustStructSchema } from './rust-schema-extractor.mjs';

function captureError(callback) {
  try {
    callback();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function runAiosApiContractBehaviorFixtures({
  assertDeepEqual,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertTrue,
}) {
  assertIncludes(
    normalizeOpenapiTypescriptSource('type OneOf<T extends any[]> = T;'),
    'type OneOf<T extends unknown[]>',
    'generated OneOf helpers should use an unknown array boundary instead of explicit any',
  );
  assertNotIncludes(
    normalizeOpenapiTypescriptSource('type OneOf<T extends any[]> = T;'),
    'extends any[]',
    'generated OneOf helpers should not retain the explicit-any boundary',
  );

  const routeSource = `
    // .route("/commented", get(commented_handler))
    /* .route("/block-commented", get(block_commented_handler)) */
    const ROUTE_EXAMPLE: &str = ".route(path, get(string_handler))";
    Router::new()
      .route("/items", get(list_items).post(create_item))
      .route(
        "/items/{item_id}",
        axum::routing::patch(update_item).delete(delete_item),
      )
  `;
  assertDeepEqual(
    extractRustRouteOperations(routeSource, { file: 'fixture.rs', prefix: '/sample', tag: 'sample' })
      .map(({ method, path }) => ({ method, path })),
    [
      { method: 'get', path: '/sample/items' },
      { method: 'post', path: '/sample/items' },
      { method: 'delete', path: '/sample/items/{item_id}' },
      { method: 'patch', path: '/sample/items/{item_id}' },
    ],
    'Rust route extraction should retain method chains and nested path parameters',
  );
  assertNotIncludes(
    JSON.stringify(extractRustRouteOperations(routeSource, { file: 'fixture.rs', prefix: '/sample', tag: 'sample' })),
    'commented',
    'Rust route extraction should ignore comments and string literals',
  );

  const schemaSource = `
    pub(in crate::sample) struct Child { pub(in crate::sample) value: String, }
    pub struct Sample {
      pub id: String,
      pub enabled: bool,
      pub labels: Vec<String>,
      pub child: Child,
      #[serde(rename = "displayName")]
      pub display_name: String,
      #[serde(skip_serializing_if = "Option::is_none")]
      pub note: Option<String>,
      #[serde(skip_serializing_if = "Vec::is_empty")]
      pub optional_items: Vec<String>,
    }
  `;
  const sampleSchema = extractRustStructSchema(schemaSource, 'Sample');
  assertDeepEqual(
    sampleSchema.required,
    ['id', 'enabled', 'labels', 'child', 'displayName'],
    'serde-skipped fields should remain optional and renamed fields should retain requiredness',
  );
  assertEqual(sampleSchema.properties.labels.type, 'array', 'Rust Vec should become an OpenAPI array');
  assertEqual(sampleSchema.properties.child.$ref, '#/components/schemas/Child', 'Rust structs should become component references');
  assertEqual(sampleSchema.properties.displayName.type, 'string', 'serde field rename should own the JSON property name');

  const requestSchema = extractRustStructSchema(`
    pub struct CreateRequest {
      pub name: String,
      pub note: Option<String>,
      pub values: Vec<serde_json::Value>,
      #[serde(default)]
      pub retry: bool,
    }
  `, 'CreateRequest', { optionalFields: true });
  assertDeepEqual(
    requestSchema.required,
    ['name', 'values'],
    'Rust request Option and serde-default fields should be omittable',
  );
  assertDeepEqual(requestSchema.properties.values.items, {}, 'serde_json::Value request entries should remain unconstrained');

  const runtimeTypeSchema = extractRustStructSchema(`
    pub struct RuntimeTypes {
      pub id: Uuid,
      pub payload: Value,
      pub headers: BTreeMap<String, String>,
      pub nested: BTreeMap<String, Vec<serde_json::Value>>,
    }
  `, 'RuntimeTypes');
  assertDeepEqual(
    runtimeTypeSchema.properties.id,
    { type: 'string', format: 'uuid' },
    'Rust Uuid fields should become formatted strings',
  );
  assertDeepEqual(
    runtimeTypeSchema.properties.payload,
    {},
    'imported serde_json Value fields should remain unconstrained',
  );
  assertDeepEqual(
    runtimeTypeSchema.properties.headers,
    { type: 'object', additionalProperties: { type: 'string' } },
    'Rust string maps should become typed OpenAPI objects',
  );
  assertDeepEqual(
    runtimeTypeSchema.properties.nested,
    { type: 'object', additionalProperties: { type: 'array', items: {} } },
    'Rust map values should retain nested generic schemas',
  );

  const serdeStructSchema = extractRustStructSchema(`
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct PrivateResponse {
      private_value: &'static str,
      pub(crate) public_value: String,
      nested: module_name::NestedResponse,
    }
  `, 'PrivateResponse');
  assertDeepEqual(
    Object.keys(serdeStructSchema.properties),
    ['privateValue', 'publicValue', 'nested'],
    'Rust schema extraction should include private serialized fields and struct-level rename_all',
  );
  assertEqual(
    serdeStructSchema.properties.nested.$ref,
    '#/components/schemas/NestedResponse',
    'Rust schema extraction should retain qualified nested response references',
  );

  const aliasedSchemas = collectRustStructSchemas([
    {
      file: 'fixture.rs',
      names: [{ source: 'CreateRequest', name: 'AliasedCreateRequest', request: true }],
    },
  ], () => `
    pub struct CreateRequest {
      pub name: String,
      pub note: Option<String>,
    }
  `);
  assertTrue(Boolean(aliasedSchemas.AliasedCreateRequest), 'Rust schema descriptors should support contract aliases');
  assertDeepEqual(
    aliasedSchemas.AliasedCreateRequest.required,
    ['name'],
    'aliased Rust request schemas should retain request optionality',
  );

  const duplicateError = captureError(() => collectRustRouteOperations([
    { file: 'one.rs', prefix: '/same', tag: 'one' },
    { file: 'two.rs', prefix: '/same', tag: 'two' },
  ], () => '.route("/path", get(handler))'));
  assertIncludes(duplicateError, 'Duplicate Rust API operation', 'duplicate method/path pairs must fail closed');

  const document = buildAiosOpenApi();
  const rendered = renderAiosOpenApi(document);
  assertEqual(rendered, renderAiosOpenApi(buildAiosOpenApi()), 'OpenAPI generation should be byte deterministic');
  assertEqual(document['x-aios-contract'].routeSourceCount, AIOS_RUST_ROUTE_SOURCES.length, 'route source count should match the descriptor');
  assertTrue(document['x-aios-contract'].operationCount >= 100, 'OpenAPI should cover the complete active router inventory');
  assertTrue(
    Object.keys(document.paths).every((path) => !/^\/v[12]\/agent(?:\/|$)/u.test(path)),
    'Retired Agent operations must not appear in the active contract',
  );
  assertTrue(
    AIOS_RUST_ROUTE_SOURCES.every(({ prefix }) => prefix !== '/agent'),
    'Retired Agent must not have an active route source',
  );
  assertEqual(
    document.paths['/v2/auth/session/login'].post.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/LoginRequest',
    'typed auth request should reference the Rust-derived schema',
  );
  assertEqual(
    document.components.schemas.SessionUserResponse.properties.full_name.anyOf[1].type,
    'null',
    'Rust Option response fields should preserve nullability',
  );
  assertEqual(
    document.paths['/v2/marketing/creator-library/import/parse-xlsx'].post
      .requestBody.content['multipart/form-data'].schema.properties.file.format,
    'binary',
    'creator library XLSX parsing should expose a closed multipart file request',
  );
  assertEqual(
    document.paths['/v2/marketing/creator-library/import/parse-xlsx'].post
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/CreatorLibraryXlsxParseResponse',
    'creator library XLSX parsing should expose its Rust-derived response schema',
  );
  assertEqual(
    document['x-aios-contract'].typedOperationCount,
    87,
    'typed operation count should include reports and sample inventory caller seams',
  );
  assertEqual(
    document.paths['/v2/sample-inventory/samples'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/SampleInventorySampleListResponse',
    'sample inventory list should expose its Rust-derived response schema',
  );
  assertEqual(
    document.paths['/v2/sample-inventory/outbound-requests/{request_id}/transition'].post
      .requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/TransitionSampleInventoryOutboundRequest',
    'sample inventory transitions should expose the optimistic version request contract',
  );
  assertDeepEqual(
    document.paths['/v2/sample-inventory/outbound-requests'].get.parameters
      .map((parameter) => parameter.name),
    ['keyword', 'status', 'sample_id', 'page', 'page_size', 'dateFrom', 'dateTo', 'sortBy', 'sortOrder'],
    'sample inventory outbound list should expose bounded filter and pagination parameters',
  );
  for (const schemaName of [
    'UpdateSampleInventorySettingsRequest',
    'CreateSampleInventorySampleRequest',
    'UpdateSampleInventorySampleRequest',
    'SampleInventoryAdjustmentRequest',
    'ArchiveSampleInventorySampleRequest',
    'BatchArchiveSampleInventorySamplesRequest',
    'CreateSampleInventoryInboundRequest',
    'CreateSampleInventoryInboundBatchRequest',
    'VoidSampleInventoryInboundRequest',
    'BatchVoidSampleInventoryInboundsRequest',
    'CreateSampleInventoryOutboundRequest',
    'CreateSampleInventoryOutboundBatchRequest',
    'UpdateSampleInventoryOutboundRequest',
    'UpdateSampleInventoryOutboundTrackingRequest',
    'BatchUpdateSampleInventoryOutboundTrackingRequest',
    'TransitionSampleInventoryOutboundRequest',
    'BatchTransitionSampleInventoryOutboundRequest',
    'BatchEditSampleInventoryOutboundRequest',
    'BatchArchiveSampleInventoryOutboundRequest',
    'ImportSampleInventorySamplesRequest',
    'ImportSampleInventoryInboundsRequest',
    'RestoreSampleInventoryBackupRequest',
  ]) {
    assertTrue(
      document.components.schemas[schemaName].required.includes('submissionKey'),
      `${schemaName} should require the idempotency submission key`,
    );
  }
  assertDeepEqual(
    document.paths['/v2/dashboard/date-bounds'].get.parameters.map((parameter) => parameter.name),
    ['platform', 'dimension'],
    'dashboard date bounds should expose its frontend-facing query contract',
  );
  assertDeepEqual(
    document.components.schemas.DashboardDateBoundsResponse.required,
    ['minDate', 'maxDate'],
    'dashboard date bounds should require nullable min/max response fields',
  );
  assertEqual(
    document.components.schemas.DashboardDailyNotesResponse.properties.countsByDate
      .additionalProperties.type,
    'integer',
    'dashboard note counts should expose a typed integer map',
  );
  assertDeepEqual(
    document.paths['/v2/dashboard/notes'].post.requestBody.content['application/json'].schema.required,
    ['note_date', 'platform', 'action_text', 'reason_text', 'summary_text'],
    'dashboard note creation should retain its required write fields',
  );
  assertEqual(
    document.paths['/v2/dashboard/notes'].post.responses[201].content['application/json'].schema.$ref,
    '#/components/schemas/DashboardDailyNoteRow',
    'dashboard note creation should expose its 201 typed response',
  );
  assertTrue(
    !('content' in document.paths['/v2/dashboard/notes/{id}'].delete.responses[204]),
    'dashboard note deletion should expose an empty 204 success response',
  );
  assertDeepEqual(
    document.paths['/v2/reports'].get.parameters.map((parameter) => parameter.name),
    ['report_type', 'limit', 'offset'],
    'report inventory should expose its accepted filter and pagination contract',
  );
  assertEqual(
    document.paths['/v2/reports'].get.responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/ReportsListResponse',
    'report inventory should expose its Rust-derived response envelope',
  );
  assertEqual(
    document.paths['/v2/reports/weekly/by-period'].get.parameters[0].required,
    true,
    'weekly by-period reads should require the handler-owned week_period query',
  );
  assertEqual(
    document.paths['/v2/reports/weekly/{report_id}'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/WeeklyReportResponse',
    'weekly report reads should expose the Rust-derived response',
  );
  assertDeepEqual(
    document.components.schemas.WeeklyCharts.properties.douyin_live_attribution.items,
    {},
    'dynamic weekly attribution entries should remain an explicit unknown boundary',
  );
  assertTrue(
    !('required' in document.components.schemas.WeeklySummaryGeneratePayload),
    'optional and serde-default summary generation fields should remain omittable',
  );
  assertDeepEqual(
    document.components.schemas.WeeklySummaryManualUpdatePayload.required,
    ['conclusions'],
    'manual summary updates should require only conclusions',
  );
  assertEqual(
    document.paths['/v2/reports/weekly/{report_id}/summary'].put
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/WeeklySummaryContentResponse',
    'manual summary updates should expose the typed content response',
  );
  assertEqual(
    document.paths['/v2/reports/monthly/{month_period}'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/MonthlyReportResponse',
    'monthly report reads should expose the Rust-derived response',
  );
  assertEqual(
    document.paths['/v2/content/live-center/date-bounds'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/LiveCenterDateBoundsResponse',
    'live-center date bounds should expose its Rust-derived response schema',
  );
  assertDeepEqual(
    document.paths['/v2/content/live-center/sessions'].get.parameters
      .map((parameter) => parameter.name),
    ['keyword', 'shopId', 'anchorDouyinId', 'startDate', 'endDate', 'page', 'pageSize'],
    'live-center sessions should expose the frontend-facing query contract',
  );
  assertEqual(
    document.paths['/v2/content/live-center/sessions'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/LiveCenterSessionListResponse',
    'live-center sessions should expose its Rust-derived response schema',
  );
  assertEqual(
    document.paths['/v2/content/live-center/sessions/{session_id}'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/LiveCenterSessionDetailResponse',
    'live-center session detail should expose its Rust-derived response schema',
  );
  assertDeepEqual(
    document.components.schemas.LiveCenterRecording.properties.recordingId,
    { type: 'string', format: 'uuid' },
    'live-center recording identifiers should retain their UUID format',
  );
  assertDeepEqual(
    document.components.schemas.LiveCenterAnalysisJob.properties.analysisJson,
    {},
    'live-center analysis JSON should remain an explicit unknown boundary',
  );
  assertDeepEqual(
    document.components.schemas.LiveCenterUploadCreateResponse.properties.headers,
    { type: 'object', additionalProperties: { type: 'string' } },
    'live-center upload headers should retain their typed string-map contract',
  );
  assertTrue(
    !document.components.schemas.LiveCenterUploadCreateResponse.required.includes('parts'),
    'serde-skipped live-center upload parts should remain optional',
  );
  assertEqual(
    document.paths['/v2/content/live-center/sessions/{session_id}/analysis'].post
      .requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/LiveCenterAnalysisCreateRequest',
    'live-center analysis creation should expose its Rust-derived request schema',
  );
  assertEqual(
    document.paths['/v2/content/live-center/recordings/{recording_id}/segments/{segment_id}/complete'].post
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/LiveCenterRecordingSegment',
    'live-center upload completion should reuse the recording segment response schema',
  );
  assertEqual(
    document.paths['/v2/auth/register'].post.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/CreateUserRequest',
    'admin user creation should reuse the Rust request schema',
  );
  assertDeepEqual(
    document.components.schemas.CreateUserRequest.required,
    ['username', 'email', 'password'],
    'optional admin user request fields should remain omittable',
  );
  assertDeepEqual(
    document.paths['/v2/roles/{role_id}/permissions'].put
      .requestBody.content['application/json'].schema,
    {
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
    'role permission updates should expose the normalized runtime input contract',
  );
  assertEqual(
    document.paths['/v2/permissions'].get.parameters[0].name,
    'grouped',
    'permission response variants should expose their selector query parameter',
  );
  assertEqual(
    document.paths['/v2/audit-logs'].get.responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/AuditLogListResponse',
    'audit log callers should expose a closed Rust-derived response',
  );
  assertEqual(
    document.components.schemas.CreatorLibraryListResponse.properties.pageSize.type,
    'integer',
    'creator-library response schemas should preserve serde-renamed JSON fields',
  );
  assertEqual(
    document.paths['/v2/marketing/creator-library'].get.parameters
      .find(({ name }) => name === 'sort').schema.enum.at(-1),
    'last_follow_desc',
    'creator-library list filters should expose the complete validated sort domain',
  );
  assertEqual(
    document.paths['/v2/marketing/creator-library'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/CreatorLibraryListResponse',
    'creator-library list reads should expose the Rust-derived response',
  );
  assertEqual(
    document.paths['/v2/marketing/creator-library/filter-options'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/CreatorLibraryFilterOptions',
    'creator-library filter reads should expose the Rust-derived response',
  );
  assertEqual(
    document.paths['/v2/marketing/creator-library/{id}/follow-logs'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/CreatorLibraryFollowLogListResponse',
    'creator-library follow-log reads should expose the Rust-derived response',
  );
  assertEqual(
    document.components.schemas.IndustryArticleListResponse.properties.pageSize.type,
    'integer',
    'industry-news response schemas should preserve serde-renamed JSON fields',
  );
  assertEqual(
    document.paths['/v2/marketing/industry-news/articles'].get.parameters
      .find(({ name }) => name === 'content_status').schema.enum.join(','),
    'list_only,content_fetched,content_failed',
    'industry-news article filters should expose the validated content-status domain',
  );
  assertEqual(
    document.paths['/v2/marketing/industry-news/articles'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/IndustryArticleListResponse',
    'industry-news articles should expose the Rust-derived list response',
  );
  assertEqual(
    document.paths['/v2/marketing/industry-news/sources'].get
      .responses[200].content['application/json'].schema.items.$ref,
    '#/components/schemas/IndustryArticleSource',
    'industry-news sources should expose a closed array response',
  );
  assertDeepEqual(
    document.paths['/v2/dashboard/industry-material-inspiration'].get.parameters
      .map((parameter) => parameter.name),
    ['tab', 'month', 'brand'],
    'industry-material reads should expose the validated selector contract',
  );
  assertEqual(
    document.paths['/v2/dashboard/industry-material-inspiration'].get
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/IndustryMaterialInspirationResponse',
    'industry-material reads should expose the Rust-derived outer response',
  );
  assertDeepEqual(
    document.components.schemas.IndustryMaterialInspirationResponse.properties.tabs,
    {},
    'industry-material nested ADS payloads should remain explicit unknown boundaries',
  );
  assertEqual(
    document.components.schemas.IndustryMaterialBrandAiBackfillResponse.properties.workerTrigger.$ref,
    '#/components/schemas/BrandAiBackfillWorkerTrigger',
    'industry-material backfill responses should retain the typed worker trigger boundary',
  );
  assertDeepEqual(
    document.paths['/v2/dashboard/industry-material-inspiration/brand-ai-analysis/backfill'].post
      .requestBody.content['application/json'].schema.properties.source.anyOf[0].enum,
    ['preview', 'raw', 'auto'],
    'industry-material backfill requests should expose the validated source domain',
  );
  assertEqual(
    document.paths['/v2/dashboard/industry-material-inspiration/brand-ai-analysis/backfill'].post
      .responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/IndustryMaterialBrandAiBackfillResponse',
    'industry-material backfill should expose the Rust-derived response',
  );

  const routesSource = readFileSync('backend-rust/src/routes.rs', 'utf8');
  assertIncludes(
    routesSource,
    'fn build_api_router(state: Arc<AppState>)',
    'v1/v2 should share one state-aware API router owner',
  );
  assertIncludes(routesSource, '.nest("/v1", api.clone())', 'v1 compatibility mount must stay active');
  assertNotIncludes(routesSource, '.nest("/agent"', 'Retired Agent must not be mounted in either API version');
  assertIncludes(routesSource, '.nest("/v2", api)', 'v2 compatibility mount must be active');
  assertNotIncludes(routesSource, '.nest("/v1/auth"', 'domain prefixes should not be duplicated outside the shared API router');

  const adapterSource = readFileSync('apps/web-vite/src/lib/generated-api-contract.ts', 'utf8');
  assertIncludes(adapterSource, "from '@/generated/api/aios-v2'", 'frontend adapter should consume generated types');
  assertIncludes(adapterSource, "GatewayPathFor<'/v2/auth/session/login'>", 'frontend auth paths should be checked against OpenAPI paths');
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/marketing/creator-library'>",
    'creator library callers should use a generated gateway-relative base path',
  );
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/marketing/creator-library/import/parse-xlsx'>",
    'creator library XLSX adapter path should be checked against OpenAPI paths',
  );
  assertIncludes(adapterSource, "GatewayPathFor<'/v2/auth/register'>", 'admin registration should use a generated path');
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/roles/{role_id}/permissions'>",
    'dynamic admin role paths should be checked against OpenAPI paths',
  );
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/marketing/industry-news/articles'>",
    'industry-news article paths should be checked against OpenAPI paths',
  );
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/dashboard/industry-material-inspiration'>",
    'industry-material paths should be checked against OpenAPI paths',
  );
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/reports/weekly/{report_id}/summary'>",
    'report summary callers should use a generated dynamic path',
  );
  assertIncludes(
    adapterSource,
    "GatewayPathFor<'/v2/reports/monthly/{month_period}'>",
    'monthly report callers should use a generated dynamic path',
  );
  for (const file of [
    'apps/web-vite/src/app/admin/audit-logs/_components/audit-logs-list-state.ts',
    'apps/web-vite/src/app/admin/permissions/_components/permissions-page-list-state.ts',
    'apps/web-vite/src/app/admin/roles/_components/roles-default-role-bootstrap.ts',
    'apps/web-vite/src/app/admin/roles/_components/roles-page-actions.ts',
    'apps/web-vite/src/app/admin/roles/_components/roles-page-list-state.ts',
    'apps/web-vite/src/app/admin/users/_lib/users-api.ts',
  ]) {
    assertNotIncludes(readFileSync(file, 'utf8'), '/v1/', `${file} should use gateway-relative generated paths`);
  }
  const authHookSource = readFileSync('apps/web-vite/src/hooks/use-auth.ts', 'utf8');
  assertNotIncludes(authHookSource, '/v1/auth/users/', 'dead phantom auth permission caller should be removed');
  assertNotIncludes(authHookSource, '/v1/auth/register', 'admin registration should use the generated gateway-relative path');
  assertNotIncludes(
    readFileSync('apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-api.ts', 'utf8'),
    '/v1/marketing/creator-library',
    'creator-library callers should use the generated gateway-relative base path',
  );
  assertNotIncludes(
    readFileSync('apps/web-vite/src/app/marketing/industry-news/_lib/industry-news-api.ts', 'utf8'),
    '/v1/marketing/industry-news',
    'industry-news callers should use generated gateway-relative paths',
  );
  assertNotIncludes(
    readFileSync(
      'apps/web-vite/src/app/dashboard/industry-material-inspiration/industry-material-inspiration-transport.ts',
      'utf8',
    ),
    '/v1/dashboard/industry-material-inspiration',
    'industry-material callers should use the generated gateway-relative path',
  );

  return `Rust routes=${document['x-aios-contract'].operationCount}; typed operations=${document['x-aios-contract'].typedOperationCount}`;
}
