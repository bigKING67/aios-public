#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

const frontendUploadSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-upload.ts'
);
const frontendResumeStoreSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-upload-resume-store.ts'
);
const frontendUploadQueueSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-recording-upload-queue.ts'
);
const frontendApiSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-api.ts'
);
const frontendRecordingPanelSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-recording-panel.tsx'
);
const frontendRecordingSegmentHelperSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-recording-segment-helpers.ts'
);
const frontendTypesSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-types.ts'
);
const frontendRecordingViewHelpersSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-recording-view-helpers.ts'
);
const backendUploadSource = await readSource('backend-rust/src/content_live_center/uploads.rs');
const backendHandlersSource = await readSource('backend-rust/src/content_live_center/handlers.rs');
const backendRecordingSegmentsSource = await readSource(
  'backend-rust/src/content_live_center/recording_segments.rs'
);
const backendRepositorySource = await readSource('backend-rust/src/content_live_center/repository.rs');
const backendCleanupSource = await readSource('backend-rust/src/content_live_center/cleanup.rs');
const backendStorageObjectsSource = await readSource(
  'backend-rust/src/content_live_center/storage_objects.rs'
);
const liveCenterResumeMigrationSource = await readSource(
  'etl/groland_postgres/sql/migrations/20260703_1700__add_live_center_recording_multipart_resume.sql'
);
const liveCenterSchemaMigrationSource = await readSource(
  'etl/groland_postgres/sql/migrations/20260630_1200__create_ads_douyin_live_center.sql'
);
const backendStartupSource = await readSource('backend-rust/src/startup.rs');
const settingsSource = await readSource('backend-rust/src/config/settings/content_assets.rs');
const settingsModSource = await readSource('backend-rust/src/config/settings/mod.rs');
const envExampleSource = await readSource('.env.example');
const backendEnvExampleSource = await readSource('backend-rust/.env.example');
const dockerComposeSource = await readSource('docker-compose.yml');
const dockerComposeProdSource = await readSource('docker-compose.prod.yml');
const packageJsonSource = await readSource('package.json');

assert.match(
  settingsSource,
  /DEFAULT_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS:\s*u64\s*=\s*8\s*\*\s*60\s*\*\s*60/u,
  'live recording upload signed URL TTL should default to 8 hours'
);
assert.match(
  settingsSource,
  /DOUYIN_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS/u,
  'settings should expose a dedicated live recording upload TTL env var'
);
assert.match(
  settingsSource,
  /live_recording_upload_signed_url_ttl_seconds:\s*env_u64_clamped\([\s\S]*?3600,[\s\S]*?12\s*\*\s*60\s*\*\s*60,[\s\S]*?\)/u,
  'live recording upload TTL should not clamp down to the content-assets short URL window'
);
assert.match(
  settingsModSource,
  /douyin_live_recording_upload_signed_url_ttl_seconds/u,
  'Settings should carry the dedicated live recording upload TTL'
);

const buildUploadUrlMatch = backendUploadSource.match(
  /pub\(super\) fn build_upload_url[\s\S]*?\n\}\n\npub\(super\) fn build_playback_url/u
);
assert.ok(buildUploadUrlMatch, 'live-center build_upload_url helper should exist');
const buildUploadUrlSource = buildUploadUrlMatch[0];

