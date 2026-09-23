use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::super::mutation_types::NormalizedContentAssetAnalysisJobCreate;
use super::super::write_errors::map_write_error;
use super::object_keys::{
    default_analysis_profile, resolve_analysis_input_key, resolve_analysis_input_role,
};

const CONTENT_ASSET_AI_LONG_VIDEO_SECONDS: f64 = 30.0 * 60.0;
const MAX_ANALYSIS_CACHE_HYDRATION_BATCH_SIZE: usize = 100;
const VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION: &str = "hydrate_video_understanding_cache";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct AnalysisCacheHydrationJob {
    pub(crate) asset_id: Uuid,
    pub(crate) job_id: Uuid,
}

#[derive(Debug, Default)]
pub(crate) struct AnalysisCacheHydrationBatchResult {
    pub(crate) created_jobs: Vec<AnalysisCacheHydrationJob>,
    pub(crate) existing_jobs: Vec<AnalysisCacheHydrationJob>,
    pub(crate) conflicting_asset_ids: Vec<Uuid>,
    pub(crate) missing_artifact_asset_ids: Vec<Uuid>,
    pub(crate) not_found_asset_ids: Vec<Uuid>,
}

#[derive(Debug)]
struct AnalysisCacheHydrationAsset {
    analysis_object_key: String,
    analysis_source: String,
}

#[derive(Debug)]
struct NewAnalysisCacheHydrationJob {
    job: AnalysisCacheHydrationJob,
    input_object_key: String,
    metadata: Value,
    event_payload: Value,
}

