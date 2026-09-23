use serde_json::json;
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use tracing::error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::{
    repository_filters::{push_filters, push_sort},
    row_mapping::{asset_from_row, import_run_from_row, processing_job_from_row},
    types::{
        ContentAssetDatabaseHealth, ContentAssetFilterOptions, ContentAssetHealthAssetStats,
        ContentAssetImportRun, ContentAssetItem, ContentAssetProcessingJob,
        ContentAssetProcessingJobSummary, ContentAssetSummary, ContentAssetUnmatchedStatsItem,
        ContentAssetUnmatchedStatsResponse, ContentAssetUnmatchedStatsSummary,
        NormalizedContentAssetProcessingJobQuery, NormalizedContentAssetQuery,
        NormalizedContentAssetUnmatchedStatsQuery,
    },
};

use super::repository_options::{
    query_array_text_options, query_content_asset_owner_options, query_distinct_text,
    query_platform_options, query_product_options, query_tags,
};

const ASSET_SELECT: &str = r#"
  SELECT
    asset_id,
    title,
    asset_type,
    asset_status,
    profile_status,
    lifecycle_status,
    external_only,
    bucket,
    raw_object_key,
    preview_object_key,
    cover_object_key,
    transcript_object_key,
    raw_sha256,
    file_ext,
    mime_type,
    duration_seconds::FLOAT8 AS duration_seconds,
    width,
    height,
    file_size_bytes,
    preview_size_bytes,
    platform,
    platform_names,
    product_name,
    product_names,
    sku_names,
    creator_name,
    video_type,
    content_scene,
    content_scene_group,
    content_scene_subtype,
    owner_name,
    owner_user_id,
    uploaded_by_user_id,
    FALSE AS can_edit,
    tags,
    ai_suggested_title,
    ai_suggested_tags,
    ai_metadata_generated_at::TEXT AS ai_metadata_generated_at,
    title_source,
    tags_source,
    notes,
    authorization_status,
    commercial_use_allowed,
    repurpose_allowed,
    authorization_starts_at::TEXT AS authorization_starts_at,
    authorization_expires_at::TEXT AS authorization_expires_at,
    authorization_notes,
    ai_summary,
    ai_score::FLOAT8 AS ai_score,
    ai_analysis_source,
    ai_analysis_model,
    ai_analyzed_at::TEXT AS ai_analyzed_at,
    transcript_source,
    transcript_model,
    transcribed_at::TEXT AS transcribed_at,
    script_excerpt,
    roi::FLOAT8 AS roi,
    ctr::FLOAT8 AS ctr,
    cvr::FLOAT8 AS cvr,
    spend::FLOAT8 AS spend,
    gmv::FLOAT8 AS gmv,
    source_type,
    source_platform,
    source_url,
    source_sheet_id,
    source_sheet_name,
    source_row_index,
    uploaded_at::TEXT AS uploaded_at,
    created_at::TEXT AS created_at,
    updated_at::TEXT AS updated_at
  FROM ads.marketing_content_assets asset
"#;

pub(super) async fn count_assets(
    pool: &PgPool,
    query: &NormalizedContentAssetQuery,
) -> AppResult<i64> {
    let mut builder = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*)::BIGINT AS total FROM ads.marketing_content_assets asset",
    );
    push_filters(&mut builder, query);
    let row = builder.build().fetch_one(pool).await.map_err(|error| {
        error!(?error, "count marketing content assets failed");
        AppError::Internal
    })?;
    Ok(row.try_get::<i64, _>("total").unwrap_or(0))
}

