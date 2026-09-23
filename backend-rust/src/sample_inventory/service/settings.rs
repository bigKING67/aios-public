use chrono::Utc;
use serde_json::json;
use sqlx::{PgPool, Row};

use crate::error::{AppError, AppResult};

use super::events::{database_error, record_business_event};
use super::idempotency::{
    claim_mutation, complete_mutation, normalize_submission_key, replay_response, request_sha256,
    MutationClaim,
};
use crate::sample_inventory::types::{
    SampleInventorySettingsResponse, UpdateSampleInventorySettingsRequest,
};

pub(crate) async fn update_settings(
    pool: &PgPool,
    mut input: UpdateSampleInventorySettingsRequest,
    actor_user_id: &str,
) -> AppResult<SampleInventorySettingsResponse> {
    normalize_submission_key(&mut input.submission_key)?;
    if input.expected_version <= 0
        || input.low_stock_threshold.is_some_and(|value| value < 0)
        || input
            .refresh_interval_seconds
            .is_some_and(|value| !(0..=3600).contains(&value))
    {
        return Err(AppError::bad_request("样品库存设置参数无效"));
    }
    if input.low_stock_threshold.is_none() && input.refresh_interval_seconds.is_none() {
        return Err(AppError::bad_request("至少需要修改一项设置"));
    }
    let request_sha = request_sha256(&input)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error(error, "begin_update_settings"))?;
    let mutation_id = match claim_mutation(
        &mut tx,
        "settings.update",
        &input.submission_key,
        &request_sha,
        actor_user_id,
    )
    .await?
    {
        MutationClaim::Replay(response) => {
            let response = replay_response(response)?;
            tx.commit()
                .await
                .map_err(|error| database_error(error, "commit_replay_update_settings"))?;
            return Ok(response);
        }
        MutationClaim::New(id) => id,
    };
    let row = sqlx::query(
        r#"
        UPDATE sample_inventory.settings
        SET
          low_stock_threshold = COALESCE($1, low_stock_threshold),
          refresh_interval_seconds = COALESCE($2, refresh_interval_seconds),
          updated_by = $3,
          version = version + 1
        WHERE id = 1 AND version = $4
        RETURNING
          low_stock_threshold,
          refresh_interval_seconds,
          version,
          updated_at::TEXT AS updated_at
        "#,
    )
    .bind(input.low_stock_threshold)
    .bind(input.refresh_interval_seconds)
    .bind(actor_user_id)
    .bind(input.expected_version)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| database_error(error, "update_settings"))?;
    let Some(row) = row else {
        return Err(AppError::Conflict(
            "设置已被其他人更新，请刷新后重试".to_string(),
        ));
    };
    let response = SampleInventorySettingsResponse {
        low_stock_threshold: row
            .try_get("low_stock_threshold")
            .map_err(|error| database_error(error, "map_settings"))?,
        refresh_interval_seconds: row
            .try_get("refresh_interval_seconds")
            .map_err(|error| database_error(error, "map_settings"))?,
        version: row
            .try_get("version")
            .map_err(|error| database_error(error, "map_settings"))?,
        updated_at: row
            .try_get("updated_at")
            .map_err(|error| database_error(error, "map_settings"))?,
    };
    record_business_event(
        &mut tx,
        "settings",
        1,
        "settings.updated",
        json!({
            "version": response.version,
            "lowStockThreshold": input.low_stock_threshold,
            "refreshIntervalSeconds": input.refresh_interval_seconds,
        }),
        Utc::now(),
        actor_user_id,
    )
    .await?;
    complete_mutation(&mut tx, mutation_id, &response).await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, "commit_update_settings"))?;
    Ok(response)
}