pub(crate) async fn create_analysis_processing_job(
    pool: &PgPool,
    asset_id: Uuid,
    payload: NormalizedContentAssetAnalysisJobCreate,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    let analysis_source = payload.source.clone();
    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(err, "begin content asset analysis job transaction failed")
    })?;

    let asset_row = sqlx::query(
        r#"
        SELECT
          external_only,
          raw_object_key,
          preview_object_key,
          analysis_object_key,
          ai_analysis_source,
          duration_seconds::FLOAT8 AS duration_seconds
        FROM ads.marketing_content_assets
        WHERE asset_id = $1 AND is_deleted = FALSE
        FOR UPDATE
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "query content asset before analysis job failed"))?;
    let Some(asset_row) = asset_row else {
        return Err(AppError::NotFound);
    };

    let external_only: bool = asset_row.try_get("external_only").unwrap_or(false);
    if external_only {
        return Err(AppError::bad_request(
            "该素材尚未上传到 TOS，无法创建 AI 分析任务",
        ));
    }
    let duration_seconds: Option<f64> = asset_row.try_get("duration_seconds").ok();
    if duration_seconds
        .map(|duration| duration >= CONTENT_ASSET_AI_LONG_VIDEO_SECONDS)
        .unwrap_or(false)
    {
        return Err(AppError::bad_request(
            "视频超过 30 分钟，不建议自动创建 AI 分析任务",
        ));
    }

    let raw_object_key: Option<String> = asset_row.try_get("raw_object_key").ok();
    let preview_object_key: Option<String> = asset_row.try_get("preview_object_key").ok();
    let input_object_key = resolve_analysis_input_key(
        &payload.source,
        raw_object_key.as_deref(),
        preview_object_key.as_deref(),
    )?;
    let input_role = resolve_analysis_input_role(
        &input_object_key,
        raw_object_key.as_deref(),
        preview_object_key.as_deref(),
    );
    let analysis_profile = payload
        .profile
        .clone()
        .unwrap_or_else(|| default_analysis_profile(&input_role).to_string());

    let active_job = sqlx::query(
        r#"
        SELECT
          job_id,
          status,
          COALESCE(metadata->>'analysis_source', 'preview') AS analysis_source,
          COALESCE(metadata->>'analysis_profile', $2) AS analysis_profile
        FROM ads.marketing_content_asset_processing_jobs
        WHERE asset_id = $1
          AND job_type = 'analysis'
          AND status IN ('queued', 'running')
        ORDER BY
          CASE status WHEN 'running' THEN 0 ELSE 1 END,
          started_at DESC NULLS LAST,
          queued_at ASC,
          created_at ASC
        LIMIT 1
        "#,
    )
    .bind(asset_id)
    .bind(&analysis_profile)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "query active analysis job failed"))?;
    if let Some(row) = active_job {
        let job_id: Uuid = row.get("job_id");
        let status: String = row.try_get("status").unwrap_or_default();
        let active_source: String = row.try_get("analysis_source").unwrap_or_default();
        let active_profile: String = row.try_get("analysis_profile").unwrap_or_default();
        if status == "running" {
            return Err(AppError::Conflict(
                "该素材已有运行中的 AI 分析任务".to_string(),
            ));
        }
        if !payload.force && active_source == payload.source && active_profile == analysis_profile {
            tx.commit().await.map_err(|err| {
                map_write_error(err, "commit existing analysis job transaction failed")
            })?;
            return Ok(job_id);
        }
        if !payload.force {
            return Err(AppError::Conflict(
                "该素材已有排队中的 AI 分析任务，请等待完成后再发起新的分析策略".to_string(),
            ));
        }
    }

    if !payload.force {
        let existing_analysis_source: Option<String> = asset_row.try_get("ai_analysis_source").ok();
        let existing_analysis_object: Option<String> =
            asset_row.try_get("analysis_object_key").ok();
        if existing_analysis_object.is_some()
            && existing_analysis_source.as_deref() == Some(payload.source.as_str())
        {
            return Err(AppError::Conflict(
                "该素材已有同来源 AI 分析结果；如需覆盖请使用 force=true".to_string(),
            ));
        }
    } else {
        sqlx::query(
            r#"
            UPDATE ads.marketing_content_asset_processing_jobs
            SET status = 'cancelled',
                finished_at = CURRENT_TIMESTAMP,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'cancelled_by_new_analysis_job', TRUE,
                  'cancelled_by', $2,
                  'cancelled_at', CURRENT_TIMESTAMP
                )
            WHERE asset_id = $1
              AND job_type = 'analysis'
              AND status = 'queued'
            "#,
        )
        .bind(asset_id)
        .bind(actor)
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "cancel superseded analysis jobs failed"))?;
    }

    let job_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_processing_jobs (
          job_id,
          asset_id,
          job_type,
          status,
          input_object_key,
          metadata
        ) VALUES ($1, $2, 'analysis', 'queued', $3, $4)
        "#,
    )
    .bind(job_id)
    .bind(asset_id)
    .bind(&input_object_key)
    .bind(json!({
        "created_by": "user_request",
        "analysis_source": &analysis_source,
        "input_role": &input_role,
        "analysis_profile": &analysis_profile,
        "force": payload.force,
        "requested_by": actor,
        "processing_stage": "queued",
        "processing_stage_label": "AI 分析已排队",
        "processing_progress_percent": 5,
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "create analysis processing job failed"))?;

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, 'analysis_job_queued', $2, $3, $4)
        "#,
    )
    .bind(asset_id)
    .bind(actor)
    .bind(match analysis_source.as_str() {
        "raw" => "已创建原片完整 AI 分析任务",
        "preview" => "已创建预览快速 AI 分析任务",
        _ => "已创建自动来源 AI 分析任务",
    })
    .bind(json!({
        "jobId": job_id,
        "analysisSource": &analysis_source,
        "inputRole": &input_role,
        "analysisProfile": &analysis_profile,
        "inputObjectKey": input_object_key,
        "force": payload.force,
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "insert analysis job queued event failed"))?;

    tx.commit().await.map_err(|err| {
        map_write_error(err, "commit content asset analysis job transaction failed")
    })?;
    Ok(job_id)
}

