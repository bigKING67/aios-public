import assert from 'node:assert/strict';

export function assertCreatorShortVideoUploadLinkBehavior({ contracts, makeShortVideoRow }) {
  const unboundContentAssetUploadPath = contracts.buildShortVideoContentAssetUploadPath(
    makeShortVideoRow({
      video_id: '7651600195717145963',
      video_title: '发缝不宽、不用满地找头发的别用',
      qianchuan_material_ids: ['1868146222762003'],
      asset_product_names: ['洗发水（干头）'],
      asset_video_types: ['KOC挂车视频'],
      asset_content_scenes: ['原点场景'],
      asset_content_scene_groups: ['头皮'],
      asset_content_scene_subtypes: ['防脱初尝者'],
      author_nickname: '达人A',
      author_douyin_id: 'douyin-creator-1',
      stat_date: '2026-06-25',
    })
  );
  const unboundContentAssetUploadUrl = new URL(unboundContentAssetUploadPath, 'https://aios.local');
  assert.equal(
    unboundContentAssetUploadUrl.pathname,
    '/marketing/content-assets',
    'unbound content-asset cell should point to content-assets upload page'
  );
  assert.equal(unboundContentAssetUploadUrl.searchParams.get('upload'), '1', 'upload link should request upload modal open');
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('source'),
    'creator-short-video',
    'upload link should preserve creator short-video source context'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('videoId'),
    '7651600195717145963',
    'upload link should carry existing Douyin video id'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('materialId'),
    '1868146222762003',
    'upload link should carry existing Qianchuan material id'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('title'),
    '发缝不宽、不用满地找头发的别用',
    'upload link should carry current row title for content-assets prefill'
  );
  assert.deepEqual(
    unboundContentAssetUploadUrl.searchParams.getAll('productName'),
    ['洗发水（干头）'],
    'upload link should carry maintained product names for content-assets prefill'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('creatorName'),
    '达人A',
    'upload link should carry current row creator name for content-assets prefill'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('creatorDouyinId'),
    'douyin-creator-1',
    'upload link should carry current row creator Douyin id for content-assets prefill'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('contentScene'),
    '原点场景',
    'upload link should carry current row scene for content-assets prefill'
  );
  assert.equal(
    unboundContentAssetUploadUrl.searchParams.get('statDate'),
    '2026-06-25',
    'upload link should carry current row stat date for content-assets review notice'
  );

  const uploadPrefill = contracts.buildContentAssetUploadPrefillFromSearch(unboundContentAssetUploadUrl.search);
  assert.ok(uploadPrefill, 'content-assets page should parse upload prefill query params');
  assert.equal(uploadPrefill.values.title, '发缝不宽、不用满地找头发的别用', 'upload prefill should fill title');
  assert.equal(uploadPrefill.values.externalVideoId, '7651600195717145963', 'upload prefill should fill Douyin video id');
  assert.equal(uploadPrefill.values.externalItemId, '1868146222762003', 'upload prefill should fill Qianchuan material id');
  assert.equal(uploadPrefill.values.creatorName, '达人A', 'upload prefill should fill creator name');
  assert.equal(uploadPrefill.values.creatorDouyinId, 'douyin-creator-1', 'upload prefill should keep creator Douyin account id');
  assert.equal(uploadPrefill.values.videoType, 'koc_shoppable_video', 'upload prefill should normalize video type label to form value');
  assert.deepEqual(uploadPrefill.values.productNames, ['洗发水（干头）'], 'upload prefill should fill product names');
  assert.deepEqual(
    uploadPrefill.values.scenePath,
    ['原点场景', '头皮', '防脱初尝者'],
    'upload prefill should fill content scene path'
  );
  assert.equal(
    uploadPrefill.requiresMaterialConfirmation,
    true,
    'prefilled Qianchuan material id should require business confirmation before saving'
  );
  assert.match(uploadPrefill.notice || '', /短视频看板/u, 'upload prefill should show source review notice');
  const uploadPrefillPayload = contracts.buildUploadMetadataPayload(uploadPrefill.values, []);
  assert.equal(
    uploadPrefillPayload.platformVideo?.accountId,
    'douyin-creator-1',
    'upload payload should persist creator Douyin id as platform account id'
  );
  assert.equal(
    uploadPrefillPayload.platformVideo?.publishTitle,
    '发缝不宽、不用满地找头发的别用',
    'upload payload should persist short-video title into platform identity'
  );
  assert.equal(
    uploadPrefillPayload.platformVideo?.externalVideoId,
    '7651600195717145963',
    'upload payload should keep Douyin video id for dashboard backlink'
  );
  assert.equal(
    uploadPrefillPayload.platformVideo?.externalItemId,
    '1868146222762003',
    'upload payload should keep Qianchuan material id for dashboard backlink'
  );

  const multiMaterialContentAssetUploadPath = contracts.buildShortVideoContentAssetUploadPath(
    makeShortVideoRow({
      video_id: '7648847169948575168',
      video_title: '买到好东西啦',
      qianchuan_material_ids: ['1866773516532071', '7648900697280610338', '1866773516532071'],
      author_nickname: '安娜吖',
      author_douyin_id: 'annaouni258',
      stat_date: '2026-06-25',
    })
  );
  const multiMaterialContentAssetUploadUrl = new URL(multiMaterialContentAssetUploadPath, 'https://aios.local');
  assert.equal(
    multiMaterialContentAssetUploadUrl.searchParams.get('materialId'),
    null,
    'multiple material id rows should not silently choose the first materialId for upload prefill'
  );
  assert.deepEqual(
    multiMaterialContentAssetUploadUrl.searchParams.getAll('materialIdCandidate'),
    ['1866773516532071', '7648900697280610338'],
    'multiple material id rows should carry read-only candidate ids for upload review'
  );
  const multiMaterialUploadPrefill = contracts.buildContentAssetUploadPrefillFromSearch(
    multiMaterialContentAssetUploadUrl.search
  );
  assert.ok(multiMaterialUploadPrefill, 'content-assets page should parse upload prefill with material candidates');
  assert.equal(
    multiMaterialUploadPrefill.values.externalItemId,
    undefined,
    'multiple material id candidates should not prefill a single Qianchuan material id'
  );
  assert.deepEqual(
    multiMaterialUploadPrefill.materialIdCandidates,
    ['1866773516532071', '7648900697280610338'],
    'upload prefill should preserve multiple candidate material ids for notice copy'
  );
  assert.equal(
    multiMaterialUploadPrefill.requiresMaterialConfirmation,
    false,
    'multiple candidate ids should not trigger save confirmation until the user manually fills an id'
  );
  assert.match(
    multiMaterialUploadPrefill.notice || '',
    /短视频明细命中多个千川素材 ID：1866773516532071、7648900697280610338。系统不会自动预填/u,
    'multiple material id prefill should explain that the system will not auto-prefill one id'
  );
}