pub(super) async fn query_assets(
    pool: &PgPool,
    query: &NormalizedContentAssetQuery,
) -> AppResult<Vec<ContentAssetItem>> {
    let mut builder = QueryBuilder::<Postgres>::new(ASSET_SELECT);
    push_filters(&mut builder, query);
    builder.push(" ORDER BY ");
    push_sort(&mut builder, query.sort);
    builder.push(" LIMIT ");
    builder.push_bind(query.page_size);
    builder.push(" OFFSET ");
    builder.push_bind((query.page - 1) * query.page_size);

    let rows = builder.build().fetch_all(pool).await.map_err(|error| {
        error!(?error, "query marketing content assets failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(asset_from_row).collect())
}

pub(super) async fn query_asset_by_id(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<Option<ContentAssetItem>> {
    let sql = format!("{ASSET_SELECT} WHERE asset.asset_id = $1 AND asset.is_deleted = FALSE");
    let row = sqlx::query(&sql)
        .bind(asset_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(?error, %asset_id, "query marketing content asset by id failed");
            AppError::Internal
        })?;
    Ok(row.as_ref().map(asset_from_row))
}

pub(super) async fn query_duplicate_asset_by_sha256(
    pool: &PgPool,
    raw_sha256: &str,
    exclude_asset_id: Option<Uuid>,
) -> AppResult<Option<ContentAssetItem>> {
    let mut builder = QueryBuilder::<Postgres>::new(ASSET_SELECT);
    builder.push(
        " WHERE asset.is_deleted = FALSE AND asset.uploaded_at IS NOT NULL AND asset.raw_sha256 = ",
    );
    builder.push_bind(raw_sha256);
    if let Some(asset_id) = exclude_asset_id {
        builder.push(" AND asset.asset_id <> ");
        builder.push_bind(asset_id);
    }
    builder.push(" ORDER BY asset.updated_at DESC, asset.created_at DESC LIMIT 1");
    let row = builder
        .build()
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(
                ?error,
                raw_sha256, "query duplicate marketing content asset by sha256 failed"
            );
            AppError::Internal
        })?;
    Ok(row.as_ref().map(asset_from_row))
}

pub(super) async fn query_summary(pool: &PgPool) -> AppResult<ContentAssetSummary> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*)::BIGINT AS total_assets,
          COUNT(*) FILTER (WHERE asset_status = 'ready')::BIGINT AS ready_assets,
          COUNT(*) FILTER (WHERE external_only = TRUE)::BIGINT AS external_only_assets,
          COUNT(*) FILTER (WHERE asset_status IN ('pending_processing', 'processing'))::BIGINT AS pending_assets,
          COUNT(*) FILTER (WHERE asset_status = 'failed')::BIGINT AS failed_assets,
          COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_raw_size_bytes,
          MAX(updated_at)::TEXT AS latest_updated_at
        FROM ads.marketing_content_assets
        WHERE is_deleted = FALSE
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing content assets summary failed");
        AppError::Internal
    })?;

    Ok(ContentAssetSummary {
        total_assets: row.try_get("total_assets").unwrap_or(0),
        ready_assets: row.try_get("ready_assets").unwrap_or(0),
        external_only_assets: row.try_get("external_only_assets").unwrap_or(0),
        pending_assets: row.try_get("pending_assets").unwrap_or(0),
        failed_assets: row.try_get("failed_assets").unwrap_or(0),
        total_raw_size_bytes: row.try_get("total_raw_size_bytes").unwrap_or(0),
        latest_updated_at: row.try_get("latest_updated_at").ok(),
    })
}

pub(super) async fn query_filter_options(pool: &PgPool) -> AppResult<ContentAssetFilterOptions> {
    let platforms = query_platform_options(pool).await?;
    let products = query_product_options(pool).await?;
    let skus = query_array_text_options(pool, "sku_names", 300).await?;
    let creators = query_distinct_text(pool, "creator_name").await?;
    let video_types = query_distinct_text(pool, "video_type").await?;
    let content_scenes = query_distinct_text(pool, "content_scene").await?;
    let content_scene_groups = query_distinct_text(pool, "content_scene_group").await?;
    let content_scene_subtypes = query_distinct_text(pool, "content_scene_subtype").await?;
    let asset_statuses = query_distinct_text(pool, "asset_status").await?;
    let lifecycle_statuses = query_distinct_text(pool, "lifecycle_status").await?;
    let tags = query_tags(pool).await?;
    let owner_options = query_content_asset_owner_options(pool).await;
    Ok(ContentAssetFilterOptions {
        platforms,
        products,
        skus,
        creators,
        video_types,
        content_scenes,
        content_scene_groups,
        content_scene_subtypes,
        owner_options,
        asset_statuses,
        lifecycle_statuses,
        tags,
    })
}

