use uuid::Uuid;

use super::common::{runtime_schema_name, runtime_table};
use crate::state::AppState;

pub(crate) async fn try_acquire_postgres_lock(
    state: &AppState,
    lock_namespace: &str,
    lock_key: &str,
    ttl_ms: i64,
) -> Result<bool, String> {
    let schema = runtime_schema_name()?;
    let table = runtime_table(schema.as_str(), "runtime_trigger_locks")?;
    let owner_token = Uuid::new_v4().simple().to_string();
    let ttl_ms = ttl_ms.max(1_000);

    let cleanup_query = format!("DELETE FROM {table} WHERE expires_at <= NOW()");
    sqlx::query(cleanup_query.as_str())
        .execute(&state.pool)
        .await
        .map_err(|error| format!("runtime lock cleanup failed: {error}"))?;

    let lock_query = format!(
        r#"
        INSERT INTO {table} AS locks (lock_namespace, lock_key, owner_token, acquired_at, expires_at)
        VALUES ($1, $2, $3, NOW(), NOW() + ($4::BIGINT * INTERVAL '1 millisecond'))
        ON CONFLICT (lock_namespace, lock_key) DO UPDATE
          SET owner_token = EXCLUDED.owner_token,
              acquired_at = EXCLUDED.acquired_at,
              expires_at = EXCLUDED.expires_at
        WHERE locks.expires_at <= NOW()
        RETURNING owner_token
        "#
    );

    let acquired = sqlx::query(lock_query.as_str())
        .bind(lock_namespace)
        .bind(lock_key)
        .bind(owner_token)
        .bind(ttl_ms)
        .fetch_optional(&state.pool)
        .await
        .map_err(|error| format!("runtime lock acquire failed: {error}"))?
        .is_some();

    Ok(acquired)
}
