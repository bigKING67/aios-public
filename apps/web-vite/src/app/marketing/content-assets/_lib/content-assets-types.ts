export type ContentAssetSort = 'recommended' | 'updated_desc' | 'uploaded_desc' | 'title_asc' | 'roi_desc';
export type ContentAssetView = 'grid' | 'table';
export type PlaybackVariant = 'preview' | 'raw';
export type ContentAssetAnalysisSource = 'preview' | 'raw' | 'auto';
export type ContentAssetAnalysisProfile = 'preview_fast' | 'raw_deep' | 'action_detail';
export type ContentAssetProcessingJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ContentAssetProcessingJobType = 'preview' | 'cover' | 'frames' | 'transcript' | 'analysis';
export type ContentAssetUploadStage = 'creating' | 'uploading' | 'completing' | 'importing';
export type QianchuanDeliveryMode = 'qianchuan_all_domain';
export type QianchuanMaterialObjective =
  | 'product_all_domain_shortvideo'
  | 'live_all_domain_shortvideo'
  | 'unknown'
  | string;
export type ContentAssetTodoFilter =
  | 'missing_ai'
  | 'missing_transcript'
  | 'missing_platform_video'
  | 'missing_ad_material'
  | 'authorization_unknown'
  | 'repurpose_unknown';

export interface ContentAssetQueryParams {
  keyword?: string;
  platform?: string;
  productName?: string;
  creatorName?: string;
  ownerUserId?: string;
  videoType?: string;
  contentScene?: string;
  contentSceneGroup?: string;
  contentSceneSubtype?: string;
  tags?: string[];
  assetStatus?: string;
  lifecycleStatus?: string;
  externalOnly?: boolean;
  todo?: ContentAssetTodoFilter;
  page: number;
  pageSize: number;
  sort: ContentAssetSort;
}

