#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

const detailWorkbenchSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-asset-detail-workbench.tsx'
);
const inspectorSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-inspector.tsx'
);
const identityTabSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-inspector-identity-tab.tsx'
);
const identityLinkingSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-inspector-identity-linking.ts'
);
const identityModalSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-identity-modal.tsx'
);
const identityModalFieldsSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-identity-modal-fields.tsx'
);
const profileModalSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-profile-modal.tsx'
);
const profileModalValuesSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-profile-modal-values.ts'
);
const inspectorBaseTabSource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-inspector-base-tab.tsx'
);
const identitySummarySource = await readSource(
  'apps/web-vite/src/app/marketing/content-assets/_lib/content-assets-identity-summary.ts'
);
const repositoryDetailSource = await readSource(
  'backend-rust/src/marketing/content_assets/repository_detail.rs'
);
const identityMutationsSource = await readSource(
  'backend-rust/src/marketing/content_assets/identity_mutations.rs'
);
const dedupeMigrationSource = await readSource(
  'etl/groland_postgres/sql/migrations/20260617_1900__dedupe_marketing_content_platform_video_identities.sql'
);

for (const [name, source] of [
  ['detail workbench', detailWorkbenchSource],
  ['aside inspector', inspectorSource],
]) {
  assert.match(
    source,
    /onEditPlatformVideo\(onlyPlatformVideo\)/u,
    `${name} should edit the existing single platform-video identity instead of opening an empty create modal`
  );
  assert.match(
    source,
    /onEditAdMaterial\(onlyAdMaterial\)/u,
    `${name} should edit the existing single ad-material identity instead of opening an empty create modal`
  );
  assert.match(
    source,
    /编辑视频 ID/u,
    `${name} should label the single existing video-ID shortcut as edit`
  );
  assert.match(
    source,
    /编辑素材 ID/u,
    `${name} should label the single existing material-ID shortcut as edit`
  );
}

