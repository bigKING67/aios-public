use sqlx::PgPool;

use crate::error::AppResult;

use super::super::errors::map_sql_error;

pub(in crate::marketing::bd_accounts) async fn ensure_user_role(
    pool: &PgPool,
    user_id: &str,
    role_name: &str,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO auth_user_roles (user_id, role_id)
        SELECT user_item.id, role.id
        FROM auth_users user_item
        JOIN auth_roles role ON LOWER(role.name) = LOWER($2)
        WHERE CAST(user_item.id AS TEXT) = $1
          AND NOT EXISTS (
            SELECT 1
            FROM auth_user_roles existing
            WHERE existing.user_id = user_item.id
              AND existing.role_id = role.id
          )
        "#,
    )
    .bind(user_id)
    .bind(role_name)
    .execute(pool)
    .await
    .map_err(map_sql_error("assign creator library BD role failed"))?;
    Ok(())
}
