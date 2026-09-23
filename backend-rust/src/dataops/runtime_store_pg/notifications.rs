use super::super::types::DataOpsNotificationEvent;
use super::common::{deserialize_payload_rows, runtime_schema_name, runtime_table};
use crate::state::AppState;

pub(crate) async fn list_postgres_notification_events_by_retry_group(
    state: &AppState,
    retry_group_id: &str,
    limit: usize,
) -> Result<Vec<DataOpsNotificationEvent>, String> {
    let schema = runtime_schema_name()?;
    let table = runtime_table(schema.as_str(), "runtime_notification_events")?;
    let query = format!(
        r#"
        SELECT payload
        FROM {table}
        WHERE COALESCE(retry_group_id, payload->>'retryGroupId', '') = $1
        ORDER BY event_at DESC, id DESC
        LIMIT $2
        "#
    );
    let rows = sqlx::query(query.as_str())
        .bind(retry_group_id)
        .bind(limit as i64)
        .fetch_all(&state.pool)
        .await
        .map_err(|error| format!("runtime notification trace query failed: {error}"))?;

    deserialize_payload_rows(rows)
}
