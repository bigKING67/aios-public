use sqlx::PgPool;

use super::row_values::collect_optional_strings;

pub(super) async fn query_roles_auth(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT r.name
        FROM auth_user_roles ur
        JOIN auth_roles r ON r.id = ur.role_id
        WHERE CAST(ur.user_id AS TEXT) = $1
        ORDER BY r.name
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(collect_optional_strings(rows, "name"))
}

pub(super) async fn query_roles_users(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT r.name
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
        ORDER BY r.name
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(collect_optional_strings(rows, "name"))
}

pub(super) async fn query_roles_ods(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT r.name
        FROM ods_aios_user_roles ur
        JOIN ods_aios_roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
          AND COALESCE(r.is_active, TRUE) = TRUE
          AND COALESCE(r.is_deleted, FALSE) = FALSE
          AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
        ORDER BY r.name
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(collect_optional_strings(rows, "name"))
}
