use sqlx::PgPool;
use tokio::task::JoinSet;
use uuid::Uuid;

use crate::{error::AppResult, marketing};

use super::{BrandAiBackfillAsset, NormalizedIndustryMaterialBrandAiBackfill};

pub(super) const MODEL_ANALYSIS_ENQUEUE_CONCURRENCY: usize = 8;

#[derive(Debug, Default)]
pub(super) struct BrandAiBackfillEnqueueResult {
    pub(super) queued_jobs: i64,
    pub(super) queued_cache_hydration_jobs: i64,
    pub(super) queued_model_analysis_jobs: i64,
    pub(super) skipped_ready_assets: i64,
    pub(super) skipped_running_jobs: i64,
    pub(super) skipped_no_input: i64,
    pub(super) skipped_existing_jobs: i64,
}

pub(super) async fn enqueue_brand_ai_backfill_jobs(
    pool: &PgPool,
    asset_rows: &[BrandAiBackfillAsset],
    request: &NormalizedIndustryMaterialBrandAiBackfill,
    actor: Option<&str>,
) -> AppResult<BrandAiBackfillEnqueueResult> {
    let mut result = BrandAiBackfillEnqueueResult::default();
    let mut hydration_asset_ids = Vec::new();
    let mut model_asset_ids = Vec::new();

    for asset in asset_rows {
        if hydration_asset_ids.len() + model_asset_ids.len() >= request.limit as usize {
            break;
        }
        if asset.has_structured_video_understanding {
            continue;
        }
        if asset.active_job_status.is_some() {
            result.skipped_running_jobs += 1;
            continue;
        }
        if !asset.has_analysis_artifact && !asset.has_input {
            result.skipped_no_input += 1;
            continue;
        }
        if asset.has_analysis_artifact {
            hydration_asset_ids.push(asset.asset_id);
        } else {
            model_asset_ids.push(asset.asset_id);
        }
    }

    if !hydration_asset_ids.is_empty() {
        let hydration = marketing::create_analysis_cache_hydration_jobs_for_assets(
            pool,
            &hydration_asset_ids,
            request.source.as_str(),
            request.profile.as_deref(),
            actor,
        )
        .await?;
        result.queued_cache_hydration_jobs = hydration.created_jobs.len() as i64;
        result.queued_jobs += result.queued_cache_hydration_jobs;
        result.skipped_running_jobs +=
            (hydration.existing_jobs.len() + hydration.conflicting_asset_ids.len()) as i64;
        result.skipped_no_input += (hydration.missing_artifact_asset_ids.len()
            + hydration.not_found_asset_ids.len()) as i64;
    }

    enqueue_model_analysis_jobs(pool, model_asset_ids, request, actor, &mut result).await?;
    Ok(result)
}

async fn enqueue_model_analysis_jobs(
    pool: &PgPool,
    asset_ids: Vec<Uuid>,
    request: &NormalizedIndustryMaterialBrandAiBackfill,
    actor: Option<&str>,
    result: &mut BrandAiBackfillEnqueueResult,
) -> AppResult<()> {
    let mut queue = asset_ids.into_iter();
    let mut join_set = JoinSet::new();

    loop {
        while join_set.len() < MODEL_ANALYSIS_ENQUEUE_CONCURRENCY {
            let Some(asset_id) = queue.next() else {
                break;
            };
            let pool = pool.clone();
            let source = request.source.clone();
            let profile = request.profile.clone();
            let actor = actor.map(str::to_string);
            join_set.spawn(async move {
                marketing::create_content_asset_analysis_processing_job(
                    &pool,
                    asset_id,
                    source.as_str(),
                    profile.as_deref(),
                    false,
                    actor.as_deref(),
                )
                .await
            });
        }

        if join_set.is_empty() {
            break;
        }

        let Some(joined) = join_set.join_next().await else {
            break;
        };
        let enqueue_result = joined.map_err(|_| crate::error::AppError::Internal)?;
        match enqueue_result {
            Ok(_) => {
                result.queued_jobs += 1;
                result.queued_model_analysis_jobs += 1;
            }
            Err(crate::error::AppError::Conflict(message))
                if message.contains("运行中") || message.contains("排队中") =>
            {
                result.skipped_running_jobs += 1;
            }
            Err(crate::error::AppError::Conflict(message)) if message.contains("已有") => {
                result.skipped_ready_assets += 1;
            }
            Err(crate::error::AppError::Conflict(_)) => {
                result.skipped_existing_jobs += 1;
            }
            Err(crate::error::AppError::BadRequest(message))
                if message.contains("无法创建")
                    || message.contains("没有可用")
                    || message.contains("尚未上传")
                    || message.contains("视频超过 30 分钟")
                    || message.contains("缺少可分析")
                    || message.contains("缺少 preview")
                    || message.contains("缺少 raw") =>
            {
                result.skipped_no_input += 1;
            }
            Err(crate::error::AppError::NotFound) => {
                result.skipped_no_input += 1;
            }
            Err(error) => return Err(error),
        }
    }

    Ok(())
}