pub(super) async fn query_content_asset_health(
    pool: &PgPool,
) -> AppResult<(
    ContentAssetDatabaseHealth,
    ContentAssetHealthAssetStats,
    ContentAssetProcessingJobSummary,
)> {
    let schema_row = sqlx::query(
        r#"
        SELECT
          to_regclass('ads.marketing_content_assets') IS NOT NULL AS assets_table_exists,
          to_regclass('ads.marketing_content_asset_objects') IS NOT NULL AS objects_table_exists,
          to_regclass('ads.marketing_content_asset_processing_jobs') IS NOT NULL AS processing_jobs_table_exists,
          to_regclass('dwd.marketing_content_ad_material_stats_di') IS NOT NULL AS dwd_ad_stats_table_exists,
          to_regclass('dwd.marketing_content_platform_video_stats_di') IS NOT NULL AS dwd_platform_video_stats_table_exists,
          to_regclass('dws.marketing_content_asset_daily_summary') IS NOT NULL AS dws_daily_summary_table_exists,
          to_regclass('dws.marketing_content_asset_lifetime_summary') IS NOT NULL AS dws_lifetime_summary_table_exists,
          to_regprocedure('ads.refresh_marketing_content_asset_performance(uuid,date,date)') IS NOT NULL AS rollup_function_exists
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing content asset schema health failed");
        AppError::Internal
    })?;

    let mut database = ContentAssetDatabaseHealth {
        assets_table_exists: schema_row.try_get("assets_table_exists").unwrap_or(false),
        objects_table_exists: schema_row.try_get("objects_table_exists").unwrap_or(false),
        processing_jobs_table_exists: schema_row
            .try_get("processing_jobs_table_exists")
            .unwrap_or(false),
        dwd_ad_stats_table_exists: schema_row
            .try_get("dwd_ad_stats_table_exists")
            .unwrap_or(false),
        dwd_platform_video_stats_table_exists: schema_row
            .try_get("dwd_platform_video_stats_table_exists")
            .unwrap_or(false),
        dws_daily_summary_table_exists: schema_row
            .try_get("dws_daily_summary_table_exists")
            .unwrap_or(false),
        dws_lifetime_summary_table_exists: schema_row
            .try_get("dws_lifetime_summary_table_exists")
            .unwrap_or(false),
        rollup_function_exists: schema_row
            .try_get("rollup_function_exists")
            .unwrap_or(false),
        status: "ok".to_string(),
    };
    let schema_ready = database.assets_table_exists
        && database.objects_table_exists
        && database.processing_jobs_table_exists
        && database.dwd_ad_stats_table_exists
        && database.dwd_platform_video_stats_table_exists
        && database.dws_daily_summary_table_exists
        && database.dws_lifetime_summary_table_exists
        && database.rollup_function_exists;
    database.status = if schema_ready { "ok" } else { "degraded" }.to_string();

    let assets = if database.assets_table_exists {
        query_health_asset_stats(pool).await?
    } else {
        ContentAssetHealthAssetStats::default()
    };
    let jobs = if database.assets_table_exists && database.processing_jobs_table_exists {
        query_processing_job_summary(pool, None).await?
    } else {
        ContentAssetProcessingJobSummary::default()
    };
    Ok((database, assets, jobs))
}

