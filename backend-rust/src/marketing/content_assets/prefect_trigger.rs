use std::sync::Arc;

use serde_json::{json, Map, Value};
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::{
    dataops::prefect::{
        create_flow_run_by_deployment_id, get_deployment_by_name, PrefectRunCreateResult,
    },
    error::AppResult,
    state::AppState,
};

use super::{events::insert_event, write_errors::map_write_error};

struct ContentAssetWorkerDeployment {
    flow_name: &'static str,
    deployment_name: &'static str,
    label: &'static str,
}

const CONTENT_ASSET_ANALYSIS_DEPLOYMENT: ContentAssetWorkerDeployment =
    ContentAssetWorkerDeployment {
        flow_name: "process-marketing-content-asset-analysis-jobs",
        deployment_name: "marketing-content-asset-analysis-jobs",
        label: "AI 分析",
    };

pub(crate) const CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT: i64 = 10;

pub(super) fn spawn_processing_job_prefect_trigger(
    state: Arc<AppState>,
    asset_id: Uuid,
    job_id: Uuid,
    job_type: &str,
) {
    let Some(target) = deployment_for_job_type(job_type) else {
        return;
    };
    let job_type = job_type.to_string();
    tokio::spawn(async move {
        let result =
            trigger_processing_job_worker(&state, asset_id, job_id, &job_type, &target).await;
        if let Err(error) = result {
            warn!(
                ?error,
                %asset_id,
                %job_id,
                job_type = %job_type,
                "content asset worker trigger bookkeeping failed"
            );
        }
    });
}

async fn trigger_processing_job_worker(
    state: &Arc<AppState>,
    asset_id: Uuid,
    job_id: Uuid,
    job_type: &str,
    target: &ContentAssetWorkerDeployment,
) -> AppResult<()> {
    let run_name = format!("content-asset-{job_type}-{job_id}");
    match create_prefect_flow_run(state, run_name.as_str(), 10, target).await {
        Ok(flow_run) => {
            record_prefect_trigger_success(&state.pool, asset_id, job_id, target, &flow_run)
                .await?;
            info!(
                %asset_id,
                %job_id,
                job_type = %job_type,
                deployment = target.deployment_name,
                flow_run_id = flow_run.id.as_deref().unwrap_or(""),
                "content asset worker flow run triggered"
            );
        }
        Err(message) => {
            record_prefect_trigger_failure(&state.pool, asset_id, job_id, target, message.as_str())
                .await?;
            warn!(
                %asset_id,
                %job_id,
                job_type = %job_type,
                deployment = target.deployment_name,
                error = %message,
                "content asset worker flow run trigger failed"
            );
        }
    }
    Ok(())
}

async fn create_prefect_flow_run(
    state: &Arc<AppState>,
    run_name: &str,
    limit: i64,
    target: &ContentAssetWorkerDeployment,
) -> Result<PrefectRunCreateResult, String> {
    let deployment = get_deployment_by_name(state, target.flow_name, target.deployment_name)
        .await
        .map_err(|error| error.message)?;
    let deployment = deployment.ok_or_else(|| {
        format!(
            "Prefect deployment 不存在：{}/{}",
            target.flow_name, target.deployment_name
        )
    })?;
    let mut parameters = Map::<String, Value>::new();
    parameters.insert("limit".to_string(), json!(limit));
    create_flow_run_by_deployment_id(state, deployment.id.as_str(), run_name, parameters)
        .await
        .map_err(|error| error.message)
}

pub(crate) async fn trigger_analysis_batch_prefect_worker(
    state: &Arc<AppState>,
) -> Result<PrefectRunCreateResult, String> {
    let run_name = format!("content-asset-analysis-batch-{}", Uuid::new_v4());
    let flow_run = create_prefect_flow_run(
        state,
        run_name.as_str(),
        CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT,
        &CONTENT_ASSET_ANALYSIS_DEPLOYMENT,
    )
    .await?;
    info!(
        deployment = CONTENT_ASSET_ANALYSIS_DEPLOYMENT.deployment_name,
        flow_run_id = flow_run.id.as_deref().unwrap_or(""),
        limit = CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT,
        "content asset analysis batch worker flow run triggered"
    );
    Ok(flow_run)
}

async fn record_prefect_trigger_success(
    pool: &PgPool,
    asset_id: Uuid,
    job_id: Uuid,
    target: &ContentAssetWorkerDeployment,
    flow_run: &PrefectRunCreateResult,
) -> AppResult<()> {
    let flow_run_id = flow_run.id.as_deref();
    let flow_run_name = flow_run.name.as_deref();
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_processing_jobs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'prefect_trigger_status', 'created',
              'prefect_triggered_at', CURRENT_TIMESTAMP,
              'prefect_flow_name', $2,
              'prefect_deployment_name', $3,
              'prefect_flow_run_id', $4,
              'prefect_flow_run_name', $5
            )
        WHERE job_id = $1
        "#,
    )
    .bind(job_id)
    .bind(target.flow_name)
    .bind(target.deployment_name)
    .bind(flow_run_id)
    .bind(flow_run_name)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "record content asset prefect trigger success failed"))?;
    insert_event(
        pool,
        asset_id,
        "processing_job_worker_triggered",
        Some("aios-api"),
        Some("已主动触发处理 worker"),
        json!({
          "jobId": job_id,
          "flowName": target.flow_name,
          "deploymentName": target.deployment_name,
          "flowRunId": flow_run_id,
          "flowRunName": flow_run_name,
          "workerLabel": target.label,
        }),
    )
    .await
}

async fn record_prefect_trigger_failure(
    pool: &PgPool,
    asset_id: Uuid,
    job_id: Uuid,
    target: &ContentAssetWorkerDeployment,
    message: &str,
) -> AppResult<()> {
    let trimmed_message = message.chars().take(500).collect::<String>();
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_processing_jobs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'prefect_trigger_status', 'failed',
              'prefect_triggered_at', CURRENT_TIMESTAMP,
              'prefect_flow_name', $2,
              'prefect_deployment_name', $3,
              'prefect_trigger_error', $4
            )
        WHERE job_id = $1
        "#,
    )
    .bind(job_id)
    .bind(target.flow_name)
    .bind(target.deployment_name)
    .bind(&trimmed_message)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "record content asset prefect trigger failure failed"))?;
    insert_event(
        pool,
        asset_id,
        "processing_job_worker_trigger_failed",
        Some("aios-api"),
        Some("主动触发处理 worker 失败，将等待定时调度"),
        json!({
          "jobId": job_id,
          "flowName": target.flow_name,
          "deploymentName": target.deployment_name,
          "error": trimmed_message,
          "workerLabel": target.label,
        }),
    )
    .await
}

fn deployment_for_job_type(job_type: &str) -> Option<ContentAssetWorkerDeployment> {
    match job_type {
        "analysis" => Some(ContentAssetWorkerDeployment {
            flow_name: "process-marketing-content-asset-analysis-jobs",
            deployment_name: "marketing-content-asset-analysis-jobs",
            label: "AI 分析",
        }),
        "transcript" => Some(ContentAssetWorkerDeployment {
            flow_name: "process-marketing-content-asset-transcript-jobs",
            deployment_name: "marketing-content-asset-transcript-jobs",
            label: "脚本/SRT",
        }),
        "preview" | "cover" | "frames" => Some(ContentAssetWorkerDeployment {
            flow_name: "process-marketing-content-asset-jobs",
            deployment_name: "marketing-content-asset-processing-jobs",
            label: "预览/封面",
        }),
        _ => None,
    }
}