assert.match(
  buildUploadUrlSource,
  /settings\.douyin_live_recording_upload_signed_url_ttl_seconds/u,
  'live-center upload presign should use the dedicated long TTL'
);
assert.doesNotMatch(
  buildUploadUrlSource,
  /settings\.content_asset_signed_url_ttl_seconds/u,
  'live-center upload presign must not reuse content-assets short TTL'
);
assert.match(
  backendUploadSource,
  /LARGE_RECORDING_MULTIPART_THRESHOLD_BYTES:\s*i64\s*=\s*1024\s*\*\s*1024\s*\*\s*1024/u,
  'large live recordings should switch away from single PUT before multi-GB uploads'
);
assert.match(
  backendUploadSource,
  /LARGE_RECORDING_MULTIPART_PART_SIZE_BYTES:\s*i64\s*=\s*128\s*\*\s*1024\s*\*\s*1024/u,
  'large live recordings should use bounded multipart chunks'
);
assert.match(
  backendUploadSource,
  /pub\(super\) async fn build_multipart_upload_urls/u,
  'backend should expose multipart upload URL generation for long recordings'
);
assert.match(
  backendUploadSource,
  /fn presign_tos_upload_part/u,
  'backend should presign TOS upload-part URLs for multipart uploads'
);
assert.match(
  backendUploadSource,
  /pub\(super\) async fn complete_multipart_upload/u,
  'backend should complete TOS multipart uploads before marking DB rows uploaded'
);
assert.match(
  backendUploadSource,
  /pub\(super\) async fn list_multipart_uploaded_parts/u,
  'backend should query TOS ListParts when resuming multipart uploads'
);
assert.match(
  backendUploadSource,
  /fn presign_tos_list_parts/u,
  'backend should presign TOS ListParts requests for resumable uploads'
);
assert.match(
  backendUploadSource,
  /pub\(super\) async fn abort_multipart_upload/u,
  'backend should expose TOS AbortMultipartUpload for stale resumable uploads'
);
assert.match(
  backendUploadSource,
  /pub\(super\) fn build_delete_object_url/u,
  'backend should expose TOS DeleteObject signed URL generation for manual cleanup'
);
assert.match(
  backendStorageObjectsSource,
  /pub\(super\) async fn delete_object/u,
  'backend should expose a TOS DeleteObject helper for manual segment cleanup'
);
assert.match(
  backendUploadSource,
  /pub\(super\) async fn verify_object_size/u,
  'backend should HEAD-check uploaded object size before completing a live recording segment'
);
assert.match(
  backendHandlersSource,
  /build_multipart_upload_urls/u,
  'live-center upload creation should route large files to multipart upload'
);
assert.match(
  backendHandlersSource,
  /complete_multipart_upload/u,
  'live-center completion should merge multipart uploads when multipart parts are present'
);
assert.match(
  backendHandlersSource,
  /multipart\/resume/u,
  'live-center should expose a multipart resume route'
);
assert.match(
  backendHandlersSource,
  /segments\/\{segment_id\}\/cleanup/u,
  'live-center should expose a manual stuck-segment cleanup route'
);
assert.match(
  backendHandlersSource,
  /录屏分片上传恢复场次不匹配/u,
  'live-center resume should validate that the persisted segment belongs to the requested session'
);
assert.match(
  backendHandlersSource,
  /attach_segment_multipart_upload/u,
  'live-center upload creation should persist multipart metadata for resume'
);
assert.match(
  backendHandlersSource,
  /list_multipart_uploaded_parts/u,
  'live-center resume should use server-observed TOS uploaded parts'
);
assert.match(
  backendHandlersSource,
  /get_existing_active_upload_segment/u,
  'live-center upload creation should reuse an active uploading segment instead of colliding on segment_index'
);
assert.match(
  backendHandlersSource,
  /completed_parts:\s*completed_parts[\s\S]*to_completed_upload_part_response/u,
  'live-center reused multipart uploads should return already uploaded TOS parts'
);
assert.match(
  backendHandlersSource,
  /分片上传完成缺少服务端 uploadId 记录/u,
  'live-center multipart completion should require a server-persisted upload id'
);
assert.match(
  backendHandlersSource,
  /abort_multipart_upload[\s\S]*metadata attach failed/u,
  'live-center should abort a multipart upload if persisting its resume metadata fails'
);
assert.match(
  backendHandlersSource,
  /verify_object_size/u,
  'live-center completion should verify object size before marking uploaded'
);
assert.match(
  backendHandlersSource,
  /cleanup_recording_segment[\s\S]*abort_multipart_upload/u,
  'manual stuck-segment cleanup should abort persisted TOS multipart uploads best-effort'
);
assert.match(
  backendHandlersSource,
  /cleanup_recording_segment[\s\S]*delete_object/u,
  'manual stuck-segment cleanup should physically delete the TOS object before hiding the segment'
);
assert.match(
  backendHandlersSource,
  /已上传完成的录屏暂不支持清理/u,
  'manual stuck-segment cleanup should reject uploaded segments by default'
);
assert.match(
  backendRecordingSegmentsSource,
  /mark_segment_deleted/u,
  'backend should expose a DB state transition for manually cleaned segments'
);
assert.match(
  backendRecordingSegmentsSource,
  /upload_status = 'deleted'[\s\S]*processing_status = 'skipped'/u,
  'manual stuck-segment cleanup should hide cleaned DB rows while using a schema-valid processing status'
);
assert.match(
  liveCenterSchemaMigrationSource,
  /processing_status IN \('pending', 'processing', 'ready', 'failed', 'skipped'\)/u,
  'manual cleanup must respect the live-center recording segment processing_status constraint'
);
assert.match(
  backendRepositorySource,
  /s\.upload_status IN \('pending', 'uploading', 'uploaded'\)/u,
  'live-center upload creation should not treat failed segments as active conflicts'
);
assert.match(
  backendRepositorySource,
  /recycle_failed_upload_segment/u,
  'live-center upload creation should recycle failed segment indexes before inserting a new attempt'
);
assert.match(
  backendRepositorySource,
  /WHERE recording_id = \$1[\s\S]*AND segment_index = \$2[\s\S]*AND upload_status = 'failed'[\s\S]*RETURNING segment_id/u,
  'live-center failed segment recycle should replace only failed rows in-place to satisfy segment_index uniqueness'
);
assert.match(
  backendRepositorySource,
  /multipart_upload_id = NULL[\s\S]*multipart_part_size_bytes = NULL[\s\S]*multipart_expires_at = NULL/u,
  'live-center failed segment recycle should clear stale multipart resume metadata'
);
assert.doesNotMatch(
  backendRepositorySource,
  /s\.upload_status <> 'deleted'/u,
  'live-center upload creation must not treat failed segments as active conflicts via a broad non-deleted filter'
);