assert.match(
  identityTabSource,
  /shouldShowLinkedVideoIdentity/u,
  'identity tab should guard against rendering the same video/material id twice in one ad-material card'
);
assert.match(
  identityTabSource,
  /shouldShowMaterialVideoId/u,
  'ad-material card should hide its copied video id when the linked platform-video card already shows the same id'
);
assert.match(
  identityTabSource,
  /contentAssetPlatformLabel\(item\.adPlatform\)\}素材实例/u,
  'ad-material card title should not duplicate the material id when no material title/name exists'
);
assert.match(
  identityLinkingSource,
  /status:\s*'ambiguous'/u,
  'identity tab should represent duplicate platform-video candidates as an ambiguous state'
);
assert.match(
  identityLinkingSource,
  /Map<string,\s*ContentAssetPlatformVideo\[\]>/u,
  'identity tab should index external video/material IDs to candidate arrays instead of silently overwriting duplicates'
);
assert.match(
  identityTabSource,
  /多条平台身份命中，请确认/u,
  'identity tab should warn when one material matches multiple platform-video identities'
);
assert.doesNotMatch(
  identityTabSource,
  /^\s*<IdentityIdBlock label=\{linkedVideoLabel\} value=\{linkedVideoId\} \/>/mu,
  'identity tab should not unconditionally render linked video identity when it duplicates the visible id'
);
assert.match(
  identityTabSource,
  /externalMaterialId\) => externalMaterialId !== item\.externalItemId/u,
  'platform-video card should not repeat the same Qianchuan material id as both own id and linked material id'
);
assert.match(
  identityModalSource,
  /useEffect\(\(\) => \{[\s\S]*form\.setFieldsValue\(identityInitialValues\)/u,
  'identity modal should refill form values from the current editing item when mode or item changes'
);
assert.match(
  identityModalSource,
  /initialValues=\{identityInitialValues\}/u,
  'identity modal should provide initial values to remounted forms for edit mode'
);
assert.doesNotMatch(
  identityModalSource,
  /afterOpenChange/u,
  'identity modal should not depend only on modal animation callbacks to refill edit values'
);
assert.match(
  identityModalFieldsSource,
  /身份 \$\{shortIdentityId\(item\.platformVideoId\)\}/u,
  'ad-material platform-video selector should include a short internal identity id to disambiguate duplicate external ids'
);
assert.doesNotMatch(
  profileModalValuesSource,
  /detail\.shortVideoProfileHint\?\.matchStatus === 'unique'[\s\S]*\? detail\.shortVideoProfileHint[\s\S]*: null/u,
  'profile modal should not discard all ambiguous short-video hints before field-level fallback'
);
assert.match(
  profileModalValuesSource,
  /const shortVideoHint = detail\.shortVideoProfileHint \?\? null/u,
  'profile modal should keep ambiguous short-video hints available for field-level fallback'
);
assert.match(
  identityModalSource,
  /const shortVideoHint = detail\?\.shortVideoProfileHint \?\? null/u,
  'identity modal should keep ambiguous short-video hints available for field-level identity fallback'
);
assert.match(
  identityModalSource,
  /uniqueHintArrayValue\(shortVideoHint\?\.videoIds\)/u,
  'identity modal should prefill video id only when the short-video hint has one unique id'
);
assert.match(
  identityModalSource,
  /uniqueHintArrayValue\(shortVideoHint\?\.qianchuanMaterialIds\)/u,
  'identity modal should prefill material id only when the short-video hint has one unique id'
);
assert.match(
  profileModalValuesSource,
  /shortVideoHintProductNamesForPrefill\(shortVideoHint\)/u,
  'profile modal should gate product-name fallback separately because product names are multi-value fields'
);
assert.doesNotMatch(
  identitySummarySource,
  /shortVideoProfileHint\?\.matchStatus === 'unique'/u,
  'detail identity summaries should display any field-level unique short-video hint value, even if another field made the overall hint ambiguous'
);
assert.match(
  identitySummarySource,
  /\.\.\.\(detail\.shortVideoProfileHint\?\.qianchuanMaterialIds \|\| \[\]\)/u,
  'detail identity summaries should include material ids recovered from short-video profile hints'
);
assert.match(
  profileModalValuesSource,
  /mergeScenePathFields\(values\.scenePath, scenePathFallback\)/u,
  'profile modal should merge short-video hint scene fields into partial asset scene paths field-by-field'
);
assert.doesNotMatch(
  profileModalValuesSource,
  /scenePath:\s*values\.scenePath\?\.length[\s\S]*\?\s*values\.scenePath[\s\S]*:\s*scenePathFallback/u,
  'profile modal initial scenePath should not use path-level fallback that drops hint group/subtype fields'
);
assert.match(
  profileModalValuesSource,
  /export function formValuesToPayload\(\s*values: ProfileFormValues,\s*ownerOptions: OwnerSelectOption\[\]\s*\)/u,
  'profile payload should be derived from form values only, not detail short-video hint state'
);
assert.doesNotMatch(
  detailWorkbenchSource,
  /assetScenePath\s*\?\?\s*hintScenePath/u,
  'detail workbench should not use path-level scene fallback that hides hint group/subtype behind an asset first-level scene'
);
assert.match(
  detailWorkbenchSource,
  /resolveEffectiveScenePath\(asset, detail\.shortVideoProfileHint\)/u,
  'detail workbench should resolve scene fields with field-level asset + short-video hint merge'
);
assert.match(
  profileModalSource,
  /编辑表单只会预填可唯一确认的回流字段，不会自动写入冲突来源/u,
  'ambiguous short-video hint copy should state that only field-level unique fallback is prefilled'
);
assert.match(
  inspectorBaseTabSource,
  /source: 'asset' \| 'shortVideoHint' \| 'mixed' \| 'none'/u,
  'base tab should represent partial scene fallback as a mixed asset/short-video hint source'
);
assert.doesNotMatch(
  inspectorBaseTabSource,
  /if \(assetScenePath\?\.length\) \{\s*return \{ path: assetScenePath, source: 'asset' \};\s*\}/u,
  'base tab should not early-return asset scene path before merging hint group/subtype fields'
);
assert.match(
  inspectorBaseTabSource,
  /sceneInfo\.source === 'mixed'/u,
  'base tab should show short-video hint copy when only missing scene fields are filled from the hint'
);
assert.match(
  inspectorBaseTabSource,
  /isShortVideoHintDisplay && !showAmbiguousSceneWarning/u,
  'base tab should avoid showing the normal save-to-solidify note together with the ambiguous hint warning'
);
assert.match(
  repositoryDetailSource,
  /ranked_platform_videos/u,
  'detail query should dedupe duplicate non-archived platform-video identities before returning detail payloads'
);
assert.match(
  repositoryDetailSource,
  /live_identity_values/u,
  'detail hint query should merge active live platform-video/ad-material profile values, not only ADS fact snapshots'
);
assert.match(
  repositoryDetailSource,
  /SELECT live\.content_scene AS value/u,
  'detail hint query should expose live content scene fallback values for empty fact snapshots'
);
assert.match(
  identityMutationsSource,
  /archive_stale_qianchuan_material_for_platform_video/u,
  'platform-video update should archive stale qianchuan material links when the platform external item id changes'
);
assert.match(
  dedupeMigrationSource,
  /tmp_marketing_content_platform_video_dedupe/u,
  'migration should perform reversible historical platform-video identity dedupe'
);
assert.match(
  dedupeMigrationSource,
  /idx_marketing_content_platform_videos_asset_video_active/u,
  'migration should add an active same-asset video-id uniqueness guard'
);

console.log('content-assets identity contract passed.');
