use sqlx::PgPool;

use crate::error::AppResult;

use super::errors::map_sql_error;

pub(super) async fn upsert_bd_identity(
    pool: &PgPool,
    user_id: &str,
    username: &str,
    display_name: &str,
    owner_alias: &str,
) -> AppResult<()> {
    let owner_alias_norm = owner_alias.trim().to_lowercase();
    sqlx::query(
        r#"
        INSERT INTO ads.creator_library_bd_identity (
          user_id,
          username,
          display_name,
          owner_alias,
          owner_alias_norm,
          is_primary,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
        ON CONFLICT (owner_alias_norm) WHERE is_active = TRUE
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          owner_alias = EXCLUDED.owner_alias,
          is_primary = TRUE,
          updated_at = NOW()
        "#,
    )
    .bind(user_id)
    .bind(username)
    .bind(display_name)
    .bind(owner_alias)
    .bind(owner_alias_norm)
    .execute(pool)
    .await
    .map_err(map_sql_error("upsert creator library BD identity failed"))?;
    Ok(())
}