assert.doesNotMatch(
  frontendUploadSource,
  /xhr\.timeout\s*=\s*30\s*\*\s*60\s*\*\s*1000/u,
  'frontend live-center upload must not use a fixed 30 minute XHR timeout'
);
assert.match(
  frontendUploadSource,
  /xhr\.timeout\s*=\s*resolveUploadTimeoutMs\(upload\.expiresAt\)/u,
  'frontend live-center upload timeout should derive from signed URL expiry'
);
assert.match(
  frontendUploadSource,
  /LARGE_RECORDING_UPLOAD_FALLBACK_TIMEOUT_MS\s*=\s*8\s*\*\s*60\s*\*\s*60\s*\*\s*1000/u,
  'frontend fallback upload timeout should be 8 hours'
);
assert.match(
  frontendUploadSource,
  /MAX_INLINE_SHA256_BYTES\s*=\s*256\s*\*\s*1024\s*\*\s*1024/u,
  'large recording files should not be fully read for inline SHA-256'
);
assert.match(
  frontendUploadSource,
  /uploadMultipartFileToTos/u,
  'frontend should use multipart upload for long recording responses'
);
assert.match(
  frontendUploadSource,
  /LARGE_RECORDING_MULTIPART_MAX_ATTEMPTS\s*=\s*3/u,
  'frontend multipart upload should retry failed parts'
);
assert.match(
  frontendUploadSource,
  /file\.slice\(part\.startByte,\s*part\.endByteExclusive/u,
  'frontend multipart upload should slice the browser File without reading the full recording'
);
assert.match(
  frontendUploadSource,
  /getResponseHeader\('ETag'\)/u,
  'frontend multipart upload should collect TOS ETags for completion'
);
assert.match(
  frontendUploadSource,
  /multipartUploadId:\s*upload(?:\.upload)?\.uploadId/u,
  'frontend completion payload should include multipart upload id'
);
assert.match(
  frontendUploadSource,
  /resumeLiveCenterRecordingMultipartUpload/u,
  'frontend should attempt multipart resume before creating a new upload'
);
assert.match(
  frontendUploadSource,
  /initialCompletedParts/u,
  'frontend multipart resume should seed already uploaded parts'
);
assert.match(
  frontendUploadSource,
  /saveLiveCenterResumableUploadPart/u,
  'frontend should persist accepted multipart ETags during upload'
);
assert.match(
  frontendUploadSource,
  /deleteLiveCenterResumableUploadRecord/u,
  'frontend should clear resumable upload state after completion or stale resume'
);
assert.match(
  frontendUploadSource,
  /上次分片上传已不可恢复/u,
  'frontend should surface non-resumable multipart state before retrying upload creation'
);
assert.match(
  frontendUploadSource,
  /shouldDiscardStoredMultipartUpload\(error\)[\s\S]{0,220}return null/u,
  'frontend should fall back to upload creation after clearing a stale multipart resume record'
);
assert.match(
  frontendUploadSource,
  /createdUpload\.completedParts/u,
  'frontend should honor completed parts returned when backend reuses an existing multipart upload'
);
assert.match(
  frontendResumeStoreSource,
  /indexedDB\.open/u,
  'frontend resume store should use IndexedDB for cross-refresh upload metadata'
);
assert.match(
  frontendResumeStoreSource,
  /completedParts/u,
  'frontend resume store should persist completed multipart ETags'
);
assert.match(
  frontendResumeStoreSource,
  /completedParts:\s*upload\.completedParts\s*\|\|\s*\[\]/u,
  'frontend resume store should seed completed parts returned by upload creation'
);
assert.match(
  frontendTypesSource,
  /interface LiveCenterRecordingUploadPart/u,
  'frontend API types should include multipart upload parts'
);
assert.match(
  frontendTypesSource,
  /interface LiveCenterRecordingUploadCreateResponse[\s\S]*completedParts\?:\s*LiveCenterRecordingUploadCompletePart\[\]/u,
  'frontend create response type should allow reused multipart uploads to return completed parts'
);
assert.match(
  frontendTypesSource,
  /interface LiveCenterRecordingMultipartResumeResponse/u,
  'frontend API types should include multipart resume response'
);
assert.match(
  frontendTypesSource,
  /interface LiveCenterRecordingMultipartResumePayload[\s\S]*sessionId:\s*string/u,
  'frontend multipart resume payload should include sessionId for backend validation'
);
assert.match(
  frontendTypesSource,
  /interface LiveCenterRecordingSegmentCleanupResponse/u,
  'frontend API types should include manual segment cleanup response'
);
assert.match(
  frontendApiSource,
  /cleanupLiveCenterRecordingSegment/u,
  'frontend should expose a manual segment cleanup API helper'
);
assert.match(
  frontendRecordingPanelSource,
  /onCleanupSegment/u,
  'frontend recording panel should accept a manual segment cleanup handler'
);
assert.match(
  frontendRecordingPanelSource,
  /isLiveCenterRecordingSegmentPlayable/u,
  'frontend recording panel should use the shared playable segment predicate'
);
assert.match(
  frontendRecordingSegmentHelperSource,
  /uploadStatus === 'uploaded' && processingStatus !== 'deleted' && processingStatus !== 'skipped'/u,
  'frontend should only expose playback for uploaded and non-deleted/non-skipped segments'
);
assert.match(
  frontendRecordingPanelSource,
  /Popconfirm[\s\S]*物理删除已产生的 TOS 对象/u,
  'frontend cleanup action should require confirmation and describe physical TOS object deletion'
);
assert.match(
  frontendRecordingViewHelpersSource,
  /resolveUploadSegmentIndexes/u,
  'frontend should allocate upload segment indexes as an explicit batch plan'
);
assert.match(
  frontendRecordingViewHelpersSource,
  /uploadStatus\?\.[\s\S]*uploadStatus === 'failed'/u,
  'frontend batch allocation should prioritize failed segment indexes for retry'
);
assert.match(
  frontendRecordingViewHelpersSource,
  /uploadStatus === 'pending' \|\| uploadStatus === 'uploading' \|\| uploadStatus === 'uploaded'/u,
  'frontend batch allocation should keep pending/uploading/uploaded indexes occupied'
);
assert.doesNotMatch(
  frontendRecordingViewHelpersSource,
  /uploadStatus === 'deleted'/u,
  'frontend batch allocation must not reuse deleted indexes unless backend recycle supports them'
);
assert.match(
  frontendUploadQueueSource,
  /segmentIndexes:\s*number\[\]/u,
  'frontend upload queue should receive explicit segment indexes'
);
assert.match(
  frontendUploadQueueSource,
  /buildRecordingUploadQueue\(files,\s*segmentIndexes\)/u,
  'frontend upload queue should bind the explicit batch plan before uploading'
);
assert.doesNotMatch(
  frontendUploadQueueSource,
  /segmentIndex:\s*entry\.segmentIndex\s*\?\?\s*baseSegmentIndex\s*\+\s*uploadIndex/u,
  'frontend upload queue must not assign retry batches by naive baseSegmentIndex + uploadIndex'
);

assert.match(
  envExampleSource,
  /DOUYIN_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS=28800/u,
  '.env.example should document the 8 hour live recording upload TTL'
);
for (const [source, label] of [
  [backendEnvExampleSource, 'backend-rust/.env.example'],
  [dockerComposeSource, 'docker-compose.yml'],
  [dockerComposeProdSource, 'docker-compose.prod.yml'],
]) {
  assert.match(
    source,
    /DOUYIN_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS/u,
    `${label} should pass through the live recording upload TTL setting`
  );
}
assert.match(
  backendCleanupSource,
  /upload_status = 'failed'/u,
  'live-center should clean stale uploading placeholders by marking them failed'
);
assert.match(
  backendCleanupSource,
  /abort_multipart_upload/u,
  'live-center stale upload cleanup should abort persisted TOS multipart uploads best-effort'
);
assert.match(
  liveCenterResumeMigrationSource,
  /multipart_upload_id/u,
  'migration should persist TOS multipart uploadId for resumable uploads'
);
assert.match(
  liveCenterResumeMigrationSource,
  /multipart_part_size_bytes/u,
  'migration should persist multipart part size for resume URL regeneration'
);
assert.match(
  backendStartupSource,
  /content_live_center::spawn_stale_upload_cleanup\(Arc::clone\(&state\)\)/u,
  'live-center stale upload cleanup should start with the backend'
);
assert.match(
  packageJsonSource,
  /"verify:content:live-center-upload-hardening":\s*"node scripts\/checks\/content\/live-center-upload-hardening\.mjs"/u,
  'package.json should expose the live-center upload hardening gate'
);
