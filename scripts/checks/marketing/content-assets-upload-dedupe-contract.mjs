#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

const repositorySource = await readSource(
  'backend-rust/src/marketing/content_assets/repository.rs'
);
const assetMutationsSource = await readSource(
  'backend-rust/src/marketing/content_assets/asset_mutations.rs'
);
const uploadCompletionSource = await readSource(
  'backend-rust/src/marketing/content_assets/processing_mutations/upload_completion.rs'
);
const cleanupSource = await readSource(
  'backend-rust/src/marketing/content_assets/cleanup.rs'
);
const startupSource = await readSource('backend-rust/src/startup.rs');

const duplicateQueryMatch = repositorySource.match(
  /pub\(super\) async fn query_duplicate_asset_by_sha256[\s\S]*?Ok\(row\.as_ref\(\)\.map\(asset_from_row\)\)/u
);
assert.ok(duplicateQueryMatch, 'duplicate SHA query helper should exist');
assert.match(
  duplicateQueryMatch[0],
  /asset\.uploaded_at IS NOT NULL/u,
  'duplicate SHA detection should ignore abandoned upload placeholders'
);

const createUploadMatch = assetMutationsSource.match(
  /pub\(super\) async fn create_manual_upload_asset[\s\S]*?pub\(super\) async fn prepare_existing_asset_source_upload/u
);
assert.ok(createUploadMatch, 'manual upload creation helper should exist');
const createUploadSource = createUploadMatch[0];
const createAssetInsert = createUploadSource.match(
  /INSERT INTO ads\.marketing_content_assets \([\s\S]*?\)\s*VALUES \([\s\S]*?\)/u
);
assert.ok(createAssetInsert, 'manual upload creation should insert the asset row');
assert.doesNotMatch(
  createAssetInsert[0],
  /\braw_sha256\b/u,
  'presigned upload creation must not reserve canonical raw_sha256'
);
assert.doesNotMatch(
  createUploadSource,
  /\.bind\(&payload\.raw_sha256\)[\s\S]*?create manual upload marketing content asset failed/u,
  'asset-row insert should not bind raw_sha256 during presigned upload creation'
);
assert.match(
  createUploadSource,
  /pending_raw_sha256/u,
  'pending upload SHA should remain in metadata for diagnostics'
);

assert.match(
  uploadCompletionSource,
  /raw_sha256 = COALESCE\(\$3, raw_sha256\)/u,
  'verified upload completion should still write canonical raw_sha256'
);
assert.match(
  uploadCompletionSource,
  /uploaded_at = COALESCE\(uploaded_at, CURRENT_TIMESTAMP\)/u,
  'verified upload completion should still mark uploaded_at'
);

assert.match(
  startupSource,
  /marketing::spawn_content_asset_stale_upload_cleanup\(Arc::clone\(&state\)\)/u,
  'stale upload placeholder cleanup should start automatically with the backend'
);
for (const [pattern, message] of [
  [/STALE_UPLOAD_RETENTION_HOURS:\s*i64\s*=\s*24/u, 'stale upload cleanup should retain recent upload sessions for 24 hours'],
  [/STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS:\s*u64\s*=\s*60 \* 60/u, 'stale upload cleanup should run periodically after startup'],
  [/asset\.source_type = 'manual_upload'/u, 'cleanup should only target manual-upload placeholders'],
  [/asset\.asset_status = 'uploading'/u, 'cleanup should only target uploading placeholders'],
  [/asset\.uploaded_at IS NULL/u, 'cleanup should not target completed uploaded assets'],
  [/asset\.created_at < CURRENT_TIMESTAMP - \(\$1::INTEGER \* INTERVAL '1 hour'\)/u, 'cleanup should enforce the retention window'],
  [/raw_object\.object_role = 'raw'[\s\S]*raw_object\.status = 'active'/u, 'cleanup should exclude assets with completed raw objects'],
  [/SET is_deleted = TRUE/u, 'cleanup must soft-delete placeholders instead of deleting rows'],
  [/manual_upload_expired/u, 'cleanup should record an audit event'],
]) {
  assert.match(cleanupSource, pattern, message);
}
