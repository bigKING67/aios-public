import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function assertCreatorShortVideoDataSourceBehavior({ repoRoot }) {
  const shortVideoDetailQuerySource = await readFile(
    path.join(repoRoot, 'backend-rust/src/dashboard/creator_shortvideo_details/query.sql'),
    'utf8'
  );
  const shortVideoOverviewQuerySource = await readFile(
    path.join(repoRoot, 'backend-rust/src/dashboard/creator_shortvideo_overview/query.sql'),
    'utf8'
  );
  const creatorDateBoundsSource = await readFile(
    path.join(repoRoot, 'backend-rust/src/dashboard/creator_handlers/sql.rs'),
    'utf8'
  );
  const dashboardDateBoundsSource = await readFile(
    path.join(repoRoot, 'backend-rust/src/dashboard/date_bounds.rs'),
    'utf8'
  );
  const contentAssetMaterialBackfillMigrationSource = await readFile(
    path.join(
      repoRoot,
      'etl/groland_postgres/sql/migrations/20260617_1830__backfill_qianchuan_materials_from_platform_videos.sql'
    ),
    'utf8'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /live_asset_identity_by_material/u,
    'short-video detail SQL should fallback to content-asset identities by Qianchuan material id'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /material_hit\.material_id = ANY\(row_material_keys\.material_ids\)/u,
    'short-video detail SQL should use fact material ids and material key to find live asset taxonomy'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /WHEN pv\.platform = 'douyin' THEN NULLIF\(BTRIM\(pv\.external_item_id\), ''\)/u,
    'short-video detail SQL should include platform video external_item_id as a Qianchuan material id fallback by video id'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /NULL::UUID AS ad_material_id,[\s\S]*NULLIF\(BTRIM\(pv\.external_item_id\), ''\) AS qianchuan_material_id/u,
    'short-video detail SQL should build material-id lookup rows from platform video external_item_id without fake ad_material_id values'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /regexp_split_to_array\(NULLIF\(BTRIM\(d\.qianchuan_material_key\), ''\)/u,
    'short-video detail SQL should split qianchuan_material_key for material-id fallback'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /d\.detail_grain IN \('qianchuan_video_day', 'qianchuan_material_day'\)/u,
    'short-video detail SQL should include Qianchuan-only video/material grain rows'
  );
  assert.match(
    shortVideoDetailQuerySource,
    /p\.cooperation_status_filter IS NULL[\s\S]*d\.detail_grain = 'trade_video_day'/u,
    'cooperation-status filters should not force Qianchuan-only material rows into video-scoped manual/cooperation buckets'
  );
  assert.match(
    shortVideoOverviewQuerySource,
    /d\.detail_grain IN \('qianchuan_video_day', 'qianchuan_material_day'\)/u,
    'short-video overview SQL should include Qianchuan-only video/material grain rows'
  );
  assert.match(
    shortVideoOverviewQuerySource,
    /metric_entity_key/u,
    'short-video overview SQL should count videos by video key'
  );
  assert.match(
    shortVideoOverviewQuerySource,
    /author_period AS \([\s\S]*?COUNT\(DISTINCT CASE[\s\S]*?CONCAT_WS\(\s*'\|\|',\s*sd\.metric_entity_key,\s*COALESCE/u,
    'short-video overview period counts should de-duplicate by metric entity instead of entity per date'
  );
  assert.match(
    creatorDateBoundsSource,
    /t\.detail_grain IN \('qianchuan_video_day', 'qianchuan_material_day'\)/u,
    'creator short-video date bounds should include Qianchuan-only material dates'
  );
  assert.match(
    dashboardDateBoundsSource,
    /detail_grain IN \('qianchuan_video_day', 'qianchuan_material_day'\)/u,
    'main dashboard short-video date bounds should include Qianchuan-only material dates'
  );
  const qianchuanFactSignalSources = [
    ['details SQL', shortVideoDetailQuerySource],
    ['overview SQL', shortVideoOverviewQuerySource],
    ['creator date-bounds SQL', creatorDateBoundsSource],
    ['main date-bounds SQL', dashboardDateBoundsSource],
  ];
  const qianchuanFactSignalFields = [
    'qianchuan_metric_attributed',
    'qianchuan_overall_impression_count',
    'qianchuan_overall_click_count',
    'qianchuan_user_pay_amount',
    'qianchuan_smart_coupon_amount',
    'qianchuan_platform_subsidy_amount',
  ];
  for (const [label, source] of qianchuanFactSignalSources) {
    for (const field of qianchuanFactSignalFields) {
      assert.match(
        source,
        new RegExp(field, 'u'),
        `${label} should include ${field} as a Qianchuan fact signal`
      );
    }
  }
  assert.match(
    contentAssetMaterialBackfillMigrationSource,
    /DISTINCT ON \(COALESCE\(account_id, ''\), external_material_id\)/u,
    'content-asset material backfill should dedupe platform-video external_item_id candidates before insert'
  );
  assert.match(
    contentAssetMaterialBackfillMigrationSource,
    /COALESCE\(material\.account_id, ''\) = COALESCE\(candidate\.account_id, ''\)/u,
    'content-asset material backfill should match existing material rows by account and material id'
  );
}
