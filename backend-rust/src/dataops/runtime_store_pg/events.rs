use serde::{de::DeserializeOwned, Serialize};
use sqlx::types::Json;

use super::common::{deserialize_payload_rows, runtime_schema_name, runtime_table};
use crate::state::AppState;

pub(crate) async fn append_postgres_payload_event<T: Serialize>(
    state: &AppState,
    table_name: &str,
    id: &str,
    payload: &T,
) -> Result<(), String> {
    let schema = runtime_schema_name()?;
    let table = runtime_table(schema.as_str(), table_name)?;
    let payload = serde_json::to_value(payload)
        .map_err(|error| format!("runtime payload serialization failed: {error}"))?;
    if table_name == "runtime_notification_events" {
        let reason_hash = payload
            .get("reasonHash")
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string);
        let retry_group_id = payload
            .get("retryGroupId")
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string);
        let query = format!(
            r#"
            INSERT INTO {table} (id, event_at, payload, reason_hash, retry_group_id)
            VALUES ($1, NOW(), $2, $3, $4)
            ON CONFLICT (id) DO UPDATE
              SET event_at = EXCLUDED.event_at,
                  payload = EXCLUDED.payload,
                  reason_hash = EXCLUDED.reason_hash,
                  retry_group_id = EXCLUDED.retry_group_id
            "#
        );

        sqlx::query(query.as_str())
            .bind(id)
            .bind(Json(payload))
            .bind(reason_hash)
            .bind(retry_group_id)
            .execute(&state.pool)
            .await
            .map_err(|error| format!("runtime notification payload insert failed: {error}"))?;
    } else {
        let query = format!(
            r#"
            INSERT INTO {table} (id, event_at, payload)
            VALUES ($1, NOW(), $2)
            ON CONFLICT (id) DO UPDATE
              SET event_at = EXCLUDED.event_at,
                  payload = EXCLUDED.payload
            "#
        );

        sqlx::query(query.as_str())
            .bind(id)
            .bind(Json(payload))
            .execute(&state.pool)
            .await
            .map_err(|error| format!("runtime payload insert failed: {error}"))?;
    }

    Ok(())
}

pub(crate) async fn list_postgres_payload_events<T: DeserializeOwned>(
    state: &AppState,
    table_name: &str,
    limit: usize,
) -> Result<Vec<T>, String> {
    let schema = runtime_schema_name()?;
    let table = runtime_table(schema.as_str(), table_name)?;
    let query = format!("SELECT payload FROM {table} ORDER BY event_at DESC, id DESC LIMIT $1");
    let rows = sqlx::query(query.as_str())
        .bind(limit as i64)
        .fetch_all(&state.pool)
        .await
        .map_err(|error| format!("runtime payload list failed: {error}"))?;

    deserialize_payload_rows(rows)
}

pub(crate) async fn delete_postgres_payload_event(
    state: &AppState,
    table_name: &str,
    id: &str,
) -> Result<bool, String> {
    let schema = runtime_schema_name()?;
    let table = runtime_table(schema.as_str(), table_name)?;
    let query = format!("DELETE FROM {table} WHERE id = $1");
    let result = sqlx::query(query.as_str())
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|error| format!("runtime payload delete failed: {error}"))?;

    Ok(result.rows_affected() > 0)
}
