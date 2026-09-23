#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import dayjs from 'dayjs';
import {
  assertCreatorShortVideoDataSourceBehavior,
} from '../../lib/frontend/creator-short-video-data-source-behavior-fixtures.mjs';
import {
  assertCreatorShortVideoRenderingBehavior,
} from '../../lib/frontend/creator-short-video-rendering-behavior-fixtures.mjs';
import {
  assertCreatorShortVideoUploadLinkBehavior,
} from '../../lib/frontend/creator-short-video-upload-link-behavior-fixtures.mjs';
const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function importShortVideoContracts() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'dashboard-creator-short-video-'));
  const entryPath = path.join(tempDir, 'entry.ts');
  const outputPath = path.join(tempDir, 'bundle.mjs');

  await writeFile(
    entryPath,
    [
      `export {`,
      `  buildCreatorNameFilterOptions,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-detail-filters'))};`,
      `export {`,
      `  buildCreatorShortVideoDashboardMetricCards,`,
      `  buildCreatorShortVideoSummaryRows,`,
      `  formatShortVideoAssetVideoType,`,
      `  formatShortVideoAssetVideoTypeValues,`,
      `  normalizeCreatorShortVideoDetailRows,`,
      `  resolveShortVideoCreatorFilterValues,`,
      `  resolveShortVideoOwnerFilterValues,`,
      `  resolveShortVideoProductFilterValues,`,
      `  resolveShortVideoSceneFilterValues,`,
      `  sortCreatorShortVideoDetailRows,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-dashboard-model'))};`,
      `export {`,
      `  buildShortVideoContentAssetUploadPath,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-content-asset-upload-link'))};`,
      `export {`,
      `  isShortVideoMetricEntityNewInRange,`,
      `  resolveShortVideoGsv,`,
      `  resolveShortVideoManualCreatorFeeAmount,`,
      `  resolveShortVideoMetricEntityKey,`,
      `  resolveShortVideoQianchuanGsv,`,
      `  resolveShortVideoQianchuanRoi,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-metrics'))};`,
      `export {`,
      `  buildCreatorShortVideoManualPayload,`,
      `  CREATOR_TYPE_INPUT_REJECTED_MESSAGE,`,
      `  CREATOR_TYPE_OPTIONS,`,
      `  isCreatorTypeInputRejected,`,
      `  normalizeCreatorTypeInput,`,
      `  normalizeCreatorTypeValue,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-manual-attrs-utils'))};`,
      `export {`,
      `  buildCreatorShortVideoSceneStrategyTree,`,
      `  formatSceneStrategyPath,`,
      `  resolveSceneStrategyPath,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-scene-strategy-model'))};`,
      `export {`,
      `  buildCreatorShortVideoTrendRows,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-trend-chart'))};`,
      `export {`,
      `  buildUploadMetadataPayload,`,
      `  buildContentAssetUploadPrefillFromSearch,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/marketing/content-assets/_components/content-assets-import-modal-values'))};`,
      '',
    ].join('\n'),
    'utf8'
  );

  await build({
    alias: { '@': path.join(REPO_ROOT, 'apps/web-vite/src') },
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function makeShortVideoRow(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    detail_grain: overrides.detail_grain ?? 'trade_video_day',
    stat_date: overrides.stat_date ?? '2026-06-05',
    influencer_id: overrides.influencer_id ?? 'influencer-1',
    influencer_name: overrides.influencer_name ?? '达人A',
    author_douyin_id: overrides.author_douyin_id ?? 'douyin-1',
    video_id: overrides.video_id ?? 'video-1',
    manual_video_id: overrides.manual_video_id ?? overrides.video_id ?? 'video-1',
    manual_scope_type: overrides.manual_scope_type ?? 'video',
    manual_creator_fee_amount: overrides.manual_creator_fee_amount ?? 0,
    publish_time: overrides.publish_time ?? '2026-06-03 12:00:00',
    user_pay_amount: overrides.user_pay_amount ?? 0,
    shortvideo_gmv: overrides.shortvideo_gmv ?? 0,
    shortvideo_user_pay_amount: overrides.shortvideo_user_pay_amount ?? 0,
    refund_amount: overrides.refund_amount ?? 0,
    qianchuan_overall_cost: overrides.qianchuan_overall_cost ?? 0,
    qianchuan_overall_gmv: overrides.qianchuan_overall_gmv ?? 0,
    qianchuan_net_gmv: overrides.qianchuan_net_gmv ?? 0,
    qianchuan_overall_order_count: overrides.qianchuan_overall_order_count ?? 0,
    qianchuan_material_ids: overrides.qianchuan_material_ids ?? [],
    qianchuan_material_key: overrides.qianchuan_material_key ?? null,
    qianchuan_material_created_at_max: overrides.qianchuan_material_created_at_max ?? null,
    asset_product_names: overrides.asset_product_names ?? [],
    asset_owner_names: overrides.asset_owner_names ?? [],
    asset_video_types: overrides.asset_video_types ?? [],
    asset_content_scenes: overrides.asset_content_scenes ?? [],
    asset_content_scene_groups: overrides.asset_content_scene_groups ?? [],
    asset_content_scene_subtypes: overrides.asset_content_scene_subtypes ?? [],
    product_id: overrides.product_id ?? null,
    manual_creator_type: overrides.manual_creator_type ?? null,
    manual_mcn: overrides.manual_mcn ?? null,
    manual_fans_count: overrides.manual_fans_count ?? null,
    manual_creator_fee_note: overrides.manual_creator_fee_note ?? null,
    ...overrides,
  };
}

const contracts = await importShortVideoContracts();
await assertCreatorShortVideoDataSourceBehavior({ repoRoot: REPO_ROOT });
const normalizedRows = contracts.normalizeCreatorShortVideoDetailRows([
  {
    id: 1,
    asset_product_names: '产品A',
    asset_owner_names: null,
    asset_video_types: ['口播', '', null],
    asset_content_scenes: undefined,
    asset_content_scene_groups: '大场景A',
    asset_content_scene_subtypes: 123,
  },
  null,
  'not-a-row',
]);

assert.equal(normalizedRows.length, 1, 'detail row normalizer should ignore non-object rows');
assert.deepEqual(normalizedRows[0].asset_product_names, ['产品A'], 'scalar product labels should become arrays');
assert.deepEqual(normalizedRows[0].asset_owner_names, [], 'null owner labels should become empty arrays');
assert.deepEqual(normalizedRows[0].asset_video_types, ['口播'], 'array labels should be compacted');
assert.deepEqual(
  contracts.formatShortVideoAssetVideoTypeValues([
    'kol_seeding_video',
    'koc_seeding_video',
    'koc_shoppable_video',
    'store_live_video',
    'KOC种草视频',
    'KOC挂车视频',
  ]),
  ['KOL种草视频', 'KOC种草', 'KOC挂车视频', '店播视频'],
  'short-video asset video type formatter should display content-asset enums as business labels'
);
assert.deepEqual(
  contracts.normalizeCreatorShortVideoDetailRows([
    makeShortVideoRow({ asset_video_types: ['koc_shoppable_video', ''] }),
  ])[0].asset_video_types,
  ['KOC挂车视频'],
  'normalized short-video detail rows should not leak raw internal video type enum values'
);
assert.deepEqual(normalizedRows[0].asset_content_scene_groups, ['大场景A'], 'scalar scene group should become an array');
assert.deepEqual(normalizedRows[0].asset_content_scene_subtypes, ['123'], 'numeric scene subtype should become an array value');
assert.equal(normalizedRows[0].manual_can_edit, false, 'missing manual edit permission should default to false');
assert.equal(normalizedRows[0].manual_can_delete, false, 'missing manual delete permission should default to false');

const sortedDetailRows = contracts.sortCreatorShortVideoDetailRows([
  makeShortVideoRow({
    id: 1,
    stat_date: '2026-06-15',
    asset_product_names: [],
    asset_ids: [],
    qianchuan_material_ids: [],
    qianchuan_overall_gmv: 999,
    influencer_name: '空产品高GMV',
  }),
  makeShortVideoRow({
    id: 2,
    stat_date: '2026-06-15',
    asset_product_names: ['洗发水（干头）'],
    asset_ids: [],
    qianchuan_material_ids: [],
    qianchuan_overall_gmv: 1,
    influencer_name: '有产品无素材',
  }),
  makeShortVideoRow({
    id: 3,
    stat_date: '2026-06-15',
    asset_product_names: ['洗发水（干头）'],
    asset_ids: ['asset-1'],
    qianchuan_material_ids: [],
    qianchuan_overall_gmv: 2,
    influencer_name: '有产品有素材',
  }),
  makeShortVideoRow({
    id: 4,
    stat_date: '2026-06-15',
    asset_product_names: ['洗发水（干头）'],
    asset_ids: ['asset-2'],
    qianchuan_material_ids: ['mat-1'],
    qianchuan_overall_gmv: 3,
    influencer_name: '有产品有素材有千川',
  }),
  makeShortVideoRow({
    id: 5,
    stat_date: '2026-06-14',
    asset_product_names: ['洗发水（油头）'],
    asset_ids: ['asset-3'],
    qianchuan_material_ids: ['mat-2'],
    qianchuan_overall_gmv: 9999,
    influencer_name: '旧日期',
  }),
]);
assert.deepEqual(
  sortedDetailRows.map((row) => row.id),
  [4, 3, 2, 1, 5],
  'short-video detail default sort should keep same-date product/material rows before empty product rows'
);

assertCreatorShortVideoUploadLinkBehavior({ contracts, makeShortVideoRow });

const abnormalPermissionRows = contracts.normalizeCreatorShortVideoDetailRows([
  makeShortVideoRow({
    manual_can_edit: 'true',
    manual_can_delete: 1,
  }),
]);
assert.equal(abnormalPermissionRows[0].manual_can_edit, false, 'non-boolean edit permission should fail closed');
assert.equal(abnormalPermissionRows[0].manual_can_delete, false, 'non-boolean delete permission should fail closed');

const reusedManualRows = contracts.normalizeCreatorShortVideoDetailRows([
  makeShortVideoRow({
    id: 11,
    author_douyin_id: 'douyin-reuse',
    video_id: 'video-reuse',
    manual_attr_id: 42,
    manual_scope_type: 'video',
    manual_video_id: 'video-reuse',
    manual_creator_fee_amount: 1234.56,
    manual_creator_fee_note: '一次维护',
    manual_creator_type: '彩妆',
    manual_mcn: '机构A',
    manual_can_edit: true,
    manual_can_delete: true,
  }),
  makeShortVideoRow({
    id: 12,
    author_douyin_id: 'douyin-reuse',
    video_id: 'video-reuse',
    manual_attr_id: null,
    manual_scope_type: null,
    manual_video_id: null,
    manual_creator_fee_amount: null,
    manual_creator_fee_note: null,
    manual_creator_type: null,
    manual_mcn: null,
    manual_can_edit: true,
    manual_can_delete: false,
  }),
  makeShortVideoRow({
    id: 13,
    author_douyin_id: 'douyin-reuse',
    video_id: 'video-other',
    manual_attr_id: null,
    manual_scope_type: null,
    manual_video_id: null,
    manual_creator_fee_amount: null,
  }),
]);

assert.equal(
  reusedManualRows[1].manual_attr_id,
  42,
  'manual attrs should be reused for repeated rows with the same author Douyin id and video id'
);
assert.equal(
  reusedManualRows[1].manual_creator_fee_amount,
  1234.56,
  'cooperation fee should be maintained once per author Douyin id plus video id'
);
assert.equal(
  reusedManualRows[1].manual_creator_fee_note,
  '一次维护',
  'cooperation fee note should follow the reused video-scoped manual attrs'
);
assert.equal(
  reusedManualRows[1].manual_creator_type,
  '彩妆',
  'video-scoped manual creator labels should reuse the same maintained record'
);
assert.equal(
  reusedManualRows[1].manual_mcn,
  '机构A',
  'video-scoped MCN should reuse the same maintained record'
);
assert.equal(
  reusedManualRows[1].manual_can_edit,
  true,
  'a repeated row should reuse backend edit permission facts from the video-scoped manual attrs'
);
assert.equal(
  reusedManualRows[1].manual_can_delete,
  true,
  'a repeated row should reuse backend delete permission facts from the video-scoped manual attrs'
);
assert.equal(
  reusedManualRows[2].manual_creator_fee_amount,
  null,
  'manual attrs must not leak to a different video id'
);

const rawLongProductId = '12345678901234567890';
assert.deepEqual(
  contracts.resolveShortVideoProductFilterValues(
    makeShortVideoRow({ asset_product_names: ['维护产品A', '维护产品B'], product_id: rawLongProductId })
  ),
  ['维护产品A', '维护产品B'],
  'product filter should use maintained product names when available'
);
const unmaintainedProductFilterValues = contracts.resolveShortVideoProductFilterValues(
  makeShortVideoRow({ asset_product_names: [], product_id: rawLongProductId })
);
assert.deepEqual(
  unmaintainedProductFilterValues,
  ['未维护产品'],
  'product filter should expose an explicit fallback label instead of raw product id'
);
assert.equal(
  unmaintainedProductFilterValues.includes(rawLongProductId),
  false,
  'product filter should not expose long raw product ids as filter values'
);
assert.deepEqual(
  contracts.resolveShortVideoSceneFilterValues(makeShortVideoRow()),
  ['未维护场景'],
  'scene filter should expose an explicit fallback label'
);
assert.deepEqual(
  contracts.resolveShortVideoOwnerFilterValues(makeShortVideoRow()),
  ['未分配负责人'],
  'owner filter should expose an explicit fallback label'
);
const namedCreatorFilterValue = contracts.resolveShortVideoCreatorFilterValues(
  makeShortVideoRow({ author_nickname: '达人A', author_douyin_id: 'douyin-1' })
);
assert.deepEqual(
  namedCreatorFilterValue,
  { label: '达人A', value: '达人A' },
  'creator filter should use creator nickname as both the visible label and Select value'
);
const unnamedCreatorFilterValue = contracts.resolveShortVideoCreatorFilterValues(
  makeShortVideoRow({ author_nickname: '', influencer_nickname: '', influencer_name: '', author_name_snapshot: '达人快照A' })
);
assert.deepEqual(
  unnamedCreatorFilterValue,
  { label: '未命名达人', value: '未命名达人' },
  'creator filter should group missing nicknames under a safe fallback label instead of author snapshots or Douyin ids'
);
const creatorNameFilterOptions = contracts.buildCreatorNameFilterOptions(
  [
    {
      creator: namedCreatorFilterValue,
      cooperationStatus: '产品A',
      owner: '场景A',
      platform: '负责人A',
    },
    {
      creator: unnamedCreatorFilterValue,
      cooperationStatus: '产品A',
      owner: '场景A',
      platform: '负责人A',
    },
    {
      creator: contracts.resolveShortVideoCreatorFilterValues(
        makeShortVideoRow({ author_nickname: '', influencer_nickname: '', influencer_name: '', author_name_snapshot: '', author_douyin_id: '66983808475' })
      ),
      cooperationStatus: '产品A',
      owner: '场景A',
      platform: '负责人A',
    },
  ],
  {}
);
assert.deepEqual(
  creatorNameFilterOptions,
  [
    { label: '未命名达人 (2)', value: '未命名达人' },
    { label: '达人A (1)', value: '达人A' },
  ],
  'creator filter dropdown options should display nickname/count or one grouped unnamed fallback'
);
assert.equal(
  creatorNameFilterOptions.some((option) => /douyin-1|66983808475/u.test(`${option.label} ${option.value}`)),
  false,
  'creator filter dropdown labels and values should not expose Douyin ids'
);

assert.equal(
  contracts.resolveShortVideoGsv(makeShortVideoRow({ user_pay_amount: 0, refund_amount: 120 })),
  -120,
  'refund-only rows should keep negative GSV instead of being front-end zeroed'
);
assert.equal(
  contracts.resolveShortVideoManualCreatorFeeAmount(
    makeShortVideoRow({ manual_scope_type: 'product', manual_creator_fee_amount: 99 })
  ),
  0,
  'cooperation fee should only count video-scoped manual attrs'
);
assert.equal(
  contracts.resolveShortVideoManualCreatorFeeAmount(
    makeShortVideoRow({ video_id: 'v1', manual_video_id: 'v1', manual_creator_fee_amount: 99 })
  ),
  99,
  'cooperation fee should count the matching video-scoped manual attr'
);
assert.equal(
  contracts.resolveShortVideoQianchuanGsv(makeShortVideoRow({ qianchuan_net_gmv: 123.45 })),
  123.45,
  'Qianchuan GSV should read qianchuan_net_gmv instead of cart refund math'
);
assert.equal(
  contracts.resolveShortVideoQianchuanRoi(
    makeShortVideoRow({ qianchuan_overall_gmv: 200, qianchuan_overall_cost: 50, manual_creator_fee_amount: 999 })
  ),
  4,
  'Qianchuan ROI should use Qianchuan GMV divided by Qianchuan cost only'
);

assert.equal(contracts.normalizeCreatorTypeValue('头部达人'), null, 'legacy creator level values should be excluded');
assert.equal(
  contracts.isCreatorTypeInputRejected('头部达人'),
  true,
  'legacy creator level input should be rejected instead of silently falling back during manual maintenance'
);
assert.match(
  contracts.CREATOR_TYPE_INPUT_REJECTED_MESSAGE,
  /不支持头部、腰部、尾部、KOC、机构达人/u,
  'legacy creator level rejection should have user-visible copy'
);
assert.deepEqual(
  contracts.CREATOR_TYPE_OPTIONS
    .map((option) => option.value)
    .filter((value) => ['头部达人', '腰部达人', '尾部达人', 'KOC/素人', 'KOC', '素人', '机构达人', '其他'].includes(value)),
  [],
  'creator type options should only contain industry/content tags, not legacy creator levels'
);
assert.equal(contracts.normalizeCreatorTypeInput('美妆护肤,彩妆'), '彩妆', 'custom pasted creator type should use the last entered item');
assert.equal(
  contracts.buildCreatorShortVideoManualPayload(makeShortVideoRow({ author_douyin_id: '', influencer_id: '' }), {
    fansCount: 100,
    creatorType: '彩妆',
    mcn: '机构A',
    creatorFeeAmount: 1000,
    creatorFeeNote: '首单',
  }),
  null,
  'manual payload should reject rows without author Douyin id'
);
assert.equal(
  contracts.buildCreatorShortVideoManualPayload(makeShortVideoRow({ author_douyin_id: '', influencer_id: 'influencer-1' }), {
    fansCount: 100,
    creatorType: '彩妆',
    mcn: '机构A',
    creatorFeeAmount: 1000,
    creatorFeeNote: '首单',
  }),
  null,
  'manual payload should reject rows without real author_douyin_id even if influencer_id exists'
);
assert.equal(
  contracts.buildCreatorShortVideoManualPayload(makeShortVideoRow({ video_id: '' }), {
    fansCount: 100,
    creatorType: '彩妆',
    mcn: '机构A',
    creatorFeeAmount: 1000,
    creatorFeeNote: '首单',
  }),
  null,
  'manual payload should reject rows without video id'
);
assert.deepEqual(
  contracts.buildCreatorShortVideoManualPayload(makeShortVideoRow({ video_id: 'v2' }), {
    fansCount: 100,
    creatorType: '彩妆',
    mcn: '机构A',
    creatorFeeAmount: 1000,
    creatorFeeNote: '首单',
  }),
  {
    authorDouyinId: 'douyin-1',
    authorNameSnapshot: '达人A',
    videoId: 'v2',
    productId: null,
    fansCount: 100,
    creatorType: '彩妆',
    mcn: '机构A',
    creatorFeeAmount: 1000,
    creatorFeeNote: '首单',
  },
  'manual payload should remain video-scoped and keep productId null'
);
assert.equal(
  contracts.resolveShortVideoGsv(makeShortVideoRow({ user_pay_amount: 200, refund_amount: 40 })),
  160,
  'GMV non-zero rows should display the GSV value'
);

const currentRange = {
  start: dayjs('2026-06-01'),
  end: dayjs('2026-06-10'),
};

const materialOnlyMetricRow = makeShortVideoRow({
  id: 33,
  detail_grain: 'qianchuan_material_day',
  video_id: '',
  manual_video_id: 'manual-only-video',
  publish_time: '2026-06-04 10:00:00',
  user_pay_amount: 0,
  refund_amount: 0,
  qianchuan_material_ids: ['mat-only-1'],
  qianchuan_material_key: 'mat-only-1',
  qianchuan_material_created_at_max: '2026-06-04 10:00:00',
  qianchuan_overall_gmv: 40,
  qianchuan_net_gmv: 35,
  qianchuan_overall_cost: 10,
  qianchuan_overall_order_count: 2,
  manual_creator_fee_amount: 999,
});

assert.equal(
  contracts.resolveShortVideoMetricEntityKey(materialOnlyMetricRow),
  '',
  'rows without fact video_id should not increase video-count entity keys even when manual_video_id exists'
);
assert.equal(
  contracts.isShortVideoMetricEntityNewInRange(materialOnlyMetricRow, currentRange),
  false,
  'rows without fact video_id should not increase new-video counts even when manual_video_id and publish_time exist'
);
assert.equal(
  contracts.isShortVideoMetricEntityNewInRange(
    makeShortVideoRow({
      video_id: 'metric-v-with-material',
      publish_time: '',
      qianchuan_material_ids: ['mat-linked-1'],
      qianchuan_material_created_at_max: '2026-06-04 10:00:00',
    }),
    currentRange
  ),
  false,
  'video-linked rows should not use material created time as the new-video fallback'
);
assert.equal(
  contracts.resolveShortVideoManualCreatorFeeAmount(materialOnlyMetricRow),
  0,
  'material-only rows should not participate in video-scoped manual cooperation fee reuse'
);

const summaryRows = contracts.buildCreatorShortVideoSummaryRows(
  [
    makeShortVideoRow({
      id: 101,
      stat_date: '2026-06-01',
      video_id: 'summary-v1',
      manual_video_id: 'summary-v1',
      user_pay_amount: 100,
      refund_amount: 10,
      video_view_count: 1000,
      qianchuan_material_ids: ['summary-m1'],
      qianchuan_overall_impression_count: 1000,
      qianchuan_overall_click_count: 100,
      qianchuan_overall_cost: 20,
      qianchuan_overall_order_count: 4,
      qianchuan_overall_gmv: 80,
      qianchuan_net_gmv: 70,
      asset_product_names: ['洗发水'],
    }),
    makeShortVideoRow({
      id: 102,
      stat_date: '2026-06-08',
      video_id: 'summary-v1',
      manual_video_id: 'summary-v1',
      user_pay_amount: 50,
      refund_amount: 5,
      video_view_count: 500,
      qianchuan_material_ids: ['summary-m2'],
      qianchuan_overall_impression_count: 500,
      qianchuan_overall_click_count: 50,
      qianchuan_overall_cost: 10,
      qianchuan_overall_order_count: 2,
      qianchuan_overall_gmv: 40,
      qianchuan_net_gmv: 35,
      asset_product_names: ['洗发水', '护发精华'],
    }),
    makeShortVideoRow({
      id: 103,
      detail_grain: 'qianchuan_material_day',
      stat_date: '2026-06-02',
      video_id: '',
      manual_video_id: '',
      qianchuan_material_ids: ['summary-mat-only'],
      qianchuan_material_key: 'summary-mat-only',
      qianchuan_overall_cost: 6,
      qianchuan_overall_order_count: 1,
      qianchuan_overall_gmv: 18,
      qianchuan_net_gmv: 15,
    }),
    makeShortVideoRow({
      id: 104,
      detail_grain: 'qianchuan_material_day',
      stat_date: '2026-06-09',
      video_id: '',
      manual_video_id: '',
      qianchuan_material_ids: ['summary-mat-only'],
      qianchuan_material_key: 'summary-mat-only',
      qianchuan_overall_cost: 4,
      qianchuan_overall_order_count: 1,
      qianchuan_overall_gmv: 12,
      qianchuan_net_gmv: 10,
    }),
  ],
  currentRange
);
assert.equal(summaryRows.length, 2, 'short-video table rows should aggregate by video id or material id across the selected range');
const videoSummaryRow = summaryRows.find((row) => row.video_id === 'summary-v1');
assert.ok(videoSummaryRow, 'video summary row should be present');
assert.equal(videoSummaryRow.detail_grain, 'period_summary', 'table summary rows should expose period summary grain');
assert.equal(videoSummaryRow.stat_date, '2026-06-08', 'summary rows should keep the latest source date internally for upload review context');
assert.equal(videoSummaryRow.user_pay_amount, 150, 'video summary rows should sum trade GMV across dates');
assert.equal(videoSummaryRow.refund_amount, 15, 'video summary rows should sum refunds across dates');
assert.equal(videoSummaryRow.video_view_count, 1500, 'video summary rows should sum trade views across dates');
assert.deepEqual(videoSummaryRow.qianchuan_material_ids, ['summary-m1', 'summary-m2'], 'video summary rows should union material ids');
assert.deepEqual(videoSummaryRow.asset_product_names, ['洗发水', '护发精华'], 'video summary rows should union maintained products');
assert.equal(videoSummaryRow.qianchuan_overall_gmv, 120, 'video summary rows should sum Qianchuan GMV');
assert.equal(videoSummaryRow.qianchuan_overall_cost, 30, 'video summary rows should sum Qianchuan cost');
assert.equal(videoSummaryRow.qianchuan_overall_pay_roi, 4, 'video summary rows should recompute ROI from summed GMV and cost');
const materialSummaryRow = summaryRows.find((row) => row.qianchuan_material_key === 'summary-mat-only');
assert.ok(materialSummaryRow, 'material-only summary row should be present');
assert.equal(materialSummaryRow.video_id, '', 'material-only summary rows should not invent a video id');
assert.equal(materialSummaryRow.shortvideo_count, 0, 'material-only summary rows should not increase video count');
assert.equal(materialSummaryRow.qianchuan_overall_gmv, 30, 'material-only summary rows should keep summed Qianchuan GMV');
assert.equal(materialSummaryRow.qianchuan_overall_cost, 10, 'material-only summary rows should keep summed Qianchuan cost');

const metricCards = contracts.buildCreatorShortVideoDashboardMetricCards(
  [
    makeShortVideoRow({
      video_id: 'metric-v1',
      manual_video_id: 'metric-v1',
      publish_time: '2026-06-03 12:00:00',
      user_pay_amount: 100,
      refund_amount: 10,
      qianchuan_overall_gmv: 80,
      qianchuan_net_gmv: 70,
      qianchuan_overall_cost: 20,
      qianchuan_overall_order_count: 4,
      manual_creator_fee_amount: 300,
    }),
    makeShortVideoRow({
      id: 31,
      video_id: 'metric-v2',
      manual_video_id: 'metric-v2',
      publish_time: '2026-05-03 12:00:00',
      user_pay_amount: 0,
      qianchuan_overall_gmv: 20,
      qianchuan_net_gmv: 18,
      qianchuan_overall_cost: 5,
      qianchuan_overall_order_count: 1,
      manual_creator_fee_amount: 200,
    }),
    makeShortVideoRow({
      id: 32,
      video_id: 'metric-v3',
      manual_video_id: 'metric-v3',
      publish_time: '2026-05-04 12:00:00',
      user_pay_amount: 120,
      qianchuan_overall_gmv: 0,
      qianchuan_net_gmv: 0,
      qianchuan_overall_cost: 0,
    }),
    materialOnlyMetricRow,
  ],
  currentRange
);
assert.deepEqual(
  metricCards.map((item) => item.label),
  [
    '总视频数',
    '新视频数',
    '合作费用',
    '出单数',
    '出单率',
    '挂车GMV',
    '挂车GSV（退款时间）',
    '千川GMV',
    '千川GSV',
    '千川消耗',
    '千川订单数',
    '千川ROI',
  ],
  'short-video KPI cards should keep five core cards plus seven transaction/traffic cards'
);
assert.deepEqual(
  metricCards.slice(0, 5).map((item) => item.featured),
  [true, true, true, true, true],
  'the first five short-video KPI cards should remain featured as the core business group'
);
assert.equal(
  metricCards.find((item) => item.label === '出单数')?.value,
  '3',
  'short-video ordered count should de-duplicate videos by video id only'
);
assert.equal(
  metricCards.find((item) => item.label === '出单率')?.value,
  '100.00%',
  'short-video order rate should use paid-or-cart sold videos divided by total videos'
);
assert.equal(metricCards.find((item) => item.label === '总视频数')?.value, '3', 'material-only Qianchuan rows should not increase video counts');
assert.equal(metricCards.find((item) => item.label === '新视频数')?.value, '1', 'new-video counts should use video publish time only');
assert.equal(metricCards.find((item) => item.label === '千川GMV')?.value, '¥140.00', 'material-only rows should contribute Qianchuan GMV');
assert.equal(metricCards.find((item) => item.label === '千川GSV')?.value, '¥123.00', 'material-only rows should contribute Qianchuan GSV');
assert.equal(metricCards.find((item) => item.label === '千川消耗')?.value, '¥35.00', 'material-only rows should contribute Qianchuan cost');
assert.equal(metricCards.find((item) => item.label === '千川订单数')?.value, '7', 'material-only rows should contribute Qianchuan order count');

const { treeRows, totalMetrics } = contracts.buildCreatorShortVideoSceneStrategyTree(
  [
    makeShortVideoRow({
      video_id: 'v1',
      manual_video_id: 'v1',
      user_pay_amount: 100,
      refund_amount: 10,
      qianchuan_overall_cost: 20,
      qianchuan_overall_gmv: 80,
      qianchuan_net_gmv: 70,
      qianchuan_overall_order_count: 4,
      manual_creator_fee_amount: 30,
      asset_content_scenes: ['种草', '二次场景不重复计数'],
      asset_content_scene_groups: ['教程'],
      asset_content_scene_subtypes: ['妆容'],
    }),
    makeShortVideoRow({
      id: 2,
      video_id: 'v1',
      manual_video_id: 'v1',
      user_pay_amount: 50,
      qianchuan_overall_cost: 5,
      qianchuan_overall_gmv: 20,
      qianchuan_net_gmv: 18,
      qianchuan_overall_order_count: 1,
      manual_creator_fee_amount: 99,
      asset_content_scenes: ['种草'],
      asset_content_scene_groups: ['教程'],
      asset_content_scene_subtypes: ['妆容'],
    }),
    makeShortVideoRow({
      id: 3,
      video_id: 'v2',
      manual_video_id: 'v2',
      user_pay_amount: 0,
      refund_amount: 20,
      qianchuan_overall_cost: 2,
      qianchuan_overall_gmv: 5,
      qianchuan_net_gmv: -1,
      qianchuan_overall_order_count: 1,
      publish_time: '2026-05-01 09:00:00',
      asset_content_scenes: [],
      asset_content_scene_groups: [],
      asset_content_scene_subtypes: [],
    }),
    makeShortVideoRow({
      id: 4,
      video_id: 'v3',
      manual_video_id: 'v3',
      publish_time: '2026-05-02 12:00:00',
      user_pay_amount: 60,
      refund_amount: 0,
      qianchuan_overall_cost: 0,
      qianchuan_overall_gmv: 0,
      qianchuan_net_gmv: 0,
      asset_content_scenes: ['种草'],
      asset_content_scene_groups: ['教程'],
      asset_content_scene_subtypes: ['妆容'],
    }),
    makeShortVideoRow({
      id: 5,
      detail_grain: 'qianchuan_material_day',
      video_id: '',
      manual_video_id: '',
      publish_time: '',
      user_pay_amount: 0,
      refund_amount: 0,
      qianchuan_material_ids: ['mat-scene-1'],
      qianchuan_material_key: 'mat-scene-1',
      qianchuan_material_created_at_max: '2026-06-06 10:00:00',
      qianchuan_overall_cost: 10,
      qianchuan_overall_gmv: 40,
      qianchuan_net_gmv: 38,
      qianchuan_overall_order_count: 2,
      asset_content_scenes: ['种草'],
      asset_content_scene_groups: ['教程'],
      asset_content_scene_subtypes: ['妆容'],
    }),
    makeShortVideoRow({
      id: 6,
      detail_grain: 'qianchuan_material_day',
      video_id: '',
      manual_video_id: '',
      publish_time: '',
      user_pay_amount: 0,
      refund_amount: 0,
      qianchuan_material_ids: ['mat-fallback-1'],
      qianchuan_material_key: 'mat-fallback-1',
      qianchuan_material_created_at_max: '2026-06-07 10:00:00',
      qianchuan_overall_cost: 5,
      qianchuan_overall_gmv: 15,
      qianchuan_net_gmv: 12,
      qianchuan_overall_order_count: 1,
      asset_content_scenes: [],
      asset_content_scene_groups: [],
      asset_content_scene_subtypes: [],
    }),
  ],
  currentRange
);

assert.equal(totalMetrics.totalVideoCount, 3, 'scene strategy total should de-duplicate by video id only');
assert.equal(totalMetrics.newVideoCount, 1, 'new video count should use video publish time only');
assert.equal(
  totalMetrics.orderedVideoCount,
  3,
  'ordered count should mean videos with Qianchuan GMV or cart GMV, not order quantity'
);
assert.equal(totalMetrics.orderRate, 1, 'scene strategy order rate should use paid-or-cart sold videos');
assert.equal(totalMetrics.cartGmv, 210, 'scene strategy cart GMV should sum row GMV');
assert.equal(totalMetrics.cartGsv, 180, 'scene strategy cart GSV should keep refund-only rows in math');
assert.equal(totalMetrics.qianchuanGmv, 160, 'scene strategy Qianchuan GMV should sum ad-attributed GMV');
assert.equal(totalMetrics.qianchuanGsv, 137, 'scene strategy Qianchuan GSV should sum qianchuan_net_gmv');
assert.equal(totalMetrics.qianchuanCost, 42, 'scene strategy Qianchuan cost should sum qianchuan_overall_cost');
assert.equal(totalMetrics.qianchuanOrderCount, 9, 'scene strategy Qianchuan order count should sum qianchuan_overall_order_count');
assert.equal(
  Number(totalMetrics.qianchuanRoi?.toFixed(6)),
  Number((160 / 42).toFixed(6)),
  'scene strategy Qianchuan ROI should use Qianchuan GMV divided by Qianchuan cost'
);
assert.equal(
  contracts.formatSceneStrategyPath(['原点场景', '变美', '发缝/发际线焦虑']),
  '原点场景｜变美 › 发缝/发际线焦虑',
  'scene strategy display path should not use slash as the hierarchy delimiter'
);
assert.equal(treeRows[0].label, '种草', 'scene strategy should use the first maintained scene as the owner path');
assert.equal(treeRows[0].displayPath, '种草', 'scene row display path should be the scene label');
assert.equal(treeRows[0].children?.[0]?.label, '教程', 'scene strategy should keep the first group under the first scene');
assert.equal(
  treeRows[0].children?.[0]?.displayPath,
  '种草｜教程',
  'group rows should expose scene type plus big scene display path'
);
assert.equal(
  treeRows[0].children?.[0]?.children?.[0]?.displayPath,
  '种草｜教程 › 妆容',
  'subtype rows should expose scene type, big scene, and subtype display path'
);
assert.equal(treeRows.at(-1)?.label, '未维护场景类型', 'fallback scene should be sorted behind maintained scenes');
assert.equal(
  treeRows.at(-1)?.metrics.qianchuanGmv,
  20,
  'unmaintained scene fallback should retain Qianchuan GMV from unmapped video and material-only rows'
);
assert.equal(
  treeRows.at(-1)?.metrics.qianchuanOrderCount,
  2,
  'unmaintained scene fallback should retain Qianchuan order count from unmapped video and material-only rows'
);
assert.equal(
  treeRows.at(-1)?.metrics.totalVideoCount,
  1,
  'unmaintained scene fallback should count only rows that have a video id'
);

const [pathScene, pathGroup, pathSubtype] = contracts.resolveSceneStrategyPath(
  makeShortVideoRow({
    asset_content_scenes: ['A', 'B'],
    asset_content_scene_groups: ['G1', 'G2'],
    asset_content_scene_subtypes: ['S1', 'S2'],
  })
);
assert.deepEqual(
  [pathScene.label, pathGroup.label, pathSubtype.label],
  ['A', 'G1', 'S1'],
  'multi-scene materials should stay single-owner by using the first scene/group/subtype'
);

const trendRows = contracts.buildCreatorShortVideoTrendRows({
  rows: [
    makeShortVideoRow({
      stat_date: '2026-06-01',
      author_nickname: '达人A',
      qianchuan_overall_gmv: 120,
      qianchuan_net_gmv: 90,
      qianchuan_overall_cost: 30,
      qianchuan_overall_order_count: 6,
      user_pay_amount: 200,
      refund_amount: 20,
    }),
    makeShortVideoRow({
      id: 21,
      stat_date: '2026-06-01',
      author_nickname: '达人A',
      qianchuan_overall_gmv: 80,
      qianchuan_net_gmv: 70,
      qianchuan_overall_cost: 10,
      qianchuan_overall_order_count: 4,
      user_pay_amount: 50,
      refund_amount: 5,
    }),
    makeShortVideoRow({
      id: 22,
      stat_date: '2026-06-02',
      author_nickname: '达人B',
      qianchuan_overall_gmv: 30,
      qianchuan_net_gmv: 20,
      qianchuan_overall_cost: 5,
      qianchuan_overall_order_count: 1,
      user_pay_amount: 0,
      refund_amount: 10,
    }),
    makeShortVideoRow({
      id: 23,
      detail_grain: 'qianchuan_material_day',
      stat_date: '2026-06-01',
      author_nickname: '达人A',
      video_id: '',
      manual_video_id: '',
      qianchuan_material_ids: ['mat-trend-1'],
      qianchuan_material_key: 'mat-trend-1',
      qianchuan_overall_gmv: 40,
      qianchuan_net_gmv: 35,
      qianchuan_overall_cost: 10,
      qianchuan_overall_order_count: 2,
      user_pay_amount: 0,
      refund_amount: 0,
    }),
  ],
  currentRange,
});
assert.equal(trendRows.length, 10, 'short-video trend rows should fill each date in the selected range');
assert.equal(trendRows[0].qianchuanGmv, 240, 'trend bars should aggregate Qianchuan GMV by date');
assert.equal(trendRows[0].qianchuanGsv, 195, 'trend bars should aggregate Qianchuan GSV by date');
assert.equal(trendRows[0].qianchuanOrderCount, 12, 'trend tooltip should aggregate Qianchuan order count by date');
assert.equal(trendRows[0].cartGmv, 250, 'trend lines should aggregate cart GMV by date');
assert.equal(trendRows[0].cartGsv, 225, 'trend lines should aggregate cart GSV by date');
assert.equal(trendRows[0].contributors[0].name, '达人A', 'trend tooltip detail should aggregate by creator');
assert.equal(
  trendRows[0].contributors[0].qianchuanCost,
  50,
  'trend tooltip creator details should keep Qianchuan cost for ROI'
);
assert.equal(
  trendRows[0].contributors[0].qianchuanOrderCount,
  12,
  'trend tooltip creator details should keep Qianchuan order count'
);

await assertCreatorShortVideoRenderingBehavior({ repoRoot: REPO_ROOT });

console.log('[dashboard-creator-short-video-behavior] OK');