export interface ContentAssetItem {
  assetId: string;
  title: string;
  assetType: string;
  assetStatus: string;
  profileStatus: string;
  lifecycleStatus: string;
  externalOnly: boolean;
  bucket: string;
  rawObjectKey: string | null;
  previewObjectKey: string | null;
  coverObjectKey: string | null;
  transcriptObjectKey: string | null;
  coverUrl?: string | null;
  rawSha256: string | null;
  fileExt: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  previewSizeBytes: number | null;
  platform: string | null;
  platformNames: string[];
  videoType?: string | null;
  contentScene?: string | null;
  contentSceneGroup?: string | null;
  contentSceneSubtype?: string | null;
  productName: string | null;
  productNames: string[];
  skuNames: string[];
  creatorName: string | null;
  ownerName: string | null;
  ownerUserId: string | null;
  uploadedByUserId: string | null;
  canEdit: boolean;
  tags: string[];
  aiSuggestedTitle: string | null;
  aiSuggestedTags: string[];
  aiMetadataGeneratedAt: string | null;
  titleSource: string;
  tagsSource: string;
  notes: string | null;
  authorizationStatus: string;
  commercialUseAllowed: boolean | null;
  repurposeAllowed: boolean | null;
  authorizationStartsAt: string | null;
  authorizationExpiresAt: string | null;
  authorizationNotes: string | null;
  aiSummary: string | null;
  aiScore: number | null;
  aiAnalysisSource: ContentAssetAnalysisSource | string | null;
  aiAnalysisModel: string | null;
  aiAnalyzedAt: string | null;
  transcriptSource: ContentAssetAnalysisSource | string | null;
  transcriptModel: string | null;
  transcribedAt: string | null;
  scriptExcerpt: string | null;
  roi: number | null;
  ctr: number | null;
  cvr: number | null;
  spend: number | null;
  gmv: number | null;
  sourceType: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourceSheetId: string | null;
  sourceSheetName: string | null;
  sourceRowIndex: number | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentAssetSummary {
  totalAssets: number;
  readyAssets: number;
  externalOnlyAssets: number;
  pendingAssets: number;
  failedAssets: number;
  totalRawSizeBytes: number;
  latestUpdatedAt: string | null;
}

export interface ContentAssetCoverageSummary {
  totalAssets: number;
  readyAssets: number;
  rawReadyAssets: number;
  previewReadyAssets: number;
  coverReadyAssets: number;
  aiAnalyzedAssets: number;
  transcriptReadyAssets: number;
  platformBoundAssets: number;
  adMaterialBoundAssets: number;
  authorizationKnownAssets: number;
  repurposeKnownAssets: number;
  externalOnlyAssets: number;
  pendingAssets: number;
  failedAssets: number;
  totalRawSizeBytes: number;
  analysisFailedJobs: number;
  transcriptFailedJobs: number;
  latestUpdatedAt: string | null;
}

export interface ContentAssetLookupItem {
  assetId: string;
  title: string;
  platform: string | null;
  productName: string | null;
  creatorName: string | null;
  assetStatus: string;
  lifecycleStatus: string;
  updatedAt: string;
}

export interface ContentAssetLookupResponse {
  items: ContentAssetLookupItem[];
}

export interface ContentAssetFilterOptions {
  platforms: string[];
  products: string[];
  skus: string[];
  creators: string[];
  ownerOptions: ContentAssetOwnerOption[];
  assetStatuses: string[];
  lifecycleStatuses: string[];
  videoTypes?: string[];
  contentScenes?: string[];
  contentSceneGroups?: string[];
  contentSceneSubtypes?: string[];
  tags: string[];
}

export interface ContentAssetOwnerOption {
  userId: string;
  username: string;
  displayName: string;
  roles: string[];
  isManager: boolean;
}

export interface ContentAssetListResponse {
  items: ContentAssetItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: ContentAssetSummary;
  filterOptions: ContentAssetFilterOptions;
}

export interface ContentAssetProcessingJobQueryParams {
  assetId?: string;
  status?: ContentAssetProcessingJobStatus;
  jobType?: ContentAssetProcessingJobType;
  limit?: number;
}

export interface ContentAssetProcessingJobSummary {
  queuedJobs: number;
  runningJobs: number;
  succeededJobs: number;
  failedJobs: number;
  staleRunningJobs: number;
  latestFinishedAt: string | null;
}

export interface ContentAssetProcessingJob {
  jobId: string;
  assetId: string;
  title: string;
  assetStatus: string;
  durationSeconds: number | null;
  jobType: ContentAssetProcessingJobType | string;
  status: ContentAssetProcessingJobStatus | string;
  attempts: number;
  maxAttempts: number;
  inputObjectKey: string | null;
  outputObjectKey: string | null;
  metadata: unknown;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentAssetProcessingJobListResponse {
  items: ContentAssetProcessingJob[];
  summary: ContentAssetProcessingJobSummary;
}

export type ContentAssetUnmatchedStatsMatchType = 'ad_material' | 'platform_video';
export type ContentAssetUnmatchedStatsMatchTypeFilter = 'all' | ContentAssetUnmatchedStatsMatchType;

export interface ContentAssetUnmatchedStatsQueryParams {
  matchType?: ContentAssetUnmatchedStatsMatchType;
  limit?: number;
}

export interface ContentAssetUnmatchedStatsSummary {
  totalGroups: number;
  adMaterialGroups: number;
  platformVideoGroups: number;
  totalRows: number;
  latestStatDate: string | null;
}

export interface ContentAssetUnmatchedStatsItem {
  identityKey: string;
  matchType: ContentAssetUnmatchedStatsMatchType | string;
  platform: string;
  accountId: string | null;
  accountName: string | null;
  advertiserId: string | null;
  externalMaterialId: string | null;
  externalVideoId: string | null;
  externalItemId: string | null;
  externalNoteId: string | null;
  firstStatDate: string | null;
  lastStatDate: string | null;
  rowCount: number;
  impressions: number;
  clicks: number;
  plays: number;
  interactions: number;
  cost: number | null;
  gmv: number | null;
  roi: number | null;
}

export interface ContentAssetUnmatchedStatsResponse {
  items: ContentAssetUnmatchedStatsItem[];
  summary: ContentAssetUnmatchedStatsSummary;
}

export interface ContentAssetUnmatchedStatsBindPayload {
  matchType: ContentAssetUnmatchedStatsMatchType;
  assetId: string;
  platform: string;
  accountId?: string | null;
  accountName?: string | null;
  advertiserId?: string | null;
  externalMaterialId?: string | null;
  externalVideoId?: string | null;
  externalItemId?: string | null;
  externalNoteId?: string | null;
}

export interface ContentAssetUnmatchedStatsBindResponse {
  assetId: string;
  platformVideoId: string | null;
  adMaterialId: string | null;
  affectedRows: number;
  message: string;
}

export interface ContentAssetProcessingJobBackfillPayload {
  limit?: number;
}

export interface ContentAssetProcessingJobBackfillResponse {
  scannedAssets: number;
  affectedAssets: number;
  candidateJobs: number;
  createdJobs: number;
  previewJobs: number;
  coverJobs: number;
  skippedExistingJobs: number;
  estimatedRawBytes: number;
  message: string;
}

export interface ContentAssetAiJobBackfillPayload {
  jobType: 'analysis' | 'transcript';
  source: ContentAssetAnalysisSource;
  profile?: ContentAssetAnalysisProfile;
  limit?: number;
}

export interface ContentAssetAiJobBackfillResponse {
  jobType: 'analysis' | 'transcript' | string;
  source: ContentAssetAnalysisSource | string;
  profile?: ContentAssetAnalysisProfile | string;
  scannedAssets: number;
  candidateAssets: number;
  queuedJobs: number;
  skippedReadyAssets: number;
  skippedRunningJobs: number;
  skippedNoInput: number;
  skippedExistingJobs: number;
  message: string;
}

export interface ContentAssetAnalysisResultResponse {
  objectKey: string;
  generatedAt: string;
  metadata: unknown;
  document: unknown;
}

export interface ContentAssetAnalysisJobCreatePayload {
  source: ContentAssetAnalysisSource;
  profile?: ContentAssetAnalysisProfile;
  force?: boolean;
}

export interface ContentAssetTranscriptJobCreatePayload {
  source: 'raw' | 'preview' | 'auto';
  force?: boolean;
}

export interface ContentAssetTranscript {
  transcriptId: string;
  assetId: string;
  sourceObjectKey: string;
  transcriptObjectKey: string;
  provider: string;
  model: string;
  language: string | null;
  status: string;
  transcriptText: string;
  scriptText: string;
  srtText: string;
  segments: unknown;
  durationSeconds: number | null;
  wordCount: number | null;
  confidence: number | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ContentAssetSource {
  sourceId: number;
  sourceKind: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  feishuFileToken: string | null;
  feishuSheetId: string | null;
  feishuSheetName: string | null;
  feishuRowIndex: number | null;
  externalPlatform: string | null;
  externalStatus: string;
  metadata: unknown;
  createdAt: string;
}

export interface ContentAssetEvent {
  eventId: number;
  eventType: string;
  actor: string | null;
  message: string | null;
  payload: unknown;
  createdAt: string;
}

export interface ContentAssetDetailResponse {
  asset: ContentAssetItem;
  objects: ContentAssetObject[];
  transcript: ContentAssetTranscript | null;
  platformVideos: ContentAssetPlatformVideo[];
  adMaterials: ContentAssetAdMaterial[];
  shortVideoProfileHint?: ContentAssetShortVideoProfileHint | null;
  performanceSnapshot?: ContentAssetPerformanceSnapshot | null;
  sources: ContentAssetSource[];
  events: ContentAssetEvent[];
}

export interface ContentAssetPerformanceSnapshot {
  deliveryMode: QianchuanDeliveryMode | string;
  hasQianchuanPerformance: boolean;
  latestStatDate: string | null;
  totals: ContentAssetPerformanceTotals;
  materials: ContentAssetPerformanceMaterial[];
  qualityFlags: string[];
}

export interface ContentAssetPerformanceTotals {
  materialCount: number;
  productMaterialCount: number;
  liveMaterialCount: number;
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
  totalOrders: number;
  totalGmv: number;
  totalNetGmv: number;
  totalNetOrders: number;
  ctr: number | null;
  cvr: number | null;
  payRoi: number | null;
  netGmvRoi: number | null;
}

export interface ContentAssetPerformanceMaterial {
  materialId: string;
  adMaterialId: string | null;
  platformVideoId: string | null;
  objective: QianchuanMaterialObjective;
  sourceTable: string;
  materialVideoName: string | null;
  liveRoomName: string | null;
  douyinAccountDisplayId: string | null;
  firstStatDate: string | null;
  lastStatDate: string | null;
  activeDays: number;
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
  totalOrders: number;
  totalGmv: number;
  totalNetGmv: number;
  totalNetOrders: number;
  ctr: number | null;
  cvr: number | null;
  payRoi: number | null;
  netGmvRoi: number | null;
  orderCost: number | null;
  netOrderCost: number | null;
  refundRate1h: number | null;
  videoPlayCount: number | null;
  videoCompletePlayRate: number | null;
  avgWatchDuration: number | null;
  playRate5s: number | null;
  playRate10s: number | null;
  latestLiveAcceptanceStatus: string | null;
  dataQualityStatus: string;
  sampleQualityStatus: string;
  diagnosisStatus: string;
  latestMetrics: ContentAssetLatestMetrics | null;
  liveAcceptance: ContentAssetLiveAcceptanceSnapshot | null;
}

export interface ContentAssetPerformanceDailyQueryParams {
  materialId?: string;
  objective?: QianchuanMaterialObjective | string;
  startDate?: string;
  endDate?: string;
}

export interface ContentAssetPerformanceDailyResponse {
  assetId: string;
  deliveryMode: QianchuanDeliveryMode | string;
  defaultWindowDays: number;
  filters: ContentAssetPerformanceDailyFilters;
  rows: ContentAssetPerformanceDailyRow[];
}

export interface ContentAssetPerformanceDailyFilters {
  materialId: string | null;
  objective: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface ContentAssetPerformanceDailyRow {
  statDate: string;
  materialId: string;
  adMaterialId: string | null;
  platformVideoId: string | null;
  deliveryMode: QianchuanDeliveryMode | string;
  objective: QianchuanMaterialObjective | string;
  sourceTable: string;
  sourceFileName: string | null;
  sourceRowCount: number;
  materialVideoName: string | null;
  liveRoomName: string | null;
  douyinAccountDisplayId: string | null;
  matchStatus: string;
  dataQualityStatus: string;
  sampleQualityStatus: string;
  overallImpressionCount: number | null;
  overallClickCount: number | null;
  overallClickRate: number | null;
  overallConversionRate: number | null;
  overallCost: number | null;
  overallOrderCount: number | null;
  overallGmv: number | null;
  overallPayRoi: number | null;
  overallOrderCost: number | null;
  netGmv: number | null;
  netOrderCount: number | null;
  netGmvRoi: number | null;
  netOrderCost: number | null;
  refundOrderCount1h: number | null;
  refundAmount1h: number | null;
  refundRate1h: number | null;
  settlementRoi7d: number | null;
  settlementAmount7d: number | null;
  settlementOrderCount7d: number | null;
  videoPlayCount: number | null;
  videoCompletePlayRate: number | null;
  avgWatchDuration: number | null;
  playRate5s: number | null;
  playRate10s: number | null;
  legacyBoostCost: number | null;
  legacyBoostOrderCount: number | null;
  legacyBoostGmv: number | null;
  legacyBoostRoi: number | null;
  boostCost: number | null;
  boostOrderCount: number | null;
  boostGmv: number | null;
  boostPayRoi: number | null;
  boostImpressionCount: number | null;
  boostClickCount: number | null;
  boostClickRate: number | null;
  boostConversionRate: number | null;
  boostNetGmv: number | null;
  boostNetGmvRoi: number | null;
  boostNetOrderCount: number | null;
  boostRefundRate1h: number | null;
  rawMetrics: ContentAssetLatestMetrics | null;
  diagnosisJson: Record<string, unknown> | null;
}

export interface ContentAssetLatestMetrics extends Record<string, unknown> {
  latestStatDate?: string | null;
  latest_stat_date?: string | null;
  boostPolicy?: string | null;
  boost_policy?: string | null;
  refundRate1h?: number | string | null;
  refund_rate_1h?: number | string | null;
  sourceRows?: ContentAssetLatestMetricsRawRow[] | ContentAssetLatestMetricsRawRow | null;
  source_rows?: ContentAssetLatestMetricsRawRow[] | ContentAssetLatestMetricsRawRow | null;
  rawMetrics?: ContentAssetLatestMetricsRawRow[] | ContentAssetLatestMetricsRawRow | null;
  raw_metrics?: ContentAssetLatestMetricsRawRow[] | ContentAssetLatestMetricsRawRow | null;
}

export interface ContentAssetLatestMetricsRawRow extends Record<string, unknown> {}

export type ContentAssetLiveAcceptanceAttributionLevel = 'account_date_environment' | string;

export interface ContentAssetLiveAcceptanceSnapshot {
  attributionLevel: ContentAssetLiveAcceptanceAttributionLevel;
  statDate: string;
  douyinAccountDisplayId: string;
  anchorNickname: string | null;
  liveWatchUserCount: number | null;
  liveProductClickUser: number | null;
  productClickRateUser: number | null;
  watchToPayRateUser: number | null;
  clickToPayRateUser: number | null;
  liveOrderCount: number | null;
  liveGmv: number | null;
  acceptanceQualityStatus: string;
}

export interface ContentAssetShortVideoProfileHint {
  matchStatus: 'unique' | 'ambiguous' | string;
  source: 'creator_short_video' | string;
  creatorName: string | null;
  creatorAccountId: string | null;
  productNames: string[];
  videoType: string | null;
  contentScene: string | null;
  contentSceneGroup: string | null;
  contentSceneSubtype: string | null;
  qianchuanMaterialIds: string[];
  videoIds: string[];
  matchedRowCount: number;
}

export interface ContentAssetObject {
  objectId: string;
  assetId: string;
  objectRole: string;
  storageProvider: string;
  bucket: string;
  objectKey: string;
  contentType: string | null;
  fileExt: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  status: string;
  metadata: unknown;
  createdAt: string;
}

export interface ContentAssetPlatformVideo {
  platformVideoId: string;
  assetId: string;
  platform: string;
  accountId: string | null;
  accountName: string | null;
  advertiserId: string | null;
  externalVideoId: string | null;
  externalItemId: string | null;
  externalNoteId: string | null;
  externalUrl: string | null;
  publishTitle: string | null;
  publishStatus: string;
  relationStatus: string;
  source: string;
  createdAt: string;
}

export interface ContentAssetAdMaterial {
  adMaterialId: string;
  assetId: string;
  platformVideoId: string | null;
  adPlatform: string;
  accountId: string | null;
  accountName: string | null;
  advertiserId: string | null;
  externalMaterialId: string;
  externalVideoId: string | null;
  materialName: string | null;
  materialTitle: string | null;
  materialStatus: string;
  relationStatus: string;
  source: string;
  createdAt: string;
}

export interface PlaybackUrlResponse {
  url: string;
  variant: PlaybackVariant;
  expiresAt: string;
  provider: 'tos_signed_url' | 'volc_cdn' | string;
  contentType: string;
  fileSizeBytes: number | null;
}

export interface ContentAssetUploadCreatePayload {
  fileName: string;
  contentType?: string | null;
  fileSizeBytes?: number | null;
  title?: string | null;
  platform?: string | null;
  platformNames?: string[];
  videoType?: string | null;
  contentScene?: string | null;
  contentSceneGroup?: string | null;
  contentSceneSubtype?: string | null;
  productName?: string | null;
  productNames?: string[];
  skuNames?: string[];
  creatorName?: string | null;
  ownerName?: string | null;
  ownerUserId?: string | null;
  rawSha256?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface ContentAssetDouyinVideoIdResolvePayload {
  input: string;
}

export interface ContentAssetDouyinVideoIdResolveResponse {
  sourceUrl: string;
  resolvedUrl: string;
  externalVideoId: string;
}

export interface ContentAssetVideoLinkPreviewPayload {
  input: string;
}

export type ContentAssetVideoLinkSourceType = 'douyin_video' | 'qianchuan_material_video' | string;

export type ContentAssetQianchuanMaterialSuggestionStatus =
  | 'unique'
  | 'ambiguous'
  | 'conflict'
  | 'none'
  | string;

export interface ContentAssetQianchuanMaterialSuggestion {
  status: ContentAssetQianchuanMaterialSuggestionStatus;
  source: 'active_identity' | 'creator_short_video' | string;
  externalVideoId: string;
  recommendedExternalItemId?: string | null;
  materialIds: string[];
  matchStatus?: string | null;
  reason: string;
  requiresConfirmation: boolean;
}

export interface ContentAssetVideoLinkPreviewCandidate {
  sourceType: ContentAssetVideoLinkSourceType;
  sourceUrl: string;
  resolvedUrl: string;
  externalVideoId?: string | null;
  externalItemId?: string | null;
  qianchuanMaterialSuggestion?: ContentAssetQianchuanMaterialSuggestion | null;
}

export interface ContentAssetVideoLinkPreviewResponse {
  candidates: ContentAssetVideoLinkPreviewCandidate[];
}

export interface ContentAssetVideoLinkImportPayload
  extends Omit<ContentAssetUploadCreatePayload, 'fileName' | 'contentType' | 'fileSizeBytes' | 'rawSha256'> {
  input: string;
  candidateIndex?: number | null;
  externalVideoId?: string | null;
  externalItemId?: string | null;
  externalNoteId?: string | null;
}

export type ContentAssetVideoLinkImportResponse =
  | ContentAssetVideoLinkImportedResponse
  | ContentAssetVideoLinkAwaitingManualUploadResponse;

export interface ContentAssetVideoLinkImportedResponse {
  status: 'imported';
  detail: ContentAssetDetailResponse;
}

export interface ContentAssetVideoLinkAwaitingManualUploadResponse {
  status: 'awaiting_manual_upload';
  platform: 'douyin' | string;
  externalVideoId: string;
  sourceUrl: string;
  resolvedUrl: string;
  canBindAfterUpload: boolean;
  downloadAttempt: {
    status: 'failed' | string;
    reason: string;
    message: string;
  };
  nextAction: {
    type: 'manual_upload' | string;
    label: string;
  };
}

export interface ContentAssetUploadCreateResponse {
  assetId: string;
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  method: 'PUT' | string;
  expiresAt: string;
  headers: Record<string, string>;
}

export interface ContentAssetUploadCompletePayload {
  fileSizeBytes?: number | null;
  rawSha256?: string | null;
}

export interface ContentAssetUploadMutationPayload {
  sourceAssetId?: string;
  file: File;
  metadata: Omit<ContentAssetUploadCreatePayload, 'fileName' | 'contentType' | 'fileSizeBytes'>;
  platformVideo?: ContentAssetPlatformVideoCreatePayload | null;
}

export interface ContentAssetUploadProgress {
  stage: ContentAssetUploadStage;
  loadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface ContentAssetProfileUpdatePayload {
  title: string;
  platform?: string | null;
  platformNames?: string[];
  videoType?: string | null;
  contentScene?: string | null;
  contentSceneGroup?: string | null;
  contentSceneSubtype?: string | null;
  productName?: string | null;
  productNames?: string[];
  skuNames?: string[];
  creatorName?: string | null;
  ownerName?: string | null;
  ownerUserId?: string | null;
  tags: string[];
  notes?: string | null;
  profileStatus: string;
  lifecycleStatus: string;
  authorizationStatus: string;
  commercialUseAllowed?: boolean | null;
  repurposeAllowed?: boolean | null;
  authorizationStartsAt?: string | null;
  authorizationExpiresAt?: string | null;
  authorizationNotes?: string | null;
}

export interface ContentAssetPlatformVideoCreatePayload {
  platform: string;
  accountId?: string | null;
  accountName?: string | null;
  advertiserId?: string | null;
  externalVideoId?: string | null;
  externalItemId?: string | null;
  externalNoteId?: string | null;
  externalUrl?: string | null;
  publishTitle?: string | null;
  publishStatus?: string | null;
}

export type ContentAssetPlatformVideoUpdatePayload = ContentAssetPlatformVideoCreatePayload;

export interface ContentAssetAdMaterialCreatePayload {
  platformVideoId?: string | null;
  adPlatform: string;
  accountId?: string | null;
  accountName?: string | null;
  advertiserId?: string | null;
  externalMaterialId: string;
  externalVideoId?: string | null;
  materialName?: string | null;
  materialTitle?: string | null;
  materialStatus?: string | null;
}

export type ContentAssetAdMaterialUpdatePayload = ContentAssetAdMaterialCreatePayload;

export interface ImportRunCreatePayload {
  mode: 'dry_run' | 'sample_upload' | 'full_upload';
  sourceUrl?: string;
  spreadsheetToken?: string;
  sheetIds?: string[];
}

export interface ImportRunCreateResponse {
  runId: string;
  mode: string;
  status: string;
  message: string;
}

export interface ContentAssetImportRun {
  runId: string;
  mode: string;
  status: string;
  sourceUrl: string;
  spreadsheetToken: string | null;
  sheetIds: string[];
  dryRunPayload: unknown;
  totalRows: number;
  attachmentCount: number;
  uploadedCount: number;
  externalOnlyCount: number;
  failedCount: number;
  errorMessage: string | null;
  requestedBy: string | null;
  createdAt: string;
  finishedAt: string | null;
}