async fn query_health_asset_stats(pool: &PgPool) -> AppResult<ContentAssetHealthAssetStats> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*)::BIGINT AS total_assets,
          COUNT(*) FILTER (WHERE asset_status = 'ready')::BIGINT AS ready_assets,
          COUNT(*) FILTER (WHERE preview_object_key IS NOT NULL)::BIGINT AS preview_ready_assets,
          COUNT(*) FILTER (WHERE cover_object_key IS NOT NULL)::BIGINT AS cover_ready_assets,
          COUNT(*) FILTER (
            WHERE external_only = FALSE
              AND raw_object_key IS NOT NULL
              AND preview_object_key IS NULL
          )::BIGINT AS raw_only_assets,
          COUNT(*) FILTER (WHERE external_only = TRUE)::BIGINT AS external_only_assets,
          COUNT(*) FILTER (WHERE asset_status IN ('pending_processing', 'processing'))::BIGINT AS pending_assets,
          COUNT(*) FILTER (WHERE asset_status = 'failed')::BIGINT AS failed_assets,
          COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_raw_size_bytes,
          MAX(updated_at)::TEXT AS latest_updated_at
        FROM ads.marketing_content_assets
        WHERE is_deleted = FALSE
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing content asset health stats failed");
        AppError::Internal
    })?;

    Ok(ContentAssetHealthAssetStats {
        total_assets: row.try_get("total_assets").unwrap_or(0),
        ready_assets: row.try_get("ready_assets").unwrap_or(0),
        preview_ready_assets: row.try_get("preview_ready_assets").unwrap_or(0),
        cover_ready_assets: row.try_get("cover_ready_assets").unwrap_or(0),
        raw_only_assets: row.try_get("raw_only_assets").unwrap_or(0),
        external_only_assets: row.try_get("external_only_assets").unwrap_or(0),
        pending_assets: row.try_get("pending_assets").unwrap_or(0),
        failed_assets: row.try_get("failed_assets").unwrap_or(0),
        total_raw_size_bytes: row.try_get("total_raw_size_bytes").unwrap_or(0),
        latest_updated_at: row.try_get("latest_updated_at").ok(),
    })
}

pub(super) async fn query_import_runs(pool: &PgPool) -> AppResult<Vec<ContentAssetImportRun>> {
    let rows = sqlx::query(
        r#"
        SELECT
          run_id,
          mode,
          status,
          source_url,
          spreadsheet_token,
          sheet_ids,
          dry_run_payload,
          total_rows,
          attachment_count,
          uploaded_count,
          external_only_count,
          failed_count,
          error_message,
          requested_by,
          created_at::TEXT AS created_at,
          finished_at::TEXT AS finished_at
        FROM ads.marketing_content_asset_import_runs
        ORDER BY created_at DESC
        LIMIT 20
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing content asset import runs failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(import_run_from_row).collect())
}

pub(super) async fn query_processing_job_summary(
    pool: &PgPool,
    query: Option<&NormalizedContentAssetProcessingJobQuery>,
) -> AppResult<ContentAssetProcessingJobSummary> {
    let mut builder = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE job.status = 'queued')::BIGINT AS queued_jobs,
          COUNT(*) FILTER (WHERE job.status = 'running')::BIGINT AS running_jobs,
          COUNT(*) FILTER (WHERE job.status = 'succeeded')::BIGINT AS succeeded_jobs,
          COUNT(*) FILTER (WHERE job.status = 'failed')::BIGINT AS failed_jobs,
          COUNT(*) FILTER (
            WHERE job.status = 'running'
              AND job.started_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
              AND job.updated_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
          )::BIGINT AS stale_running_jobs,
          MAX(job.finished_at)::TEXT AS latest_finished_at
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE asset.is_deleted = FALSE
        "#,
    );
    if let Some(query) = query {
        if let Some(asset_id) = query.asset_id {
            builder.push(" AND job.asset_id = ");
            builder.push_bind(asset_id);
        }
        if let Some(status) = &query.status {
            builder.push(" AND job.status = ");
            builder.push_bind(status.clone());
        }
        if let Some(job_type) = &query.job_type {
            builder.push(" AND job.job_type = ");
            builder.push_bind(job_type.clone());
        }
    }
    let row = builder.build().fetch_one(pool).await.map_err(|error| {
        error!(
            ?error,
            "query marketing content asset processing job summary failed"
        );
        AppError::Internal
    })?;

    Ok(ContentAssetProcessingJobSummary {
        queued_jobs: row.try_get("queued_jobs").unwrap_or(0),
        running_jobs: row.try_get("running_jobs").unwrap_or(0),
        succeeded_jobs: row.try_get("succeeded_jobs").unwrap_or(0),
        failed_jobs: row.try_get("failed_jobs").unwrap_or(0),
        stale_running_jobs: row.try_get("stale_running_jobs").unwrap_or(0),
        latest_finished_at: row.try_get("latest_finished_at").ok(),
    })
}

