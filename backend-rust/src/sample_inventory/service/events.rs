use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::{Postgres, Row, Transaction};
use tracing::error;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub(super) struct LockedSample {
    pub(super) id: i64,
    pub(super) sample_code: String,
    pub(super) on_hand_quantity: i32,
    pub(super) reserved_quantity: i32,
    pub(super) version: i64,
}

pub(super) fn database_error(error_value: sqlx::Error, operation: &'static str) -> AppError {
    error!(error = ?error_value, operation, "sample inventory transaction failed");
    AppError::Internal
}

pub(super) async fn lock_sample(
    tx: &mut Transaction<'_, Postgres>,
    sample_id: i64,
) -> AppResult<LockedSample> {
    let row = sqlx::query(
        r#"
        SELECT id, sample_code, on_hand_quantity, reserved_quantity, version
        FROM sample_inventory.samples
        WHERE id = $1 AND archived_at IS NULL
        FOR UPDATE
        "#,
    )
    .bind(sample_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "lock_sample"))?
    .ok_or(AppError::NotFound)?;
    Ok(LockedSample {
        id: row
            .try_get("id")
            .map_err(|error| database_error(error, "map_locked_sample"))?,
        sample_code: row
            .try_get("sample_code")
            .map_err(|error| database_error(error, "map_locked_sample"))?,
        on_hand_quantity: row
            .try_get("on_hand_quantity")
            .map_err(|error| database_error(error, "map_locked_sample"))?,
        reserved_quantity: row
            .try_get("reserved_quantity")
            .map_err(|error| database_error(error, "map_locked_sample"))?,
        version: row
            .try_get("version")
            .map_err(|error| database_error(error, "map_locked_sample"))?,
    })
}

pub(super) async fn lock_sample_ids(
    tx: &mut Transaction<'_, Postgres>,
    sample_ids: &[i64],
) -> AppResult<()> {
    let mut stable_ids = sample_ids.to_vec();
    stable_ids.sort_unstable();
    stable_ids.dedup();
    let locked_ids: Vec<i64> = sqlx::query_scalar(
        r#"
        SELECT id
        FROM sample_inventory.samples
        WHERE id = ANY($1) AND archived_at IS NULL
        ORDER BY id
        FOR UPDATE
        "#,
    )
    .bind(&stable_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error(error, "lock_sample_ids"))?;
    if locked_ids.len() != stable_ids.len() {
        return Err(AppError::bad_request("批量操作包含不存在或已归档的样品"));
    }
    Ok(())
}

pub(super) async fn record_business_event(
    tx: &mut Transaction<'_, Postgres>,
    aggregate_type: &str,
    aggregate_id: i64,
    event_type: &str,
    payload: Value,
    occurred_at: DateTime<Utc>,
    actor_user_id: &str,
) -> AppResult<i64> {
    sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.business_events (
          aggregate_type,
          aggregate_id,
          event_type,
          payload,
          occurred_at,
          actor_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(aggregate_type)
    .bind(aggregate_id.to_string())
    .bind(event_type)
    .bind(payload)
    .bind(occurred_at)
    .bind(actor_user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "record_business_event"))
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn record_movement(
    tx: &mut Transaction<'_, Postgres>,
    sample_id: i64,
    sample_code: &str,
    movement_type: &str,
    on_hand_delta: i32,
    reserved_delta: i32,
    resulting_on_hand_quantity: i32,
    resulting_reserved_quantity: i32,
    source_type: &str,
    source_id: i64,
    occurred_at: DateTime<Utc>,
    actor_user_id: &str,
    metadata: Value,
) -> AppResult<i64> {
    let movement_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.inventory_movements (
          sample_id,
          movement_type,
          on_hand_delta,
          reserved_delta,
          resulting_on_hand_quantity,
          resulting_reserved_quantity,
          source_type,
          source_id,
          occurred_at,
          actor_user_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
        "#,
    )
    .bind(sample_id)
    .bind(movement_type)
    .bind(on_hand_delta)
    .bind(reserved_delta)
    .bind(resulting_on_hand_quantity)
    .bind(resulting_reserved_quantity)
    .bind(source_type)
    .bind(source_id.to_string())
    .bind(occurred_at)
    .bind(actor_user_id)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error(error, "record_movement"))?;

    record_business_event(
        tx,
        "sample",
        sample_id,
        "inventory.movement.recorded",
        json!({
            "movementId": movement_id,
            "sampleId": sample_id,
            "sampleCode": sample_code,
            "movementType": movement_type,
            "onHandDelta": on_hand_delta,
            "reservedDelta": reserved_delta,
            "resultingOnHandQuantity": resulting_on_hand_quantity,
            "resultingReservedQuantity": resulting_reserved_quantity,
            "resultingAvailableQuantity": resulting_on_hand_quantity - resulting_reserved_quantity,
            "sourceType": source_type,
            "sourceId": source_id.to_string(),
        }),
        occurred_at,
        actor_user_id,
    )
    .await?;
    Ok(movement_id)
}