#[allow(dead_code)] // Compatibility wrapper; all hydration SQL remains in the batch function below.
pub(crate) async fn create_analysis_cache_hydration_job(
    pool: &PgPool,
    asset_id: Uuid,
    source: &str,
    profile: Option<&str>,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    let result =
        create_analysis_cache_hydration_jobs(pool, &[asset_id], source, profile, actor).await?;

    if let Some(job) = result
        .created_jobs
        .iter()
        .chain(result.existing_jobs.iter())
        .find(|job| job.asset_id == asset_id)
    {
        return Ok(job.job_id);
    }
    if result.conflicting_asset_ids.contains(&asset_id) {
        return Err(AppError::Conflict(
            "该素材已有排队或运行中的 AI 分析任务".to_string(),
        ));
    }
    if result.missing_artifact_asset_ids.contains(&asset_id) {
        return Err(AppError::bad_request("该素材缺少可复用的 AI 分析结果文件"));
    }
    Err(AppError::NotFound)
}

pub(crate) async fn create_analysis_cache_hydration_jobs(
    pool: &PgPool,
    asset_ids: &[Uuid],
    source: &str,
    profile: Option<&str>,
    actor: Option<&str>,
) -> AppResult<AnalysisCacheHydrationBatchResult> {
    let mut normalized_asset_ids = asset_ids.to_vec();
    normalized_asset_ids.sort_unstable();
    normalized_asset_ids.dedup();
    if normalized_asset_ids.len() > MAX_ANALYSIS_CACHE_HYDRATION_BATCH_SIZE {
        return Err(AppError::bad_request(
            "结构化视频理解回填批次不能超过 100 个素材",
        ));
    }
    if normalized_asset_ids.is_empty() {
        return Ok(AnalysisCacheHydrationBatchResult::default());
    }

    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(
            err,
            "begin content asset analysis cache hydration transaction failed",
        )
    })?;
    let asset_rows = sqlx::query(
        r#"
        SELECT
          asset_id,
          analysis_object_key,
          ai_analysis_source
        FROM ads.marketing_content_assets
        WHERE asset_id = ANY($1)
          AND is_deleted = FALSE
        ORDER BY asset_id ASC
        FOR UPDATE
        "#,
    )
    .bind(&normalized_asset_ids)
    .fetch_all(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "query analysis artifacts before hydration failed"))?;

    let mut result = AnalysisCacheHydrationBatchResult::default();
    let mut hydration_assets = HashMap::with_capacity(asset_rows.len());
    for row in asset_rows {
        let asset_id: Uuid = row.get("asset_id");
        let Some(analysis_object_key) = row
            .try_get::<Option<String>, _>("analysis_object_key")
            .ok()
            .flatten()
            .filter(|value| !value.trim().is_empty())
        else {
            result.missing_artifact_asset_ids.push(asset_id);
            continue;
        };
        let analysis_source = row
            .try_get::<Option<String>, _>("ai_analysis_source")
            .ok()
            .flatten()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| source.to_string());
        hydration_assets.insert(
            asset_id,
            AnalysisCacheHydrationAsset {
                analysis_object_key,
                analysis_source,
            },
        );
    }

    for asset_id in normalized_asset_ids.iter().copied() {
        if !hydration_assets.contains_key(&asset_id)
            && !result.missing_artifact_asset_ids.contains(&asset_id)
        {
            result.not_found_asset_ids.push(asset_id);
        }
    }

    let hydratable_asset_ids = normalized_asset_ids
        .iter()
        .copied()
        .filter(|asset_id| hydration_assets.contains_key(asset_id))
        .collect::<Vec<_>>();
    let active_job_rows = if hydratable_asset_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query(
            r#"
            SELECT DISTINCT ON (asset_id)
              asset_id,
              job_id,
              status,
              metadata->>'operation' AS operation
            FROM ads.marketing_content_asset_processing_jobs
            WHERE asset_id = ANY($1)
              AND job_type = 'analysis'
              AND status IN ('queued', 'running')
            ORDER BY
              asset_id ASC,
              CASE status WHEN 'running' THEN 0 ELSE 1 END,
              started_at DESC NULLS LAST,
              queued_at ASC,
              created_at ASC
            "#,
        )
        .bind(&hydratable_asset_ids)
        .fetch_all(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "query active analysis hydration jobs failed"))?
    };
    let active_jobs = active_job_rows
        .into_iter()
        .map(|row| {
            let asset_id: Uuid = row.get("asset_id");
            (asset_id, row)
        })
        .collect::<HashMap<_, _>>();

    let analysis_profile = profile.unwrap_or("preview_fast");
    let mut new_jobs = Vec::with_capacity(hydratable_asset_ids.len());
    for asset_id in hydratable_asset_ids {
        if let Some(row) = active_jobs.get(&asset_id) {
            let job_id: Uuid = row.get("job_id");
            let status: String = row.try_get("status").unwrap_or_default();
            let operation: Option<String> = row.try_get("operation").ok();
            if status == "queued"
                && operation.as_deref() == Some(VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION)
            {
                result
                    .existing_jobs
                    .push(AnalysisCacheHydrationJob { asset_id, job_id });
            } else {
                result.conflicting_asset_ids.push(asset_id);
            }
            continue;
        }

        let hydration_asset = &hydration_assets[&asset_id];
        let job_id = Uuid::new_v4();
        let job = AnalysisCacheHydrationJob { asset_id, job_id };
        new_jobs.push(NewAnalysisCacheHydrationJob {
            job,
            input_object_key: hydration_asset.analysis_object_key.clone(),
            metadata: json!({
                "created_by": "industry_material_structured_backfill",
                "operation": VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION,
                "analysis_artifact_object_key": &hydration_asset.analysis_object_key,
                "analysis_source": &hydration_asset.analysis_source,
                "analysis_profile": analysis_profile,
                "input_role": "analysis_artifact",
                "model_call_expected": false,
                "requested_by": actor,
                "processing_stage": "queued",
                "processing_stage_label": "结构化视频理解回填已排队",
                "processing_progress_percent": 5,
            }),
            event_payload: json!({
                "jobId": job_id,
                "operation": VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION,
                "analysisArtifactObjectKey": &hydration_asset.analysis_object_key,
                "modelCallExpected": false,
            }),
        });
    }

    if !new_jobs.is_empty() {
        let mut jobs_insert = QueryBuilder::<Postgres>::new(
            r#"
            INSERT INTO ads.marketing_content_asset_processing_jobs (
              job_id,
              asset_id,
              job_type,
              status,
              input_object_key,
              metadata
            )
            "#,
        );
        jobs_insert.push_values(&new_jobs, |mut row, pending| {
            row.push_bind(pending.job.job_id)
                .push_bind(pending.job.asset_id)
                .push("'analysis'")
                .push("'queued'")
                .push_bind(&pending.input_object_key)
                .push_bind(&pending.metadata);
        });
        jobs_insert
            .build()
            .execute(&mut *tx)
            .await
            .map_err(|err| map_write_error(err, "create analysis cache hydration jobs failed"))?;

        let mut events_insert = QueryBuilder::<Postgres>::new(
            "INSERT INTO ads.marketing_content_asset_events \
             (asset_id, event_type, actor, message, payload) ",
        );
        events_insert.push_values(&new_jobs, |mut row, pending| {
            row.push_bind(pending.job.asset_id)
                .push("'analysis_cache_hydration_queued'")
                .push_bind(actor)
                .push("'已创建结构化视频理解回填任务'")
                .push_bind(&pending.event_payload);
        });
        events_insert
            .build()
            .execute(&mut *tx)
            .await
            .map_err(|err| {
                map_write_error(err, "insert analysis hydration queued events failed")
            })?;

        result
            .created_jobs
            .extend(new_jobs.iter().map(|pending| pending.job));
    }

    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit content asset analysis cache hydration transaction failed",
        )
    })?;
    Ok(result)
}