pub(super) async fn query_processing_jobs(
    pool: &PgPool,
    query: &NormalizedContentAssetProcessingJobQuery,
) -> AppResult<Vec<ContentAssetProcessingJob>> {
    let mut builder = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
          job.job_id,
          job.asset_id,
          asset.title,
          asset.asset_status,
          asset.duration_seconds::FLOAT8 AS duration_seconds,
          job.job_type,
          job.status,
          job.attempts,
          job.max_attempts,
          job.input_object_key,
          job.output_object_key,
          job.metadata,
          job.error_message,
          job.queued_at::TEXT AS queued_at,
          job.started_at::TEXT AS started_at,
          job.finished_at::TEXT AS finished_at,
          job.created_at::TEXT AS created_at,
          job.updated_at::TEXT AS updated_at
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE asset.is_deleted = FALSE
        "#,
    );
    if let Some(asset_id) = query.asset_id {
        builder.push(" AND job.asset_id = ");
        builder.push_bind(asset_id);
    }
    if let Some(status) = &query.status {
        builder.push(" AND job.status = ");
        builder.push_bind(status.clone());
    }
    if let Some(job_type) = &query.job_type {
        builder.push(" AND job.job_type = ");
        builder.push_bind(job_type.clone());
    }
    builder.push(
        " ORDER BY CASE job.status \
         WHEN 'running' THEN 1 \
         WHEN 'queued' THEN 2 \
         WHEN 'failed' THEN 3 \
         WHEN 'succeeded' THEN 4 \
         ELSE 9 END, job.queued_at DESC, job.created_at DESC LIMIT ",
    );
    builder.push_bind(query.limit);

    let rows = builder.build().fetch_all(pool).await.map_err(|error| {
        error!(
            ?error,
            "query marketing content asset processing jobs failed"
        );
        AppError::Internal
    })?;
    Ok(rows.iter().map(processing_job_from_row).collect())
}

pub(super) async fn query_processing_job_by_id(
    pool: &PgPool,
    job_id: Uuid,
) -> AppResult<Option<ContentAssetProcessingJob>> {
    let row = sqlx::query(
        r#"
        SELECT
          job.job_id,
          job.asset_id,
          asset.title,
          asset.asset_status,
          asset.duration_seconds::FLOAT8 AS duration_seconds,
          job.job_type,
          job.status,
          job.attempts,
          job.max_attempts,
          job.input_object_key,
          job.output_object_key,
          job.metadata,
          job.error_message,
          job.queued_at::TEXT AS queued_at,
          job.started_at::TEXT AS started_at,
          job.finished_at::TEXT AS finished_at,
          job.created_at::TEXT AS created_at,
          job.updated_at::TEXT AS updated_at
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE job.job_id = $1
          AND asset.is_deleted = FALSE
        "#,
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        error!(?error, %job_id, "query marketing content asset processing job by id failed");
        AppError::Internal
    })?;
    Ok(row.as_ref().map(processing_job_from_row))
}

