use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppResult;

use super::write_errors::map_write_error;

pub(super) async fn insert_event(
    pool: &PgPool,
    asset_id: Uuid,
    event_type: &str,
    actor: Option<&str>,
    message: Option<&str>,
    payload: serde_json::Value,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(asset_id)
    .bind(event_type)
    .bind(actor)
    .bind(message)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "insert marketing content asset event failed"))?;
    Ok(())
}

pub(super) async fn insert_event_tx(
    executor: &mut Transaction<'_, Postgres>,
    asset_id: Uuid,
    event_type: &str,
    actor: Option<&str>,
    message: Option<&str>,
    payload: serde_json::Value,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(asset_id)
    .bind(event_type)
    .bind(actor)
    .bind(message)
    .bind(payload)
    .execute(&mut **executor)
    .await
    .map_err(|err| map_write_error(err, "insert marketing content asset event failed"))?;
    Ok(())
}