pub(super) async fn query_unmatched_stats(
    pool: &PgPool,
    query: &NormalizedContentAssetUnmatchedStatsQuery,
) -> AppResult<ContentAssetUnmatchedStatsResponse> {
    let mut builder = QueryBuilder::<Postgres>::new(
        r#"
        WITH unmatched AS (
          SELECT
            CONCAT_WS('|', 'ad_material', ad_platform, COALESCE(account_id, ''), external_material_id) AS identity_key,
            'ad_material'::TEXT AS match_type,
            ad_platform AS platform,
            account_id,
            account_name,
            advertiser_id,
            external_material_id,
            external_video_id,
            NULL::TEXT AS external_item_id,
            NULL::TEXT AS external_note_id,
            MIN(stat_date)::TEXT AS first_stat_date,
            MAX(stat_date)::TEXT AS last_stat_date,
            COUNT(*)::BIGINT AS row_count,
            COALESCE(SUM(impressions), 0)::BIGINT AS impressions,
            COALESCE(SUM(clicks), 0)::BIGINT AS clicks,
            0::BIGINT AS plays,
            COALESCE(SUM(COALESCE(likes, 0) + COALESCE(comments, 0) + COALESCE(shares, 0) + COALESCE(follows, 0)), 0)::BIGINT AS interactions,
            COALESCE(SUM(cost), 0)::FLOAT8 AS cost,
            COALESCE(SUM(gmv), 0)::FLOAT8 AS gmv,
            CASE WHEN COALESCE(SUM(cost), 0) > 0 THEN (COALESCE(SUM(gmv), 0) / NULLIF(SUM(cost), 0))::FLOAT8 ELSE NULL::FLOAT8 END AS roi
          FROM dwd.marketing_content_ad_material_stats_di
          WHERE match_status IN ('unmatched', 'pending_confirm', 'ambiguous')
            AND external_material_id IS NOT NULL
          GROUP BY ad_platform, account_id, account_name, advertiser_id, external_material_id, external_video_id

          UNION ALL

          SELECT
            CONCAT_WS('|', 'platform_video', platform, COALESCE(account_id, ''), COALESCE(external_video_id, ''), COALESCE(external_item_id, ''), COALESCE(external_note_id, '')) AS identity_key,
            'platform_video'::TEXT AS match_type,
            platform,
            account_id,
            account_name,
            NULL::TEXT AS advertiser_id,
            NULL::TEXT AS external_material_id,
            external_video_id,
            external_item_id,
            external_note_id,
            MIN(stat_date)::TEXT AS first_stat_date,
            MAX(stat_date)::TEXT AS last_stat_date,
            COUNT(*)::BIGINT AS row_count,
            COALESCE(SUM(impressions), 0)::BIGINT AS impressions,
            COALESCE(SUM(clicks), 0)::BIGINT AS clicks,
            COALESCE(SUM(plays), 0)::BIGINT AS plays,
            COALESCE(SUM(COALESCE(likes, 0) + COALESCE(comments, 0) + COALESCE(shares, 0) + COALESCE(collects, 0) + COALESCE(follows, 0)), 0)::BIGINT AS interactions,
            NULL::FLOAT8 AS cost,
            NULL::FLOAT8 AS gmv,
            NULL::FLOAT8 AS roi
          FROM dwd.marketing_content_platform_video_stats_di
          WHERE match_status IN ('unmatched', 'pending_confirm', 'ambiguous')
            AND COALESCE(NULLIF(external_video_id, ''), NULLIF(external_item_id, ''), NULLIF(external_note_id, '')) IS NOT NULL
          GROUP BY platform, account_id, account_name, external_video_id, external_item_id, external_note_id
        )
        SELECT *
        FROM unmatched
        "#,
    );
    if let Some(match_type) = &query.match_type {
        builder.push(" WHERE match_type = ");
        builder.push_bind(match_type.clone());
    }
    builder.push(
        " ORDER BY last_stat_date DESC NULLS LAST, row_count DESC, cost DESC NULLS LAST LIMIT ",
    );
    builder.push_bind(query.limit);

    let rows = builder.build().fetch_all(pool).await.map_err(|error| {
        error!(?error, "query marketing content unmatched stats failed");
        AppError::Internal
    })?;
    let items: Vec<ContentAssetUnmatchedStatsItem> =
        rows.iter().map(unmatched_stats_item_from_row).collect();
    let summary = query_unmatched_stats_summary(pool).await?;
    Ok(ContentAssetUnmatchedStatsResponse { items, summary })
}

async fn query_unmatched_stats_summary(
    pool: &PgPool,
) -> AppResult<ContentAssetUnmatchedStatsSummary> {
    let row = sqlx::query(
        r#"
        WITH ad_groups AS (
          SELECT
            ad_platform,
            COALESCE(account_id, '') AS account_id,
            external_material_id,
            COUNT(*)::BIGINT AS row_count,
            MAX(stat_date)::TEXT AS latest_stat_date
          FROM dwd.marketing_content_ad_material_stats_di
          WHERE match_status IN ('unmatched', 'pending_confirm', 'ambiguous')
            AND external_material_id IS NOT NULL
          GROUP BY ad_platform, COALESCE(account_id, ''), external_material_id
        ),
        video_groups AS (
          SELECT
            platform,
            COALESCE(account_id, '') AS account_id,
            COALESCE(external_video_id, '') AS external_video_id,
            COALESCE(external_item_id, '') AS external_item_id,
            COALESCE(external_note_id, '') AS external_note_id,
            COUNT(*)::BIGINT AS row_count,
            MAX(stat_date)::TEXT AS latest_stat_date
          FROM dwd.marketing_content_platform_video_stats_di
          WHERE match_status IN ('unmatched', 'pending_confirm', 'ambiguous')
            AND COALESCE(NULLIF(external_video_id, ''), NULLIF(external_item_id, ''), NULLIF(external_note_id, '')) IS NOT NULL
          GROUP BY platform, COALESCE(account_id, ''), COALESCE(external_video_id, ''), COALESCE(external_item_id, ''), COALESCE(external_note_id, '')
        )
        SELECT
          ((SELECT COUNT(*) FROM ad_groups) + (SELECT COUNT(*) FROM video_groups))::BIGINT AS total_groups,
          (SELECT COUNT(*) FROM ad_groups)::BIGINT AS ad_material_groups,
          (SELECT COUNT(*) FROM video_groups)::BIGINT AS platform_video_groups,
          (COALESCE((SELECT SUM(row_count) FROM ad_groups), 0) + COALESCE((SELECT SUM(row_count) FROM video_groups), 0))::BIGINT AS total_rows,
          GREATEST(
            (SELECT MAX(latest_stat_date) FROM ad_groups),
            (SELECT MAX(latest_stat_date) FROM video_groups)
          ) AS latest_stat_date
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            "query marketing content unmatched stats summary failed"
        );
        AppError::Internal
    })?;
    Ok(ContentAssetUnmatchedStatsSummary {
        total_groups: row.try_get("total_groups").unwrap_or(0),
        ad_material_groups: row.try_get("ad_material_groups").unwrap_or(0),
        platform_video_groups: row.try_get("platform_video_groups").unwrap_or(0),
        total_rows: row.try_get("total_rows").unwrap_or(0),
        latest_stat_date: row.try_get("latest_stat_date").ok(),
    })
}

fn unmatched_stats_item_from_row(row: &sqlx::postgres::PgRow) -> ContentAssetUnmatchedStatsItem {
    ContentAssetUnmatchedStatsItem {
        identity_key: row.try_get("identity_key").unwrap_or_default(),
        match_type: row.try_get("match_type").unwrap_or_default(),
        platform: row.try_get("platform").unwrap_or_default(),
        account_id: row.try_get("account_id").ok(),
        account_name: row.try_get("account_name").ok(),
        advertiser_id: row.try_get("advertiser_id").ok(),
        external_material_id: row.try_get("external_material_id").ok(),
        external_video_id: row.try_get("external_video_id").ok(),
        external_item_id: row.try_get("external_item_id").ok(),
        external_note_id: row.try_get("external_note_id").ok(),
        first_stat_date: row.try_get("first_stat_date").ok(),
        last_stat_date: row.try_get("last_stat_date").ok(),
        row_count: row.try_get("row_count").unwrap_or(0),
        impressions: row.try_get("impressions").unwrap_or(0),
        clicks: row.try_get("clicks").unwrap_or(0),
        plays: row.try_get("plays").unwrap_or(0),
        interactions: row.try_get("interactions").unwrap_or(0),
        cost: row.try_get("cost").ok(),
        gmv: row.try_get("gmv").ok(),
        roi: row.try_get("roi").ok(),
    }
}

pub(super) async fn create_import_run(
    pool: &PgPool,
    run_id: Uuid,
    mode: &str,
    source_url: &str,
    spreadsheet_token: Option<&str>,
    sheet_ids: Vec<String>,
    requested_by: Option<&str>,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_import_runs (
          run_id, mode, status, source_url, spreadsheet_token, sheet_ids, dry_run_payload, requested_by
        ) VALUES ($1, $2, 'requested', $3, $4, $5, $6, $7)
        "#,
    )
    .bind(run_id)
    .bind(mode)
    .bind(source_url)
    .bind(spreadsheet_token)
    .bind(sheet_ids)
    .bind(json!({
        "trigger": "manual_request",
        "message": "API 已记录导入请求；实际下载/上传请由 Prefect 或 CLI worker 执行。"
    }))
    .bind(requested_by)
    .execute(pool)
    .await
    .map_err(|error| {
        error!(?error, %run_id, "create marketing content asset import run failed");
        AppError::Internal
    })?;
    Ok(())
}
